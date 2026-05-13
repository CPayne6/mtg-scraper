import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  ScrapeCardJobData,
  DiscoverStoreJobData,
  ExtractProductJobData,
  StorefrontExtractionJobData,
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

export interface BackpressureOptions {
  /** Maximum queue depth (waiting + active) before blocking. */
  maxDepth: number;
  /** Poll interval in ms while waiting for capacity. Default: 5000 */
  pollMs?: number;
}

const DEFAULT_BACKPRESSURE_POLL_MS = 5_000;

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  /** Map of queue name -> Queue instance for generic access. */
  private readonly queues: Map<string, Queue>;

  constructor(
    @InjectQueue(QUEUE_NAMES.CARD_SCRAPE)
    private readonly scrapeQueue: Queue<ScrapeCardJobData>,
    @InjectQueue(QUEUE_NAMES.PRODUCT_DISCOVERY)
    private readonly discoveryQueue: Queue<DiscoverStoreJobData>,
    @InjectQueue(QUEUE_NAMES.PRODUCT_EXTRACTION)
    private readonly extractionQueue: Queue<ExtractProductJobData>,
    @InjectQueue(QUEUE_NAMES.STOREFRONT_EXTRACTION)
    private readonly storefrontExtractionQueue: Queue<StorefrontExtractionJobData>,
  ) {
    this.queues = new Map<string, Queue>([
      [QUEUE_NAMES.CARD_SCRAPE, this.scrapeQueue],
      [QUEUE_NAMES.PRODUCT_DISCOVERY, this.discoveryQueue],
      [QUEUE_NAMES.PRODUCT_EXTRACTION, this.extractionQueue],
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
  async enqueueDiscoveryJob(
    storeId: number,
    priority: number = 1,
    options?: { skipExtraction?: boolean; discoveryRunId?: number },
  ): Promise<void> {
    try {
      await this.discoveryQueue.add(
        JOB_NAMES.DISCOVER_STORE,
        {
          storeId,
          priority,
          skipExtraction: options?.skipExtraction,
          discoveryRunId: options?.discoveryRunId,
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

  // ============== Extraction Queue Methods ==============

  /**
   * Enqueue an extraction job for a single product URL.
   * @param productUrlId The product URL record ID
   * @param storeId The store ID
   * @param handle The product handle (URL slug)
   * @param priority Job priority (default 1)
   */
  async enqueueExtractionJob(
    productUrlId: number,
    storeId: number,
    handle: string,
    priority: number = 1,
    discoveryRunId?: number,
  ): Promise<void> {
    try {
      await this.extractionQueue.add(
        JOB_NAMES.EXTRACT_PRODUCT,
        {
          productUrlId,
          storeId,
          handle,
          priority,
          discoveryRunId,
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
    jobs: Array<{ productUrlId: number; storeId: number; handle: string; priority?: number; discoveryRunId?: number }>,
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
          discoveryRunId: job.discoveryRunId,
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

  // ============== Queue Backpressure ==============

  private buildWaitlistKey(queueName: string): string {
    return `backpressure:${queueName}:waitlist`;
  }

  /**
   * Wait until a queue has capacity for `batchSize` more jobs.
   * Uses a Redis ZSET as a FIFO waitlist so multiple callers
   * across worker instances are served in order (longest-waiting first).
   *
   * @param queueName The queue name (from QUEUE_NAMES) to check capacity on
   * @param batchSize Number of jobs the caller wants to enqueue
   * @param callerId Identifier for the caller (e.g., store name) — used for logging and waitlist cleanup
   * @param options Backpressure thresholds
   */
  async waitForCapacity(
    queueName: string,
    batchSize: number,
    callerId: string,
    options: BackpressureOptions,
  ): Promise<void> {
    const queue = this.getQueueByName(queueName);
    const redis = await queue.client;
    const waitlistKey = this.buildWaitlistKey(queueName);
    const pollMs = options.pollMs ?? DEFAULT_BACKPRESSURE_POLL_MS;
    const waiterId = `${callerId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    try {
      const depth = await this.getDepthForQueue(queueName);

      // Fast path: queue has room AND no one else is waiting ahead
      const waitlistSize = await redis.zcard(waitlistKey);
      if (depth + batchSize <= options.maxDepth && waitlistSize === 0) {
        return;
      }

      // Register in waitlist (NX = only add if member not already present)
      await redis.zadd(waitlistKey, 'NX', Date.now().toString(), waiterId);
      this.logger.log(
        `[Backpressure:${queueName}] ${callerId} queued in waitlist ` +
        `(id=${waiterId}, queueDepth=${depth}, batchSize=${batchSize})`,
      );

      // Poll until we're first in line AND queue has capacity
      while (true) {
        await this.sleep(pollMs);

        const rank = await redis.zrank(waitlistKey, waiterId);
        if (rank === null) {
          // We were removed (e.g., cleanup) — just proceed
          return;
        }

        const currentDepth = await this.getDepthForQueue(queueName);

        if (rank === 0 && currentDepth + batchSize <= options.maxDepth) {
          await redis.zrem(waitlistKey, waiterId);
          this.logger.log(
            `[Backpressure:${queueName}] ${callerId} released from waitlist ` +
            `(queueDepth=${currentDepth}, batchSize=${batchSize})`,
          );
          return;
        }

        this.logger.debug(
          `[Backpressure:${queueName}] ${callerId} still waiting ` +
          `(rank=${rank}, queueDepth=${currentDepth}, batchSize=${batchSize})`,
        );
      }
    } catch (error) {
      // On error, clean up and let the batch proceed rather than deadlock
      this.logger.error(`[Backpressure:${queueName}] Error for ${callerId}: ${error}`);
      await redis.zrem(waitlistKey, waiterId).catch(() => {});
    }
  }

  /**
   * Remove any stale waitlist entries for a caller on a specific queue.
   * Call this when a job completes or fails to prevent leaked entries.
   *
   * @param queueName The queue name (from QUEUE_NAMES)
   * @param callerId The caller identifier prefix to match (e.g., store name)
   */
  async cleanupBackpressureWaiters(queueName: string, callerId: string): Promise<void> {
    try {
      const queue = this.getQueueByName(queueName);
      const redis = await queue.client;
      const waitlistKey = this.buildWaitlistKey(queueName);
      const members = await redis.zrange(waitlistKey, 0, -1);
      const staleMembers = members.filter((m) => m.startsWith(`${callerId}:`));
      if (staleMembers.length > 0) {
        await redis.zrem(waitlistKey, ...staleMembers);
        this.logger.log(
          `[Backpressure:${queueName}] Cleaned up ${staleMembers.length} stale waitlist entries for ${callerId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[Backpressure:${queueName}] Error cleaning up waitlist for ${callerId}: ${error}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
