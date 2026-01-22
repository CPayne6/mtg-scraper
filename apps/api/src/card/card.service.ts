import { Injectable, Logger } from '@nestjs/common';
import { CacheService, CardWithStore, QueueService, StoreService } from '@scoutlgs/core';
import { CardSearchResponse, StoreInfo, PriceStats, StoreError } from '@scoutlgs/shared';
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
    // Try to get cached data (including store errors)
    const cachedResult = await this.cacheService.getCachedResult(cardName);

    // Determine if we need to scrape and which stores
    let storesToScrape: string[] | undefined;

    if (cachedResult) {
      // Check if there are store errors that need retrying (max 2 retries per store)
      const retryableErrors = cachedResult.storeErrors?.filter(
        (e) => (e.retryCount ?? 0) < MAX_STORE_RETRIES,
      );

      if (retryableErrors && retryableErrors.length > 0) {
        storesToScrape = retryableErrors.map((e) => e.storeName);
        this.logger.log(
          `Cached data for ${cardName} has ${retryableErrors.length} retryable store error(s), retrying: ${storesToScrape.join(', ')}`,
        );
      } else {
        // No retryable store errors - serve from cache
        if (cachedResult.storeErrors?.length) {
          this.logger.debug(
            `Serving ${cardName} from cache (${cachedResult.storeErrors.length} store(s) exceeded max retries)`,
          );
        } else {
          this.logger.debug(`Serving ${cardName} from cache`);
        }
        return this.buildResponse(cardName, cachedResult.results, cachedResult.storeErrors);
      }
    }

    // Check if already being scraped by another request
    const isBeingScraped = await this.cacheService.isBeingScraped(cardName);

    if (isBeingScraped) {
      // Another request is already scraping this card - wait for it
      this.logger.log(`${cardName} is already being scraped, waiting for completion`);
      await this.cacheService.waitForScrapeCompletion(cardName);
      const result = await this.cacheService.getCachedResult(cardName);
      return this.buildResponse(cardName, result?.results || [], result?.storeErrors);
    }

    // Mark as being scraped and enqueue job
    const requestId = randomUUID();
    const marked = await this.cacheService.markAsBeingScraped(cardName, requestId);

    if (!marked) {
      // Race condition: another request just marked it - wait for that request
      this.logger.log(`${cardName} was just marked by another request, waiting for completion`);
      await this.cacheService.waitForScrapeCompletion(cardName);
      const result = await this.cacheService.getCachedResult(cardName);
      return this.buildResponse(cardName, result?.results || [], result?.storeErrors);
    }

    // We successfully marked it - enqueue the scrape job (with specific stores if retrying)
    // Get the retryable errors to pass along for retry count tracking
    const retryableErrors = cachedResult?.storeErrors?.filter(
      (e) => (e.retryCount ?? 0) < MAX_STORE_RETRIES,
    );

    if (storesToScrape) {
      this.logger.log(`Enqueueing retry scrape for ${cardName}, stores: ${storesToScrape.join(', ')} (Request ID: ${requestId})`);
    } else {
      this.logger.log(`Cache miss for ${cardName}, enqueueing scrape job (Request ID: ${requestId})`);
    }
    await this.queueService.enqueueScrapeJob(cardName, 10, requestId, storesToScrape, retryableErrors);

    // Wait for the scrape to complete
    await this.cacheService.waitForScrapeCompletion(cardName);
    const result = await this.cacheService.getCachedResult(cardName);
    return this.buildResponse(cardName, result?.results || [], result?.storeErrors);
  }

  private async buildResponse(
    cardName: string,
    cards: CardWithStore[],
    storeErrors?: StoreError[],
  ): Promise<CardSearchResponse> {
    // Get all active stores from database (uses server-side cache)
    const allStores = await this.storeService.findAllActive();

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
      storeErrors: storeErrors?.length ? storeErrors : undefined,
    };
  }
}
