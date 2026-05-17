import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PopularCardsService } from './popular-cards.service';
import { CacheService, StoreService } from '@scoutlgs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';


@Injectable()
export class PopularCardsScheduler implements OnModuleInit {
  private readonly logger = new Logger(PopularCardsScheduler.name);

  constructor(
    private readonly popularCardsService: PopularCardsService,
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
    } = options;

    if (!enabled) {
      this.logger.debug('Scheduled tasks are disabled');
      return [];
    }

    this.logger.warn('Popular cards scrape is a legacy V1 feature. The card-scrape queue has been removed. Skipping.');
    return [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
