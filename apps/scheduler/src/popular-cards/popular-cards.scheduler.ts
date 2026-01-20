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
  storeSuccessCounts: Record<string, number>;
  failedCardNames: string[];
  cardsWithStoreErrors: number;
  totalStoreErrors: number;
  duration: number;
  startTime: Date;
  endTime: Date | null;
  averageResultsPerCard: number;
  successRate: number;
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
    const timezone = this.configService.get<string>('schedule.timezone') ?? 'America/Toronto';
    const runOnInit = this.configService.get<boolean>('schedule.runOnInit') ?? false;

    this.logger.log(`Daily popular cards scrape scheduled at cron time: ${cronTime} (${timezone})`);

    const job = CronJob.from({
      cronTime: cronTime,
      timeZone: timezone,
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
      storeSuccessCounts: {},
      failedCardNames: [],
      cardsWithStoreErrors: 0,
      totalStoreErrors: 0,
      duration: 0,
      startTime: new Date(initiatedAt),
      endTime: null,
      averageResultsPerCard: 0,
      successRate: 0,
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
      summary.endTime = new Date();
      summary.averageResultsPerCard = summary.successfulScrapes > 0
        ? summary.totalResults / summary.successfulScrapes
        : 0;
      summary.successRate = summary.totalCards > 0
        ? (summary.successfulScrapes / summary.totalCards) * 100
        : 0;

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
      summary.endTime = new Date();
      summary.averageResultsPerCard = summary.successfulScrapes > 0
        ? summary.totalResults / summary.successfulScrapes
        : 0;
      summary.successRate = summary.totalCards > 0
        ? (summary.successfulScrapes / summary.totalCards) * 100
        : 0;

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

        // Count successful results by store name
        for (const cardResult of result.results) {
          const storeName = cardResult.store;
          summary.storeSuccessCounts[storeName] =
            (summary.storeSuccessCounts[storeName] || 0) + 1;
        }

        // Count store errors by store name
        if (result.storeErrors && result.storeErrors.length > 0) {
          summary.cardsWithStoreErrors++;
          summary.totalStoreErrors += result.storeErrors.length;

          for (const storeError of result.storeErrors) {
            summary.storeErrorCounts[storeError.storeName] =
              (summary.storeErrorCounts[storeError.storeName] || 0) + 1;
          }
        }
      } else {
        summary.failedScrapes++;
        summary.failedCardNames.push(cardName);
      }
    }
  }

  private printJobSummary(summary: JobSummary): void {
    const durationMinutes = (summary.duration / 1000 / 60).toFixed(2);
    const durationSeconds = (summary.duration / 1000).toFixed(1);
    const avgTimePerCard = summary.successfulScrapes > 0
      ? (summary.duration / summary.successfulScrapes / 1000).toFixed(2)
      : '0';

    this.logger.log('');
    this.logger.log('╔══════════════════════════════════════════════════════════════╗');
    this.logger.log('║                    SCHEDULER JOB SUMMARY                     ║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log('║  TIMING                                                      ║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log(`║  Start Time:        ${summary.startTime.toISOString().padEnd(41)}║`);
    this.logger.log(`║  End Time:          ${(summary.endTime?.toISOString() || 'N/A').padEnd(41)}║`);
    this.logger.log(`║  Duration:          ${durationMinutes} minutes (${durationSeconds}s)`.padEnd(65) + '║');
    this.logger.log(`║  Avg Time/Card:     ${avgTimePerCard}s`.padEnd(65) + '║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log('║  SCRAPE RESULTS                                              ║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log(`║  Total Cards:       ${summary.totalCards}`.padEnd(65) + '║');
    this.logger.log(`║  Successful:        ${summary.successfulScrapes} (${summary.successRate.toFixed(1)}%)`.padEnd(65) + '║');
    this.logger.log(`║  Failed:            ${summary.failedScrapes}`.padEnd(65) + '║');
    this.logger.log(`║  Total Results:     ${summary.totalResults}`.padEnd(65) + '║');
    this.logger.log(`║  Avg Results/Card:  ${summary.averageResultsPerCard.toFixed(1)}`.padEnd(65) + '║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log('║  STORE ERRORS                                                ║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log(`║  Cards w/ Errors:   ${summary.cardsWithStoreErrors}`.padEnd(65) + '║');
    this.logger.log(`║  Total Store Errors:${summary.totalStoreErrors}`.padEnd(65) + '║');

    const storeErrorEntries = Object.entries(summary.storeErrorCounts);
    if (storeErrorEntries.length > 0) {
      this.logger.log('║  ──────────────────────────────────────────────────────────  ║');
      this.logger.log('║  Errors by Store:                                            ║');
      storeErrorEntries
        .sort((a, b) => b[1] - a[1])
        .forEach(([storeName, count]) => {
          this.logger.log(`║    ${storeName}: ${count}`.padEnd(65) + '║');
        });
    }

    const storeSuccessEntries = Object.entries(summary.storeSuccessCounts);
    if (storeSuccessEntries.length > 0) {
      this.logger.log('╠══════════════════════════════════════════════════════════════╣');
      this.logger.log('║  RESULTS BY STORE                                            ║');
      this.logger.log('╠══════════════════════════════════════════════════════════════╣');
      storeSuccessEntries
        .sort((a, b) => b[1] - a[1])
        .forEach(([storeName, count]) => {
          this.logger.log(`║    ${storeName}: ${count} results`.padEnd(65) + '║');
        });
    }

    if (summary.failedCardNames.length > 0) {
      this.logger.log('╠══════════════════════════════════════════════════════════════╣');
      this.logger.log('║  FAILED CARDS                                                ║');
      this.logger.log('╠══════════════════════════════════════════════════════════════╣');
      const maxToShow = 10;
      const cardsToShow = summary.failedCardNames.slice(0, maxToShow);
      cardsToShow.forEach(cardName => {
        this.logger.log(`║    - ${cardName}`.padEnd(65) + '║');
      });
      if (summary.failedCardNames.length > maxToShow) {
        this.logger.log(`║    ... and ${summary.failedCardNames.length - maxToShow} more`.padEnd(65) + '║');
      }
    }

    this.logger.log('╚══════════════════════════════════════════════════════════════╝');
    this.logger.log('');
  }
}
