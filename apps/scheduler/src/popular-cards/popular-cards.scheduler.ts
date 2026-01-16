import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PopularCardsService } from './popular-cards.service';
import { CacheService, QueueService } from '@scoutlgs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

interface BatchResult {
  enqueuedCards: string[];
  enqueuedCount: number;
  skippedCount: number;
}

interface JobSummary {
  totalCards: number;
  successfulScrapes: number;
  failedScrapes: number;
  totalResults: number;
  storeErrorCounts: Record<string, number>;
  duration: number;
}

@Injectable()
export class PopularCardsScheduler implements OnModuleInit {
  private readonly logger = new Logger(PopularCardsScheduler.name);

  constructor(
    private readonly popularCardsService: PopularCardsService,
    private readonly queueService: QueueService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) { }

  onModuleInit() {
    const cronTime = this.configService.getOrThrow<string>('schedule.dailyScrapeTime');
    const runOnInit = this.configService.get<boolean>('schedule.runOnInit') ?? false;

    this.logger.log(`Daily popular cards scrape scheduled at cron time: ${cronTime}`);

    const job = CronJob.from({
      cronTime: cronTime,
      onTick: () => {
        const enabled = this.configService.get<boolean>('schedule.enabled') ?? true;
        const limit = this.configService.get<number>('popularCards.limit') ?? 1000;
        const batchSize = this.configService.get<number>('popularCards.batchSize') ?? 50;
        const batchDelayMs = this.configService.get<number>('popularCards.batchDelayMs') ?? 1000;
        this.scrapePopularCards({ enabled, limit, batchSize, batchDelayMs, waitForCompletion: true });
      },
      start: true,
      runOnInit
    });

    this.schedulerRegistry.addCronJob('daily-cards-scrape', job);
    job.start();
  }

  async scrapePopularCards(options: {
    enabled?: boolean;
    limit?: number;
    isBatch?: boolean;
    batchSize?: number;
    batchDelayMs?: number;
    waitForCompletion?: boolean;
  }): Promise<string[]> {
    const { enabled = true, limit = 1000, isBatch = true, batchSize = 50, batchDelayMs = 1000, waitForCompletion = false } = options;

    if (!enabled) {
      this.logger.debug('Scheduled tasks are disabled');
      return [];
    }

    this.logger.log('Starting daily popular cards scrape...');

    const initiatedAt = Date.now();

    // Track summary data
    const summary: JobSummary = {
      totalCards: 0,
      successfulScrapes: 0,
      failedScrapes: 0,
      totalResults: 0,
      storeErrorCounts: {},
      duration: 0,
    };

    try {
      const popularCards = await this.popularCardsService.getPopularCards(limit);
      const effectiveBatchSize = isBatch ? batchSize : popularCards.length;
      const totalBatches = Math.ceil(popularCards.length / effectiveBatchSize);

      summary.totalCards = popularCards.length;

      // Set initial job status
      await this.cacheService.setSchedulerJobStatus({
        initiatedAt,
        status: 'running',
        details: {
          currentScrapeCount: 0,
          totalScrapeCount: popularCards.length,
        },
      });

      this.logger.log(
        isBatch
          ? `Enqueueing ${popularCards.length} popular cards in batches of ${effectiveBatchSize}`
          : `Enqueueing all ${popularCards.length} popular cards`
      );

      let totalEnqueued = 0;
      let totalSkipped = 0;

      for (let i = 0; i < popularCards.length; i += effectiveBatchSize) {
        const batch = popularCards.slice(i, i + effectiveBatchSize);
        const batchNumber = Math.floor(i / effectiveBatchSize) + 1;

        if (isBatch) {
          this.logger.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} cards)`);
        }

        const result = await this.processBatch(batch);
        totalEnqueued += result.enqueuedCount;
        totalSkipped += result.skippedCount;

        // Wait for batch completion and collect results only if waitForCompletion is true
        if (waitForCompletion && result.enqueuedCards.length > 0) {
          await this.waitForBatchCompletion(result.enqueuedCards, batchNumber, isBatch);

          // Collect results from this batch for the summary
          await this.collectBatchResults(result.enqueuedCards, summary);
        }

        // Update job status with current progress
        await this.cacheService.setSchedulerJobStatus({
          initiatedAt,
          status: 'running',
          details: {
            currentScrapeCount: totalEnqueued,
            totalScrapeCount: popularCards.length,
          },
        });

        if (isBatch) {
          this.logger.log(
            `Batch ${batchNumber}/${totalBatches} complete: ${totalEnqueued} enqueued, ${totalSkipped} skipped so far`
          );
        }

        // Delay between batches (only if batching and not the last batch)
        if (isBatch && i + effectiveBatchSize < popularCards.length) {
          this.logger.debug(`Waiting ${batchDelayMs}ms before next batch...`);
          await this.sleep(batchDelayMs);
        }
      }

      summary.duration = Date.now() - initiatedAt;

      // Update job status to completed
      await this.cacheService.setSchedulerJobStatus({
        initiatedAt,
        finishedAt: Date.now(),
        status: 'completed',
        details: {
          currentScrapeCount: totalEnqueued,
          totalScrapeCount: popularCards.length,
        },
      });

      // Print job summary only if we waited for completion
      if (waitForCompletion) {
        this.printJobSummary(summary);
      } else {
        this.logger.log(`Scrape complete: ${totalEnqueued} enqueued, ${totalSkipped} skipped`);
      }

      return popularCards;
    } catch (error) {
      summary.duration = Date.now() - initiatedAt;

      // Update job status to failed
      await this.cacheService.setSchedulerJobStatus({
        initiatedAt,
        finishedAt: Date.now(),
        status: 'failed',
        details: {
          currentScrapeCount: 0,
          totalScrapeCount: 0,
        },
      });

      this.logger.error('Failed to execute daily popular cards scrape', error);

      // Print summary on failure only if we were waiting for completion
      if (waitForCompletion) {
        this.printJobSummary(summary);
      }

      return [];
    }
  }

  private async processBatch(cards: string[]): Promise<BatchResult> {
    const results = await Promise.allSettled(
      cards.map(cardName => this.queueService.enqueueScrapeJob(cardName, 1))
    );

    const enqueuedCards: string[] = [];
    let enqueuedCount = 0;
    let skippedCount = 0;

    results.forEach((result, index) => {
      const cardName = cards[index];
      if (result.status === 'fulfilled') {
        enqueuedCount++;
        enqueuedCards.push(cardName);
      } else {
        skippedCount++;
        this.logger.warn(`Failed to enqueue ${cardName}: ${result.reason?.message || result.reason}`);
      }
    });

    return { enqueuedCards, enqueuedCount, skippedCount };
  }

  private async waitForBatchCompletion(cards: string[], batchNumber: number, isBatch: boolean): Promise<void> {
    this.logger.log(
      isBatch
        ? `Waiting for ${cards.length} cards in batch ${batchNumber} to complete...`
        : `Waiting for ${cards.length} cards to complete...`
    );

    await Promise.all(
      cards.map(cardName => this.cacheService.waitForScrapeCompletion(cardName, 120000))
    );

    this.logger.log(
      isBatch
        ? `Batch ${batchNumber} scraping complete`
        : 'All cards scraping complete'
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async collectBatchResults(cards: string[], summary: JobSummary): Promise<void> {
    for (const cardName of cards) {
      const result = await this.cacheService.getCachedResult(cardName);

      if (result) {
        summary.successfulScrapes++;
        summary.totalResults += result.results.length;

        // Count store errors by store name
        if (result.storeErrors) {
          for (const storeError of result.storeErrors) {
            summary.storeErrorCounts[storeError.storeName] =
              (summary.storeErrorCounts[storeError.storeName] || 0) + 1;
          }
        }
      } else {
        summary.failedScrapes++;
      }
    }
  }

  private printJobSummary(summary: JobSummary): void {
    const durationMinutes = (summary.duration / 1000 / 60).toFixed(2);

    this.logger.log('========================================');
    this.logger.log('           JOB SUMMARY');
    this.logger.log('========================================');
    this.logger.log(`Total cards processed: ${summary.totalCards}`);
    this.logger.log(`Successful scrapes: ${summary.successfulScrapes}`);
    this.logger.log(`Failed scrapes: ${summary.failedScrapes}`);
    this.logger.log(`Total results fetched: ${summary.totalResults}`);
    this.logger.log(`Duration: ${durationMinutes} minutes`);

    const storeErrorEntries = Object.entries(summary.storeErrorCounts);
    if (storeErrorEntries.length > 0) {
      this.logger.log('----------------------------------------');
      this.logger.log('Store errors by store:');
      // Sort by error count descending
      storeErrorEntries
        .sort((a, b) => b[1] - a[1])
        .forEach(([storeName, count]) => {
          this.logger.log(`  ${storeName}: ${count} errors`);
        });
    }

    this.logger.log('========================================');
  }
}
