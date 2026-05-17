import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PopularCardsService } from './popular-cards.service';
import { CacheService, QueueService, StoreService } from '@scoutlgs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';


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
        const maxQueueDepth = this.configService.get<number>('popularCards.maxQueueDepth') ?? 1000;
        const refillBatchSize = this.configService.get<number>('popularCards.refillBatchSize') ?? 100;

        this.scrapePopularCards({ enabled, limit, maxQueueDepth, refillBatchSize });
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
    maxQueueDepth?: number;
    refillBatchSize?: number;
    pollIntervalMs?: number;
  }): Promise<string[]> {
    const {
      enabled = true,
      limit = 1000,
      maxQueueDepth = 1000,
      refillBatchSize = 100,
      pollIntervalMs = 500,
    } = options;

    if (!enabled) {
      this.logger.debug('Scheduled tasks are disabled');
      return [];
    }

    this.logger.log('Starting popular cards scrape...');
    this.logger.log(`Config: maxQueueDepth=${maxQueueDepth}, refillBatchSize=${refillBatchSize}, pollIntervalMs=${pollIntervalMs}`);

    const initiatedAt = Date.now();

    // Get all active stores
    const stores = await this.storeService.findAllActive();
    const storeNames = stores.map(s => s.name);
    this.logger.log(`Found ${stores.length} active stores: ${storeNames.join(', ')}`);

    try {
      const popularCards = await this.popularCardsService.getPopularCards(limit);
      const totalJobs = popularCards.length * storeNames.length;

      this.logger.log(`Streaming ${popularCards.length} cards × ${stores.length} stores = ${totalJobs} total jobs`);

      // Set initial job status
      await this.cacheService.setSchedulerJobStatus({
        initiatedAt,
        status: 'running',
        details: {
          currentScrapeCount: 0,
          totalScrapeCount: totalJobs,
        },
      });

      // Create a generator for all card-store combinations
      const jobGenerator = this.createJobGenerator(popularCards, storeNames);
      let jobsEnqueued = 0;
      let generatorDone = false;

      // Streaming loop: keep the queue filled up to maxQueueDepth
      while (!generatorDone || (await this.queueService.getQueueDepth()) > 0) {
        const currentDepth = await this.queueService.getQueueDepth();
        const availableSlots = maxQueueDepth - currentDepth;

        // If we have room and more jobs to add, enqueue them
        if (!generatorDone && availableSlots > 0) {
          const jobsToAdd = Math.min(availableSlots, refillBatchSize);
          const batch: { cardName: string; storeName: string; priority: number }[] = [];

          for (let i = 0; i < jobsToAdd; i++) {
            const next = jobGenerator.next();
            if (next.done) {
              generatorDone = true;
              break;
            }
            batch.push(next.value);
          }

          if (batch.length > 0) {
            await this.queueService.enqueueScrapeJobsBulk(batch);
            jobsEnqueued += batch.length;

            // Update progress
            await this.cacheService.setSchedulerJobStatus({
              initiatedAt,
              status: 'running',
              details: {
                currentScrapeCount: jobsEnqueued,
                totalScrapeCount: totalJobs,
              },
            });

            this.logger.debug(
              `Enqueued ${batch.length} jobs (${jobsEnqueued}/${totalJobs} total). Queue depth: ${currentDepth + batch.length}`
            );
          }
        }

        // If generator is done and queue is empty, we're finished
        if (generatorDone && currentDepth === 0) {
          break;
        }

        // Log progress periodically
        if (jobsEnqueued % 1000 === 0 && jobsEnqueued > 0) {
          const elapsed = (Date.now() - initiatedAt) / 1000;
          const rate = jobsEnqueued / elapsed;
          this.logger.log(
            `Progress: ${jobsEnqueued}/${totalJobs} enqueued (${(jobsEnqueued / totalJobs * 100).toFixed(1)}%). ` +
            `Queue depth: ${currentDepth}. Rate: ${rate.toFixed(1)} jobs/sec`
          );
        }

        // Wait before checking again
        await this.sleep(pollIntervalMs);
      }

      const duration = Date.now() - initiatedAt;

      // Update job status to completed
      await this.cacheService.setSchedulerJobStatus({
        initiatedAt,
        finishedAt: Date.now(),
        status: 'completed',
        details: {
          currentScrapeCount: jobsEnqueued,
          totalScrapeCount: totalJobs,
        },
      });

      this.logger.log(
        `Scrape complete: ${jobsEnqueued} jobs enqueued in ${(duration / 1000).toFixed(1)}s`
      );

      return popularCards;
    } catch (error) {
      await this.cacheService.setSchedulerJobStatus({
        initiatedAt,
        finishedAt: Date.now(),
        status: 'failed',
        details: {
          currentScrapeCount: 0,
          totalScrapeCount: 0,
        },
      });

      this.logger.error('Failed to execute popular cards scrape', error);
      return [];
    }
  }

  /**
   * Generator that yields card-store job combinations one at a time.
   */
  private *createJobGenerator(
    cards: string[],
    storeNames: string[]
  ): Generator<{ cardName: string; storeName: string; priority: number }> {
    for (const cardName of cards) {
      for (const storeName of storeNames) {
        yield {
          cardName,
          storeName,
          priority: 1, // Low priority for scheduled tasks
        };
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
