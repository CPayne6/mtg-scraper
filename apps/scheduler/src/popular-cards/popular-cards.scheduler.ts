import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PopularCardsService } from './popular-cards.service';
import { CacheService, QueueService, StoreService } from '@scoutlgs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

interface BatchResult {
  enqueuedCards: string[];
  enqueuedJobCount: number;
  skippedCount: number;
}

interface JobSummary {
  // Card-level metrics
  totalCards: number;
  cardsWithResults: number;
  cardsWithoutResults: number;
  cardsWithPartialResults: number;
  failedCardNames: string[];

  // Job-level metrics (one job = one store-card combination)
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  jobSuccessRate: number;

  // Result metrics
  totalResults: number;
  averageResultsPerCard: number;

  // Store metrics
  storeErrorCounts: Record<string, number>;
  storeSuccessCounts: Record<string, number>;

  // Timing
  duration: number;
  startTime: Date;
  endTime: Date | null;
}

@Injectable()
export class PopularCardsScheduler implements OnModuleInit {
  private readonly logger = new Logger(PopularCardsScheduler.name);

  constructor(
    private readonly popularCardsService: PopularCardsService,
    private readonly queueService: QueueService,
    private readonly cacheService: CacheService,
    private readonly storeService: StoreService,
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

    // Get all active stores (uses cached store list)
    const stores = await this.storeService.findAllActive();
    const storeNames = stores.map(s => s.name);

    this.logger.log(`Found ${stores.length} active stores: ${storeNames.join(', ')}`);

    // Track summary data
    const summary: JobSummary = {
      // Card-level
      totalCards: 0,
      cardsWithResults: 0,
      cardsWithoutResults: 0,
      cardsWithPartialResults: 0,
      failedCardNames: [],

      // Job-level
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      jobSuccessRate: 0,

      // Results
      totalResults: 0,
      averageResultsPerCard: 0,

      // Store metrics
      storeErrorCounts: {},
      storeSuccessCounts: {},

      // Timing
      duration: 0,
      startTime: new Date(initiatedAt),
      endTime: null,
    };

    try {
      const popularCards = await this.popularCardsService.getPopularCards(limit);
      const effectiveBatchSize = isBatch ? batchSize : popularCards.length;
      const totalBatches = Math.ceil(popularCards.length / effectiveBatchSize);

      summary.totalCards = popularCards.length;
      summary.totalJobs = popularCards.length * stores.length;

      // Set initial job status
      await this.cacheService.setSchedulerJobStatus({
        initiatedAt,
        status: 'running',
        details: {
          currentScrapeCount: 0,
          totalScrapeCount: summary.totalJobs,
        },
      });

      this.logger.log(
        isBatch
          ? `Enqueueing ${popularCards.length} popular cards × ${stores.length} stores = ${summary.totalJobs} jobs in batches of ${effectiveBatchSize} cards`
          : `Enqueueing all ${summary.totalJobs} jobs (${popularCards.length} cards × ${stores.length} stores)`
      );

      let totalEnqueued = 0;
      let totalSkipped = 0;

      for (let i = 0; i < popularCards.length; i += effectiveBatchSize) {
        const batch = popularCards.slice(i, i + effectiveBatchSize);
        const batchNumber = Math.floor(i / effectiveBatchSize) + 1;

        if (isBatch) {
          this.logger.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} cards × ${stores.length} stores)`);
        }

        const result = await this.processBatch(batch, storeNames);
        totalEnqueued += result.enqueuedJobCount;
        totalSkipped += result.skippedCount;

        // Wait for batch completion and collect results only if waitForCompletion is true
        if (waitForCompletion && result.enqueuedCards.length > 0) {
          await this.waitForBatchCompletion(result.enqueuedCards, storeNames, batchNumber, isBatch);

          // Collect results from this batch for the summary
          await this.collectBatchResults(result.enqueuedCards, storeNames, summary);
        }

        // Update job status with current progress
        await this.cacheService.setSchedulerJobStatus({
          initiatedAt,
          status: 'running',
          details: {
            currentScrapeCount: totalEnqueued,
            totalScrapeCount: summary.totalJobs,
          },
        });

        if (isBatch) {
          this.logger.log(
            `Batch ${batchNumber}/${totalBatches} complete: ${totalEnqueued} jobs enqueued, ${totalSkipped} skipped so far`
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
      summary.averageResultsPerCard = summary.cardsWithResults > 0
        ? summary.totalResults / summary.cardsWithResults
        : 0;
      summary.jobSuccessRate = summary.totalJobs > 0
        ? (summary.successfulJobs / summary.totalJobs) * 100
        : 0;

      // Update job status to completed
      await this.cacheService.setSchedulerJobStatus({
        initiatedAt,
        finishedAt: Date.now(),
        status: 'completed',
        details: {
          currentScrapeCount: totalEnqueued,
          totalScrapeCount: summary.totalJobs,
        },
      });

      // Print job summary only if we waited for completion
      if (waitForCompletion) {
        this.printJobSummary(summary);
      } else {
        this.logger.log(`Scrape complete: ${totalEnqueued} jobs enqueued, ${totalSkipped} skipped`);
      }

      return popularCards;
    } catch (error) {
      summary.duration = Date.now() - initiatedAt;
      summary.endTime = new Date();
      summary.averageResultsPerCard = summary.cardsWithResults > 0
        ? summary.totalResults / summary.cardsWithResults
        : 0;
      summary.jobSuccessRate = summary.totalJobs > 0
        ? (summary.successfulJobs / summary.totalJobs) * 100
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

  /**
   * Process a batch of cards by creating jobs for each card-store combination.
   */
  private async processBatch(cards: string[], storeNames: string[]): Promise<BatchResult> {
    // Build jobs for all card-store combinations
    const jobs = cards.flatMap(cardName =>
      storeNames.map(storeName => ({
        cardName,
        storeName,
        priority: 1, // Low priority for scheduled tasks
      }))
    );

    try {
      await this.queueService.enqueueScrapeJobsBulk(jobs);

      return {
        enqueuedCards: cards,
        enqueuedJobCount: jobs.length,
        skippedCount: 0,
      };
    } catch (error) {
      this.logger.error(`Failed to enqueue batch: ${error}`);
      return {
        enqueuedCards: [],
        enqueuedJobCount: 0,
        skippedCount: cards.length,
      };
    }
  }

  /**
   * Wait for all store-card combinations in a batch to complete.
   */
  private async waitForBatchCompletion(
    cards: string[],
    storeNames: string[],
    batchNumber: number,
    isBatch: boolean
  ): Promise<void> {
    const totalJobs = cards.length * storeNames.length;
    this.logger.log(
      isBatch
        ? `Waiting for ${totalJobs} jobs in batch ${batchNumber} to complete...`
        : `Waiting for ${totalJobs} jobs to complete...`
    );

    // Wait for all cards to have all their stores scraped
    await Promise.all(
      cards.map(cardName =>
        this.cacheService.waitForStoresScrapeCompletion(cardName, storeNames, 120000)
      )
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

  /**
   * Collect results from a batch of cards for the summary.
   * Tracks both card-level metrics (did a card get any results?) and
   * job-level metrics (did each store-card combination succeed?).
   */
  private async collectBatchResults(
    cards: string[],
    storeNames: string[],
    summary: JobSummary
  ): Promise<void> {
    for (const cardName of cards) {
      // Get all store results for this card
      const results = await this.cacheService.getMultipleStoreCards(cardName, storeNames);

      let cardSuccessfulJobs = 0;
      let cardFailedJobs = 0;
      let cardTotalResults = 0;

      for (const [storeName, entry] of results) {
        // Each store-card combination is one job
        if (entry) {
          if (entry.error) {
            // Job failed - store returned an error
            cardFailedJobs++;
            summary.failedJobs++;
            summary.storeErrorCounts[storeName] =
              (summary.storeErrorCounts[storeName] || 0) + 1;
          } else {
            // Job succeeded (even if no results found - that's valid)
            cardSuccessfulJobs++;
            summary.successfulJobs++;
          }

          if (entry.results.length > 0) {
            cardTotalResults += entry.results.length;
            summary.totalResults += entry.results.length;

            // Count by store display name (from card.store field)
            for (const cardResult of entry.results) {
              summary.storeSuccessCounts[cardResult.store] =
                (summary.storeSuccessCounts[cardResult.store] || 0) + 1;
            }
          }
        } else {
          // No entry at all - job didn't complete or wasn't cached
          cardFailedJobs++;
          summary.failedJobs++;
        }
      }

      // Card-level classification
      if (cardTotalResults > 0) {
        if (cardFailedJobs > 0) {
          // Some stores succeeded with results, some failed
          summary.cardsWithPartialResults++;
        } else {
          // All stores completed, at least one had results
          summary.cardsWithResults++;
        }
      } else {
        // No results from any store
        summary.cardsWithoutResults++;
        summary.failedCardNames.push(cardName);
      }
    }
  }

  private printJobSummary(summary: JobSummary): void {
    const durationMinutes = (summary.duration / 1000 / 60).toFixed(2);
    const durationSeconds = (summary.duration / 1000).toFixed(1);
    const avgTimePerJob = summary.totalJobs > 0
      ? (summary.duration / summary.totalJobs / 1000).toFixed(3)
      : '0';
    const cardsWithAnyResults = summary.cardsWithResults + summary.cardsWithPartialResults;
    const cardSuccessRate = summary.totalCards > 0
      ? ((cardsWithAnyResults / summary.totalCards) * 100).toFixed(1)
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
    this.logger.log(`║  Avg Time/Job:      ${avgTimePerJob}s`.padEnd(65) + '║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log('║  CARDS (unique card names searched)                          ║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log(`║  Total Cards:       ${summary.totalCards}`.padEnd(65) + '║');
    this.logger.log(`║  With Results:      ${cardsWithAnyResults} (${cardSuccessRate}%)`.padEnd(65) + '║');
    this.logger.log(`║    └ Full Success:  ${summary.cardsWithResults}`.padEnd(65) + '║');
    this.logger.log(`║    └ Partial:       ${summary.cardsWithPartialResults}`.padEnd(65) + '║');
    this.logger.log(`║  No Results:        ${summary.cardsWithoutResults}`.padEnd(65) + '║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log('║  JOBS (one job = one card × one store)                       ║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log(`║  Total Jobs:        ${summary.totalJobs}`.padEnd(65) + '║');
    this.logger.log(`║  Successful:        ${summary.successfulJobs} (${summary.jobSuccessRate.toFixed(1)}%)`.padEnd(65) + '║');
    this.logger.log(`║  Failed:            ${summary.failedJobs}`.padEnd(65) + '║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log('║  RESULTS (price listings found)                              ║');
    this.logger.log('╠══════════════════════════════════════════════════════════════╣');
    this.logger.log(`║  Total Results:     ${summary.totalResults}`.padEnd(65) + '║');
    this.logger.log(`║  Avg Results/Card:  ${summary.averageResultsPerCard.toFixed(1)}`.padEnd(65) + '║');

    const storeErrorEntries = Object.entries(summary.storeErrorCounts);
    if (storeErrorEntries.length > 0) {
      this.logger.log('╠══════════════════════════════════════════════════════════════╣');
      this.logger.log('║  FAILED JOBS BY STORE                                        ║');
      this.logger.log('╠══════════════════════════════════════════════════════════════╣');
      storeErrorEntries
        .sort((a, b) => b[1] - a[1])
        .forEach(([storeName, count]) => {
          this.logger.log(`║    ${storeName}: ${count} failed jobs`.padEnd(65) + '║');
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
      this.logger.log('║  CARDS WITH NO RESULTS                                       ║');
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
