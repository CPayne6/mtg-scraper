import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CacheService, CardWithStore, QueueService, StoreService, Card, CardName, Store } from '@scoutlgs/core';
import { CardSearchResponse, StoreInfo, PriceStats, Condition } from '@scoutlgs/shared';
import { randomUUID } from 'crypto';

const MAX_STORE_RETRIES = 2;

@Injectable()
export class CardService {
  private readonly logger = new Logger(CardService.name);
  private readonly useDatabaseFirst: boolean;

  constructor(
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(CardName)
    private readonly cardNameRepository: Repository<CardName>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly cacheService: CacheService,
    private readonly queueService: QueueService,
    private readonly storeService: StoreService,
    private readonly configService: ConfigService,
  ) {
    this.useDatabaseFirst = this.configService.get<boolean>('useDatabaseFirst') ?? false;
    if (this.useDatabaseFirst) {
      this.logger.log('Using database-first approach (V2 scraping)');
    }
  }

  async getCardByName(cardName: string): Promise<CardSearchResponse> {
    // Use database-first approach if enabled
    if (this.useDatabaseFirst) {
      return this.getCardFromDatabase(cardName);
    }

    // Otherwise, use the cache-first approach (V1)
    return this.getCardFromCache(cardName);
  }

  /**
   * V2: Database-first approach - query cards table directly.
   * Results are pre-scraped via discovery/extraction pipeline.
   */
  private async getCardFromDatabase(cardName: string): Promise<CardSearchResponse> {
    this.logger.debug(`[V2] Querying database for: ${cardName}`);

    // Normalize card name for lookup
    const normalizedName = this.normalizeCardName(cardName);

    // Find card name record
    const cardNameRecord = await this.cardNameRepository.findOne({
      where: { normalizedName },
    });

    if (!cardNameRecord) {
      this.logger.debug(`[V2] Card name not found: ${cardName}`);
      return this.buildEmptyResponse(cardName);
    }

    // Query all cards for this card name, join with store info
    const cards = await this.cardRepository
      .createQueryBuilder('card')
      .leftJoinAndSelect('card.store', 'store')
      .where('card.card_name_id = :cardNameId', { cardNameId: cardNameRecord.id })
      .andWhere('card.in_stock = true')
      .orderBy('card.price', 'ASC')
      .getMany();

    this.logger.log(`[V2] Found ${cards.length} results for: ${cardName}`);

    // Convert to CardWithStore format
    const cardResults: CardWithStore[] = cards.map((card) => ({
      price: Number(card.price),
      condition: card.condition as Condition,
      foil: card.foil,
      image: card.imageUrl || '',
      title: card.title,
      currency: card.currency,
      link: card.productLink,
      set: card.setName || '',
      card_number: card.collectorNumber || '',
      store: card.store.displayName,
    }));

    // Get all stores that have results
    const storesWithCards = new Set(cards.map((c) => c.store.id));
    const allStores = await this.storeService.findAllActive();
    const storesInfo = allStores.filter((s) => storesWithCards.has(s.id));

    return this.buildResponse(cardName, cardResults, [], storesInfo);
  }

  /**
   * Normalize card name for consistent database lookups.
   */
  private normalizeCardName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }

  /**
   * Build an empty response when no cards are found.
   */
  private buildEmptyResponse(cardName: string): CardSearchResponse {
    return {
      cardName,
      stores: [],
      priceStats: { min: 0, max: 0, avg: 0, count: 0 },
      results: [],
      timestamp: Date.now(),
    };
  }

  /**
   * V1: Cache-first approach - check cache, scrape on miss.
   */
  private async getCardFromCache(cardName: string): Promise<CardSearchResponse> {
    const requestId = randomUUID();

    // 1. Get all active stores
    const allStores = await this.storeService.findAllActive();
    const storeNames = allStores.map(s => s.name); // Use slug for cache keys

    // 2. Batch check cache for all stores
    const cachedResults = await this.cacheService.getMultipleStoreCards(cardName, storeNames);

    // 3. Determine which stores need scraping and collect existing results
    const storesToScrape: string[] = [];
    const existingResults: CardWithStore[] = [];
    const storeErrors: Array<{ storeName: string; error: string }> = [];

    for (const store of allStores) {
      const cached = cachedResults.get(store.name);

      if (cached) {
        // Add results from this store
        existingResults.push(...cached.results);

        // Check if there's an error that needs retrying
        if (cached.error && (cached.retryCount ?? 0) < MAX_STORE_RETRIES) {
          storesToScrape.push(store.name);
          this.logger.debug(`Store ${store.name} has retryable error (retry ${cached.retryCount ?? 0}/${MAX_STORE_RETRIES})`);
        } else if (cached.error) {
          // Max retries exceeded - include in storeErrors response
          storeErrors.push({ storeName: store.displayName, error: cached.error });
        }
      } else {
        // Cache miss - needs scraping
        storesToScrape.push(store.name);
      }
    }

    // 4. If nothing to scrape, return cached results
    if (storesToScrape.length === 0) {
      this.logger.debug(`Serving ${cardName} from cache (all ${storeNames.length} stores cached)`);
      return this.buildResponse(cardName, existingResults, storeErrors, allStores);
    }

    this.logger.log(`${cardName}: ${storeNames.length - storesToScrape.length}/${storeNames.length} stores cached, scraping ${storesToScrape.length} store(s)`);

    // 5. Check which stores are already being scraped and mark the rest
    const storesToEnqueue: string[] = [];
    const storesToWait: string[] = [];

    for (const storeName of storesToScrape) {
      // Try to mark this store as being scraped
      const marked = await this.cacheService.markStoreAsBeingScraped(cardName, storeName, requestId);

      if (marked) {
        storesToEnqueue.push(storeName);
      } else {
        // Already being scraped by another request
        storesToWait.push(storeName);
      }
    }

    // 6. Enqueue jobs for stores we successfully marked
    if (storesToEnqueue.length > 0) {
      // Get retry counts from cached results for retrying stores
      const jobs = storesToEnqueue.map(storeName => {
        const cached = cachedResults.get(storeName);
        return {
          cardName,
          storeName,
          priority: 10, // High priority for user requests
          requestId,
          retryCount: cached?.retryCount,
        };
      });

      await this.queueService.enqueueScrapeJobsBulk(jobs);
      this.logger.log(`Enqueued ${storesToEnqueue.length} scrape job(s) for ${cardName} (Request ID: ${requestId})`);
    }

    // 7. Wait for all stores that need scraping (both enqueued and already-in-progress)
    const allStoresToWait = [...storesToEnqueue, ...storesToWait];

    if (allStoresToWait.length > 0) {
      this.logger.debug(`Waiting for ${allStoresToWait.length} store(s) to complete for ${cardName}`);

      const newResults = await this.cacheService.waitForStoresScrapeCompletion(
        cardName,
        allStoresToWait,
        60000, // 60 second timeout
      );

      // 8. Merge new results with existing cached results
      for (const [storeName, entry] of newResults) {
        if (entry) {
          existingResults.push(...entry.results);

          // Track store errors for response
          if (entry.error) {
            const store = allStores.find(s => s.name === storeName);
            storeErrors.push({
              storeName: store?.displayName ?? storeName,
              error: entry.error,
            });
          }
        }
      }
    }

    return this.buildResponse(cardName, existingResults, storeErrors, allStores);
  }

  private buildResponse(
    cardName: string,
    cards: CardWithStore[],
    storeErrors: Array<{ storeName: string; error: string }>,
    allStores: Awaited<ReturnType<StoreService['findAllActive']>>,
  ): CardSearchResponse {
    // Sort results by price (lowest first)
    cards.sort((a, b) => a.price - b.price);

    // Group cards by store and count
    const storeCardCounts = new Map<string, number>();
    for (const card of cards) {
      storeCardCounts.set(
        card.store,
        (storeCardCounts.get(card.store) || 0) + 1,
      );
    }

    // Build store info array (only stores with cards)
    const stores: StoreInfo[] = [];
    for (const store of allStores) {
      const count = storeCardCounts.get(store.displayName) || 0;
      if (count > 0) {
        stores.push({
          id: store.id,
          uuid: store.uuid,
          name: store.name,
          displayName: store.displayName,
          logoUrl: store.logoUrl,
          cardCount: count,
        });
      }
    }

    // Sort alphabetically by displayName
    stores.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Calculate price statistics
    const priceStats: PriceStats = {
      min: cards.length > 0 ? Math.min(...cards.map((c) => c.price)) : 0,
      max: cards.length > 0 ? Math.max(...cards.map((c) => c.price)) : 0,
      avg:
        cards.length > 0
          ? cards.reduce((sum, c) => sum + c.price, 0) / cards.length
          : 0,
      count: cards.length,
    };

    return {
      cardName,
      stores,
      priceStats,
      results: cards,
      timestamp: Date.now(),
      storeErrors: storeErrors.length > 0 ? storeErrors : undefined,
    };
  }
}
