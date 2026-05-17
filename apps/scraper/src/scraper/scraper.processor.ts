import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  ScrapeCardJobData,
  ScrapeCardJobResult,
} from '@scoutlgs/shared';
import { CacheService } from '@scoutlgs/core';
import { ScraperService } from './scraper.service';
import { ScrapeErrorType } from './errors';

// Scraper types that share a common API endpoint (all stores use same backend)
const SHARED_API_SCRAPER_TYPES = ['binderpos'];

@Processor(QUEUE_NAMES.CARD_SCRAPE)
export class ScrapeCardProcessor {
  private readonly logger = new Logger(ScrapeCardProcessor.name);

  // Jitter range to stagger delayed jobs (0-30 seconds)
  private readonly MAX_JITTER_MS = 30000;

  constructor(
    private readonly scraperService: ScraperService,
    private readonly cacheService: CacheService,
    @InjectQueue(QUEUE_NAMES.CARD_SCRAPE) private readonly queue: Queue,
  ) {}

  /**
   * Check if a store or its shared API is rate limited.
   * Always checks Redis directly to ensure rate limits are enforced across all workers.
   * Returns the remaining backoff time in ms, or undefined if not blocked.
   */
  private async checkRateLimitStatus(
    storeName: string,
    scraperType?: string,
  ): Promise<number | undefined> {
    // For stores with shared APIs (like BinderPOS), check API-level rate limit first
    if (scraperType && SHARED_API_SCRAPER_TYPES.includes(scraperType)) {
      const apiRateLimitCheck = await this.cacheService.isApiRateLimited(scraperType);
      if (apiRateLimitCheck.blocked && apiRateLimitCheck.remainingMs) {
        return apiRateLimitCheck.remainingMs;
      }
    }

    // Check store-level rate limit
    const rateLimitCheck = await this.cacheService.isStoreRateLimited(storeName);
    if (rateLimitCheck.blocked && rateLimitCheck.remainingMs) {
      return rateLimitCheck.remainingMs;
    }

    return undefined;
  }

  /**
   * Record rate limit for a store and optionally its shared API.
   */
  private async recordRateLimit(
    storeName: string,
    errorType: string,
    scraperType?: string,
    retryAfter?: number,
  ): Promise<number> {
    // Record store-level rate limit
    const backoffMs = await this.cacheService.recordStoreRateLimit(storeName, errorType, retryAfter);

    // For stores with shared APIs, also record API-level rate limit
    // This ensures ALL stores using this API get blocked together
    if (scraperType && SHARED_API_SCRAPER_TYPES.includes(scraperType)) {
      await this.cacheService.recordApiRateLimit(scraperType, errorType, retryAfter);
    }

    return backoffMs;
  }

  /**
   * Add random jitter to a delay to stagger jobs and prevent thundering herd.
   * Skip jitter for high-priority jobs (user requests) to keep them responsive.
   */
  private addJitter(delayMs: number, priority?: number): number {
    // Priority 10 = user request, skip jitter for responsiveness
    if (priority === 10) {
      return delayMs;
    }
    const jitter = Math.floor(Math.random() * this.MAX_JITTER_MS);
    return delayMs + jitter;
  }

  /**
   * Clear rate limit for a store and optionally its shared API.
   */
  private async clearRateLimit(storeName: string, scraperType?: string): Promise<void> {
    await this.cacheService.clearStoreRateLimit(storeName);

    // For shared APIs, clear API-level rate limit too
    if (scraperType && SHARED_API_SCRAPER_TYPES.includes(scraperType)) {
      await this.cacheService.clearApiRateLimit(scraperType);
    }
  }

  @Process({
    name: JOB_NAMES.SCRAPE_CARD,
    concurrency: 40,
  })
  async process(job: Job<ScrapeCardJobData>): Promise<ScrapeCardJobResult> {
    const { cardName, storeName, requestId, retryCount, scraperType } = job.data;

    // Ensure stores are loaded before processing
    await this.scraperService.waitUntilReady();

    // Check if store or its shared API is rate limited
    const remainingMs = await this.checkRateLimitStatus(storeName, scraperType);

    if (remainingMs) {
      const delayWithJitter = this.addJitter(remainingMs, job.opts.priority);
      this.logger.log(
        `[DELAYED] ${cardName} @ ${storeName}: rate limited, re-queuing with ${delayWithJitter}ms delay`,
      );

      await this.queue.add(
        JOB_NAMES.SCRAPE_CARD,
        job.data,
        {
          delay: delayWithJitter,
          priority: job.opts.priority,
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      return {
        cardName,
        storeName,
        results: [],
        timestamp: Date.now(),
        success: false,
        error: `Rate limited, rescheduled in ${remainingMs}ms`,
      };
    }

    this.logger.log(`[START] ${cardName} @ ${storeName}`);

    try {
      // Scrape single store
      const { results, error, errorType, retryAfter, scraperType: resultScraperType } =
        await this.scraperService.searchCardAtStore(cardName, storeName);

      // Use scraperType from result (more accurate) or fall back to job data
      const effectiveScraperType = resultScraperType ?? scraperType;

      // Errors that should NOT trigger backoff (waiting won't help)
      const noBackoffErrors = [
        ScrapeErrorType.NOT_FOUND,
        ScrapeErrorType.CLIENT_ERROR,
        ScrapeErrorType.PARSE_ERROR,
        ScrapeErrorType.INVALID_RESPONSE,
      ];

      // If there's a retryable error, update caches and re-queue the job
      if (errorType && !noBackoffErrors.includes(errorType)) {
        // Record rate limit with server-provided retry-after if available
        const backoffMs = await this.recordRateLimit(
          storeName,
          errorType,
          effectiveScraperType,
          retryAfter,
        );

        const delayWithJitter = this.addJitter(backoffMs, job.opts.priority);
        this.logger.warn(
          `[BACKOFF] ${cardName} @ ${storeName} (${errorType}): re-queuing with ${delayWithJitter}ms delay` +
          (retryAfter ? ` (server retry-after: ${retryAfter}s)` : ''),
        );

        await this.queue.add(
          JOB_NAMES.SCRAPE_CARD,
          { ...job.data, scraperType: effectiveScraperType },
          {
            delay: delayWithJitter,
            priority: job.opts.priority,
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        );

        // Don't cache the error - job will be retried
        // Don't remove the lock - keep it so other requests wait
        return {
          cardName,
          storeName,
          results: [],
          timestamp: Date.now(),
          success: false,
          error: `${errorType}, rescheduled in ${backoffMs}ms`,
        };
      }

      // Increment retry count if there was an error
      const newRetryCount = error ? (retryCount ?? 0) + 1 : retryCount;

      // Cache the result for this store-card combination
      await this.cacheService.setStoreCard(
        cardName,
        storeName,
        results,
        error,
        newRetryCount,
      );

      // Mark this store-card scrape as complete (removes lock)
      await this.cacheService.markStoreScrapeComplete(cardName, storeName);

      if (error) {
        this.logger.warn(`[DONE] ${cardName} @ ${storeName}: error (${errorType ?? 'unknown'})`);
      } else {
        // Clear any backoff state on success (resets consecutive failures)
        await this.clearRateLimit(storeName, effectiveScraperType);
        this.logger.log(`[DONE] ${cardName} @ ${storeName}: ${results.length} results`);
      }

      return {
        cardName,
        storeName,
        results,
        timestamp: Date.now(),
        success: !error,
        error,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`[FAIL] ${cardName} @ ${storeName}: ${errorMessage}`);

      // Cache the error state
      const newRetryCount = (retryCount ?? 0) + 1;
      await this.cacheService.setStoreCard(
        cardName,
        storeName,
        [],
        errorMessage,
        newRetryCount,
      );

      // Mark scrape complete even on failure so waiting requests don't hang
      await this.cacheService.markStoreScrapeComplete(cardName, storeName);

      return {
        cardName,
        storeName,
        results: [],
        timestamp: Date.now(),
        success: false,
        error: errorMessage,
      };
    }
  }
}
