import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  StorefrontExtractionJobData,
  StorefrontBootstrapJobData,
  StorefrontPlanJobData,
  ReextractUnmatchedJobData,
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
      | StorefrontPlanJobData
      | ReextractUnmatchedJobData
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
    updatedSince?: string,
  ): Promise<void> {
    try {
      await this.storefrontExtractionQueue.add(
        JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
        {
          storeId,
          priority,
          discoveryRunId,
          updatedSince,
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
    options: { discoveryRunId?: number; scope?: string; updatedSince?: string } = {},
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
   * Enqueue a per-store plan job. The plan probes the store's `created_at`
   * range and fans out one bucket job per year. Each bucket job
   * cursor-paginates within its date range and recursively splits if it
   * hits Shopify's 25K depth limit.
   *
   * This is the replacement for `enqueueStorefrontExtractionJob` —
   * id-based chained pagination silently dropped products because Shopify
   * doesn't actually support `id:>X` as a filter on the Storefront API.
   */
  async enqueueStorefrontPlanJob(
    storeId: number,
    options: { discoveryRunId?: number } = {},
  ): Promise<void> {
    try {
      await this.storefrontExtractionQueue.add(
        JOB_NAMES.STOREFRONT_PLAN,
        { storeId, ...options } satisfies StorefrontPlanJobData,
        {
          priority: 1,
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      this.logger.log(`Enqueued storefront plan for store ${storeId}`);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue storefront plan for store ${storeId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Enqueue a re-extract-unmatched job. The worker pulls the store's
   * unmatched products' Shopify IDs, re-fetches them from the Storefront
   * API, and runs them through the current extraction pipeline.
   *
   * Use this to apply extractor fixes to previously-failed products
   * without re-fetching the entire catalog.
   */
  async enqueueReextractUnmatchedJob(
    opts: { storeId: number; limit?: number },
  ): Promise<void> {
    try {
      await this.storefrontExtractionQueue.add(
        JOB_NAMES.REEXTRACT_UNMATCHED,
        opts satisfies ReextractUnmatchedJobData,
        {
          priority: 1,
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      this.logger.log(
        `Enqueued reextract-unmatched job (storeId=${opts.storeId}, limit=${opts.limit ?? 'default'})`,
      );
    } catch (error) {
      this.logger.error('Failed to enqueue reextract-unmatched job:', error);
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
