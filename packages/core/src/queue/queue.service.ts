import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  ScrapeCardJobData,
  DiscoverStoreJobData,
  ExtractProductJobData,
} from '@scoutlgs/shared';

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
    @InjectQueue(QUEUE_NAMES.PRODUCT_DISCOVERY)
    private readonly discoveryQueue: Queue<DiscoverStoreJobData>,
    @InjectQueue(QUEUE_NAMES.PRODUCT_EXTRACTION)
    private readonly extractionQueue: Queue<ExtractProductJobData>,
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

  /**
   * Get the current queue depth (waiting + active jobs).
   * Useful for implementing backpressure.
   */
  async getQueueDepth(): Promise<number> {
    const [waiting, active] = await Promise.all([
      this.scrapeQueue.getWaitingCount(),
      this.scrapeQueue.getActiveCount(),
    ]);
    return waiting + active;
  }

  /**
   * Get access to the underlying queue for event listening.
   */
  getQueue(): Queue<ScrapeCardJobData> {
    return this.scrapeQueue;
  }

  // ============== Discovery Queue Methods ==============

  /**
   * Enqueue a discovery job for a store.
   * @param storeId The store ID to discover products from
   * @param priority Job priority (default 1 for scheduled, 10 for manual trigger)
   */
  async enqueueDiscoveryJob(storeId: number, priority: number = 1): Promise<void> {
    try {
      await this.discoveryQueue.add(
        JOB_NAMES.DISCOVER_STORE,
        {
          storeId,
          priority,
        },
        {
          priority,
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );

      this.logger.log(`Enqueued discovery job for store ID: ${storeId} (Priority: ${priority})`);
    } catch (error) {
      this.logger.error(`Failed to enqueue discovery job for store ID ${storeId}:`, error);
      throw error;
    }
  }

  // ============== Extraction Queue Methods ==============

  /**
   * Enqueue an extraction job for a single product URL.
   * @param productUrlId The product URL record ID
   * @param storeId The store ID
   * @param handle The product handle (URL slug)
   * @param priority Job priority (default 1)
   */
  async enqueueExtractionJob(
    productUrlId: string,
    storeId: number,
    handle: string,
    priority: number = 1,
  ): Promise<void> {
    try {
      await this.extractionQueue.add(
        JOB_NAMES.EXTRACT_PRODUCT,
        {
          productUrlId,
          storeId,
          handle,
          priority,
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

      this.logger.debug(`Enqueued extraction job for product URL ID: ${productUrlId}`);
    } catch (error) {
      this.logger.error(`Failed to enqueue extraction job for product URL ID ${productUrlId}:`, error);
      throw error;
    }
  }

  /**
   * Input for bulk extraction job enqueueing
   */
  /**
   * Enqueue multiple extraction jobs in bulk for efficiency.
   * Uses BullMQ's addBulk method to minimize Redis round trips.
   * @param jobs Array of extraction job inputs
   */
  async enqueueExtractionJobsBulk(
    jobs: Array<{ productUrlId: string; storeId: number; handle: string; priority?: number }>,
  ): Promise<void> {
    if (jobs.length === 0) {
      return;
    }

    try {
      const bulkJobs = jobs.map(job => ({
        name: JOB_NAMES.EXTRACT_PRODUCT,
        data: {
          productUrlId: job.productUrlId,
          storeId: job.storeId,
          handle: job.handle,
          priority: job.priority ?? 1,
        } satisfies ExtractProductJobData,
        opts: {
          priority: job.priority ?? 1,
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: {
            type: 'exponential' as const,
            delay: 2000,
          },
        },
      }));

      await this.extractionQueue.addBulk(bulkJobs);

      this.logger.log(`Enqueued ${jobs.length} extraction job(s) in bulk`);
    } catch (error) {
      this.logger.error(`Failed to bulk enqueue ${jobs.length} extraction jobs:`, error);
      throw error;
    }
  }

  /**
   * Get stats for the discovery queue
   */
  async getDiscoveryQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.discoveryQueue.getWaitingCount(),
      this.discoveryQueue.getActiveCount(),
      this.discoveryQueue.getCompletedCount(),
      this.discoveryQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Get stats for the extraction queue
   */
  async getExtractionQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.extractionQueue.getWaitingCount(),
      this.extractionQueue.getActiveCount(),
      this.extractionQueue.getCompletedCount(),
      this.extractionQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}
