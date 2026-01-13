import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, ScrapeCardJobData } from '@scoutlgs/shared';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.CARD_SCRAPE)
    private readonly scrapeQueue: Queue<ScrapeCardJobData>,
  ) {}

  async enqueueScrapeJob(
    cardName: string,
    priority: number = 5,
    requestId?: string,
    stores?: string[],
  ): Promise<void> {
    try {
      await this.scrapeQueue.add(
        JOB_NAMES.SCRAPE_CARD,
        {
          cardName,
          priority,
          requestId,
          stores,
        },
        {
          priority,
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 500, // Keep last 500 failed jobs for debugging
          attempts: 3, // Retry failed jobs 3 times
          backoff: {
            type: 'exponential',
            delay: 2000, // Start with 2 second delay
          },
        },
      );

      const storesInfo = stores?.length ? `, Stores: ${stores.join(', ')}` : '';
      this.logger.log(
        `Enqueued scrape job for: ${cardName} (Priority: ${priority}, Request ID: ${requestId || 'N/A'}${storesInfo})`,
      );
    } catch (error) {
      this.logger.error(`Failed to enqueue scrape job for ${cardName}:`, error);
      throw error;
    }
  }

  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.scrapeQueue.getWaitingCount(),
      this.scrapeQueue.getActiveCount(),
      this.scrapeQueue.getCompletedCount(),
      this.scrapeQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }
}
