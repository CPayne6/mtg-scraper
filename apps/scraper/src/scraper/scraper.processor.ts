import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  ScrapeCardJobData,
  ScrapeCardJobResult,
  StoreError,
} from '@scoutlgs/shared';
import { CacheService } from '@scoutlgs/core';
import { ScraperService } from './scraper.service';

@Processor(QUEUE_NAMES.CARD_SCRAPE)
export class ScrapeCardProcessor {
  private readonly logger = new Logger(ScrapeCardProcessor.name);

  constructor(
    private readonly scraperService: ScraperService,
    private readonly cacheService: CacheService,
  ) {}

  @Process({
    name: JOB_NAMES.SCRAPE_CARD,
    concurrency: 3
  })
  async process(job: Job<ScrapeCardJobData>): Promise<ScrapeCardJobResult> {
    const { cardName, requestId, stores, previousErrors } = job.data;
    const isTargetedScrape = stores && stores.length > 0;

    // Build a map of previous retry counts for quick lookup
    const previousRetryCounts = new Map<string, number>();
    if (previousErrors) {
      for (const err of previousErrors) {
        previousRetryCounts.set(err.storeName, err.retryCount ?? 0);
      }
    }

    // Ensure stores are loaded before processing
    await this.scraperService.waitUntilReady();

    this.logger.log(
      `Processing scrape job for: ${cardName} (Job ID: ${job.id}, Request ID: ${requestId || 'N/A'}${isTargetedScrape ? `, Stores: ${stores.join(', ')}` : ''})`,
    );

    try {
      // Perform the scraping (for specific stores or all stores)
      const { results, storeErrors: rawStoreErrors } = await this.scraperService.searchCard(cardName, stores);

      // Increment retry counts for stores that failed again
      const storeErrors: StoreError[] = rawStoreErrors.map((err) => ({
        ...err,
        retryCount: (previousRetryCounts.get(err.storeName) ?? 0) + 1,
      }));

      if (isTargetedScrape) {
        // For targeted scrapes, merge with existing cached data
        const cached = await this.cacheService.getCachedResult(cardName);

        // Preserve the original timestamp from the initial scrape
        const originalTimestamp = cached?.timestamp ?? Date.now();

        // Remove old results from the stores we just scraped
        const existingResults = cached?.results.filter(
          (card) => !stores.includes(card.store)
        ) ?? [];

        // Remove old errors from the stores we just scraped
        const existingErrors = cached?.storeErrors?.filter(
          (err) => !stores.includes(err.storeName)
        ) ?? [];

        // Merge results and sort by price
        const mergedResults = [...existingResults, ...results].sort((a, b) => a.price - b.price);
        const mergedErrors = [...existingErrors, ...storeErrors];

        // Cache the merged results with the original timestamp
        await this.cacheService.setCard(cardName, mergedResults, mergedErrors, originalTimestamp);

        this.logger.log(
          `Successfully scraped ${results.length} results from ${stores.length} store(s) for: ${cardName} (merged total: ${mergedResults.length})`,
        );

        return {
          cardName,
          results: mergedResults,
          storeErrors: mergedErrors,
          timestamp: originalTimestamp,
          success: true,
        };
      } else {
        // Full scrape - cache all results
        await this.cacheService.setCard(cardName, results, storeErrors);

        // Mark scraping as complete
        await this.cacheService.markScrapeComplete(cardName);

        this.logger.log(
          `Successfully scraped ${results.length} results for: ${cardName}`,
        );

        return {
          cardName,
          results,
          storeErrors,
          timestamp: Date.now(),
          success: true,
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to scrape ${cardName}:`,
        error instanceof Error ? error.stack : error,
      );

      // Mark scraping as complete even on failure so waiting requests don't hang
      if (!isTargetedScrape) {
        await this.cacheService.markScrapeComplete(cardName);
      }

      return {
        cardName,
        results: [],
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
