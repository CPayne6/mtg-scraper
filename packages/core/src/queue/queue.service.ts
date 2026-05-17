import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  StorefrontExtractionJobData,
  StorefrontBootstrapJobData,
  RetryUnmatchedJobData,
} from '@scoutlgs/shared';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  /** Map of queue name -> Queue instance for generic access. */
  private readonly queues: Map<string, Queue>;

  constructor(
    @InjectQueue(QUEUE_NAMES.STOREFRONT_EXTRACTION)
    private readonly storefrontExtractionQueue: Queue<
      | StorefrontExtractionJobData
      | StorefrontBootstrapJobData
      | RetryUnmatchedJobData
    >,
  ) {
    this.queues = new Map<string, Queue>([
      [QUEUE_NAMES.STOREFRONT_EXTRACTION, this.storefrontExtractionQueue],
    ]);
  }

  private getQueueByName(queueName: string): Queue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Unknown queue: ${queueName}`);
    }
    return queue;
  }

  /**
   * Get the current depth (waiting + active) for any queue by name.
   */
  async getDepthForQueue(queueName: string): Promise<number> {
    const queue = this.getQueueByName(queueName);
    const [waiting, active] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
    ]);
    return waiting + active;
  }

  /**
   * Enqueue a Storefront API collection extraction job for a store.
   * Storefront jobs perform collection discovery and product extraction in one pass.
   */
  async enqueueStorefrontExtractionJob(
    storeId: number,
    priority: number = 1,
    discoveryRunId?: number,
  ): Promise<void> {
    try {
      await this.storefrontExtractionQueue.add(
        JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
        {
          storeId,
          priority,
          discoveryRunId,
        } satisfies StorefrontExtractionJobData,
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

      this.logger.log(
        `Enqueued Storefront extraction job for store ID: ${storeId} (Priority: ${priority})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue Storefront extraction job for store ID ${storeId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Enqueue a bootstrap job that discovers a store's min/max product IDs
   * and fans out `splitRanges` range-bounded extraction jobs.
   *
   * Use this when you want single-store parallelism instead of the default
   * sequential pagination.
   */
  async enqueueStorefrontBootstrapJob(
    storeId: number,
    splitRanges: number,
    options: { discoveryRunId?: number; scope?: string } = {},
  ): Promise<void> {
    try {
      await this.storefrontExtractionQueue.add(
        JOB_NAMES.BOOTSTRAP_STOREFRONT_EXTRACTION,
        {
          storeId,
          splitRanges,
          ...options,
        } satisfies StorefrontBootstrapJobData,
        {
          priority: 1,
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );

      this.logger.log(
        `Enqueued Storefront bootstrap for store ${storeId} (splitRanges=${splitRanges})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue Storefront bootstrap for store ${storeId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Enqueue a retry-unmatched job. The worker loads unmatched_cards for the
   * given store (or all stores), re-runs the matcher, and promotes any that
   * now match to card_listings.
   */
  async enqueueRetryUnmatchedJob(
    opts: { storeId?: number; limit?: number } = {},
  ): Promise<void> {
    try {
      await this.storefrontExtractionQueue.add(
        JOB_NAMES.RETRY_UNMATCHED,
        opts satisfies RetryUnmatchedJobData,
        {
          priority: 1,
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      this.logger.log(
        `Enqueued retry-unmatched job (storeId=${opts.storeId ?? 'all'}, limit=${opts.limit ?? 'default'})`,
      );
    } catch (error) {
      this.logger.error('Failed to enqueue retry-unmatched job:', error);
      throw error;
    }
  }

  /**
   * Get stats for the Storefront extraction queue
   */
  async getStorefrontExtractionQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.storefrontExtractionQueue.getWaitingCount(),
      this.storefrontExtractionQueue.getActiveCount(),
      this.storefrontExtractionQueue.getCompletedCount(),
      this.storefrontExtractionQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}
