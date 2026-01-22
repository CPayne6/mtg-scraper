import { Injectable, Logger } from '@nestjs/common';
import { CacheService, CardWithStore, QueueService, StoreService } from '@scoutlgs/core';
import { CardSearchResponse, StoreInfo, PriceStats } from '@scoutlgs/shared';
import { randomUUID } from 'crypto';

const MAX_STORE_RETRIES = 2;

@Injectable()
export class CardService {
  private readonly logger = new Logger(CardService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly queueService: QueueService,
    private readonly storeService: StoreService,
  ) {}

  async getCardByName(cardName: string): Promise<CardSearchResponse> {
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
