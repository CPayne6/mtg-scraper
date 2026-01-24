import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  ScrapeCardJobData,
  ScrapeCardJobResult,
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
    concurrency: 30, // Optimal - higher values cause resource contention
  })
  async process(job: Job<ScrapeCardJobData>): Promise<ScrapeCardJobResult> {
    const { cardName, storeName, requestId, retryCount } = job.data;

    // Ensure stores are loaded before processing
    await this.scraperService.waitUntilReady();

    this.logger.log(
      `Processing scrape job for: ${cardName} at ${storeName} (Job ID: ${job.id}, Request ID: ${requestId || 'N/A'})`,
    );

    try {
      // Scrape single store
      const { results, error } = await this.scraperService.searchCardAtStore(
        cardName,
        storeName,
      );

      // Increment retry count if there was an error
      const newRetryCount = error ? (retryCount ?? 0) + 1 : retryCount;

      // Cache the result for this store-card combination
      await this.cacheService.setStoreCard(
        cardName,
        storeName,
        results,
        error,
        newRetryCount,
      );

      // Mark this store-card scrape as complete (removes lock)
      await this.cacheService.markStoreScrapeComplete(cardName, storeName);

      if (error) {
        this.logger.warn(
          `Scraped ${cardName} at ${storeName} with error: ${error} (retry ${newRetryCount})`,
        );
      } else {
        this.logger.log(
          `Successfully scraped ${results.length} results for: ${cardName} at ${storeName}`,
        );
      }

      return {
        cardName,
        storeName,
        results,
        timestamp: Date.now(),
        success: !error,
        error,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to scrape ${cardName} at ${storeName}:`,
        error instanceof Error ? error.stack : error,
      );

      // Cache the error state
      const newRetryCount = (retryCount ?? 0) + 1;
      await this.cacheService.setStoreCard(
        cardName,
        storeName,
        [],
        errorMessage,
        newRetryCount,
      );

      // Mark scrape complete even on failure so waiting requests don't hang
      await this.cacheService.markStoreScrapeComplete(cardName, storeName);

      return {
        cardName,
        storeName,
        results: [],
        timestamp: Date.now(),
        success: false,
        error: errorMessage,
      };
    }
  }
}
