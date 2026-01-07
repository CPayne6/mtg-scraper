import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PopularCardsService } from './popular-cards.service';
import { QueueService } from '@scoutlgs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class PopularCardsScheduler implements OnModuleInit {
  private readonly logger = new Logger(PopularCardsScheduler.name);

  constructor(
    private readonly popularCardsService: PopularCardsService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  onModuleInit() {
    const cronTime = this.configService.getOrThrow<string>('schedule.dailyScrapeTime');
    this.logger.log(`Daily popular cards scrape scheduled at cron time: ${cronTime}`);

    const job = CronJob.from({
      cronTime: cronTime,
      onTick: () => this.scrapePopularCards(),
      start: true,
    });

    this.schedulerRegistry.addCronJob('daily-cards-scrape', job);
    job.start();
  }

  async scrapePopularCards() {
    const enabled = this.configService.get<boolean>('schedule.enabled');

    if (!enabled) {
      this.logger.debug('Scheduled tasks are disabled');
      return;
    }

    this.logger.log('Starting daily popular cards scrape...');

    try {
      const popularCards = await this.popularCardsService.getPopularCards();
      this.logger.log(`Enqueueing ${popularCards.length} popular cards for scraping in batches of 50`);

      let enqueuedCount = 0;
      let skippedCount = 0;
      const batchSize = 50;

      // Process cards in batches of 50
      for (let i = 0; i < popularCards.length; i += batchSize) {
        const batch = popularCards.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(popularCards.length / batchSize);

        this.logger.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} cards)`);

        // Enqueue all cards in this batch concurrently
        const batchResults = await Promise.allSettled(
          batch.map(cardName =>
            this.queueService.enqueueScrapeJob(cardName, 1)
          )
        );

        // Process results
        batchResults.forEach((result, index) => {
          const cardName = batch[index];

          if (result.status === 'fulfilled') {
            enqueuedCount++;
          } else {
            skippedCount++;
            this.logger.warn(`Failed to enqueue ${cardName}: ${result.reason?.message || result.reason}`);
          }
        });

        this.logger.log(
          `Batch ${batchNumber}/${totalBatches} complete: ${enqueuedCount} enqueued, ${skippedCount} skipped so far`
        );
      }

      this.logger.log(
        `Daily scrape complete: ${enqueuedCount} enqueued, ${skippedCount} skipped`
      );
    } catch (error) {
      this.logger.error('Failed to execute daily popular cards scrape', error);
    }
  }

  /**
   * Manual trigger for testing
   * Can be called via a CLI command or admin endpoint
   */
  async triggerManualScrape() {
    this.logger.log('Manually triggered popular cards scrape');
    await this.scrapePopularCards();
  }
}
