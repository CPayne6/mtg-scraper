import { PopularCardsScheduler } from '@/popular-cards/popular-cards.scheduler';
import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { CacheService } from '@scoutlgs/core';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ManualService {
  private readonly logger = new Logger(ManualService.name);

  constructor(
    private readonly popularCardsScheduler: PopularCardsScheduler,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService
  ) { }

  async triggerScrape(limit: number = this.configService.get<number>('popularCards.limit') ?? 1000) {
    this.logger.log('Manual trigger initiated for popular cards scrape');

    const jobStatus = await this.cacheService.schedulerJobStatus();
    this.logger.log(`Current scheduler job status: ${JSON.stringify(jobStatus)}`);

    if (jobStatus && jobStatus.status === 'running') {
      this.logger.warn('Job is currently running, trigger aborted');
      throw new ConflictException('A popular cards scrape job is already in progress');
    }

    const enabled = this.configService.get<boolean>('schedule.enabled') ?? true;
    const batchSize = this.configService.get<number>('popularCards.batchSize') ?? 50;
    const batchDelayMs = this.configService.get<number>('popularCards.batchDelayMs') ?? 1000;

    // Fire and forget - don't await so the HTTP request returns immediately
    // Use .catch to prevent unhandled promise rejection
    this.popularCardsScheduler
      .scrapePopularCards({ enabled, limit, batchSize, batchDelayMs, waitForCompletion: true })
      .catch(error => this.logger.error('Scrape failed', error));

    return { message: 'Scrape triggered successfully' };
  }

  getStatus() {
    this.logger.log('Fetching status of last popular cards scrape')
    return this.cacheService.schedulerJobStatus();
  }
}