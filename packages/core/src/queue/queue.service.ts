import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, ScrapeCardJobData } from '@scoutlgs/shared';

/**
 * Job data for bulk enqueueing multiple store-card combinations.
 */
export interface BulkScrapeJobInput {
  cardName: string;
  storeName: string;
  priority?: number;
  requestId?: string;
  retryCount?: number;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.CARD_SCRAPE)
    private readonly scrapeQueue: Queue<ScrapeCardJobData>,
  ) {}

  /**
   * Enqueue a single scrape job for one card-store combination.
   * @param cardName The card name to scrape
   * @param storeName The store name slug (e.g., 'f2f', '401')
   * @param priority Job priority (default 5, user requests use 10, scheduler uses 1)
   * @param requestId Optional request ID for tracking
   * @param retryCount Optional retry count for this store-card combination
   */
  async enqueueScrapeJob(
    cardName: string,
    storeName: string,
    priority: number = 5,
    requestId?: string,
    retryCount?: number,
  ): Promise<void> {
    try {
      await this.scrapeQueue.add(
        JOB_NAMES.SCRAPE_CARD,
        {
          cardName,
          storeName,
          priority,
          requestId,
          retryCount,
        },
        {
          priority,
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      this.logger.log(
        `Enqueued scrape job for: ${cardName} at ${storeName} (Priority: ${priority}, Request ID: ${requestId || 'N/A'})`,
      );
    } catch (error) {
      this.logger.error(`Failed to enqueue scrape job for ${cardName} at ${storeName}:`, error);
      throw error;
    }
  }

  /**
   * Enqueue multiple scrape jobs in bulk for efficiency.
   * Uses BullMQ's addBulk method to minimize Redis round trips.
   * @param jobs Array of job inputs, each representing one card-store combination
   */
  async enqueueScrapeJobsBulk(jobs: BulkScrapeJobInput[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }

    try {
      const bulkJobs = jobs.map(job => ({
        name: JOB_NAMES.SCRAPE_CARD,
        data: {
          cardName: job.cardName,
          storeName: job.storeName,
          priority: job.priority ?? 5,
          requestId: job.requestId,
          retryCount: job.retryCount,
        } satisfies ScrapeCardJobData,
        opts: {
          priority: job.priority ?? 5,
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: {
            type: 'exponential' as const,
            delay: 2000,
          },
        },
      }));

      await this.scrapeQueue.addBulk(bulkJobs);

      this.logger.log(`Enqueued ${jobs.length} scrape job(s) in bulk`);
    } catch (error) {
      this.logger.error(`Failed to bulk enqueue ${jobs.length} scrape jobs:`, error);
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
