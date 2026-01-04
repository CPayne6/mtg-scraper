import { Injectable, Logger } from '@nestjs/common';
import { CacheService, CardWithStore, QueueService, StoreService } from '@mtg-scraper/core';
import { CardSearchResponse, StoreInfo, PriceStats } from '@mtg-scraper/shared';
import { randomUUID } from 'crypto';

@Injectable()
export class CardService {
  private readonly logger = new Logger(CardService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly queueService: QueueService,
    private readonly storeService: StoreService,
  ) {}

  async getCardByName(cardName: string): Promise<CardSearchResponse> {
    // Try to get cached data
    const cachedCards = await this.cacheService.getCard(cardName);

    if (cachedCards) {
      // Serve from cache
      this.logger.debug(`Serving ${cardName} from cache`);
      return this.buildResponse(cardName, cachedCards);
    }

    // Check if already being scraped by another request
    const isBeingScraped = await this.cacheService.isBeingScraped(cardName);

    if (isBeingScraped) {
      // Another request is already scraping this card - wait for it
      this.logger.log(`${cardName} is already being scraped, waiting for completion`);
      const cards = await this.cacheService.waitForScrapeCompletion(cardName);
      return this.buildResponse(cardName, cards || []);
    }

    // Mark as being scraped and enqueue job
    const requestId = randomUUID();
    const marked = await this.cacheService.markAsBeingScraped(cardName, requestId);

    if (!marked) {
      // Race condition: another request just marked it - wait for that request
      this.logger.log(`${cardName} was just marked by another request, waiting for completion`);
      const cards = await this.cacheService.waitForScrapeCompletion(cardName);
      return this.buildResponse(cardName, cards || []);
    }

    // We successfully marked it - enqueue the scrape job
    this.logger.log(`Cache miss for ${cardName}, enqueueing scrape job (Request ID: ${requestId})`);
    await this.queueService.enqueueScrapeJob(cardName, 10, requestId);

    // Wait for the scrape to complete
    const cards = await this.cacheService.waitForScrapeCompletion(cardName);
    return this.buildResponse(cardName, cards || []);
  }

  private async buildResponse(
    cardName: string,
    cards: CardWithStore[],
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
    };
  }
}
