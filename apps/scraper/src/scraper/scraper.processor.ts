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
    concurrency: 5
  })
  async process(job: Job<ScrapeCardJobData>): Promise<ScrapeCardJobResult> {
    const { cardName, requestId } = job.data;

    // Ensure stores are loaded before processing
    await this.scraperService.waitUntilReady();

    this.logger.log(
      `Processing scrape job for: ${cardName} (Job ID: ${job.id}, Request ID: ${requestId || 'N/A'})`,
    );

    try {
      // Perform the scraping
      const results = await this.scraperService.searchCard(cardName);

      // Cache the results
      await this.cacheService.setCard(cardName, results);

      // Mark scraping as complete
      await this.cacheService.markScrapeComplete(cardName);

      this.logger.log(
        `Successfully scraped ${results.length} results for: ${cardName}`,
      );

      return {
        cardName,
        results,
        timestamp: Date.now(),
        success: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to scrape ${cardName}:`,
        error instanceof Error ? error.stack : error,
      );

      // Mark scraping as complete even on failure so waiting requests don't hang
      await this.cacheService.markScrapeComplete(cardName);

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
