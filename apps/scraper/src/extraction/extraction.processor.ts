import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  ExtractProductJobData,
  ExtractProductJobResult,
} from '@scoutlgs/shared';
import { CacheService } from '@scoutlgs/core';
import { ExtractionService } from './extraction.service';
import { ScrapeError, ScrapeErrorType } from '../scraper/errors';

// Errors that should NOT trigger backoff (waiting won't help)
const NO_BACKOFF_ERRORS = [
  ScrapeErrorType.NOT_FOUND,
  ScrapeErrorType.CLIENT_ERROR,
  ScrapeErrorType.PARSE_ERROR,
  ScrapeErrorType.INVALID_RESPONSE,
];

@Processor(QUEUE_NAMES.PRODUCT_EXTRACTION)
export class ExtractionProcessor {
  private readonly logger = new Logger(ExtractionProcessor.name);

  // Jitter range to stagger delayed jobs (0-30 seconds)
  private readonly MAX_JITTER_MS = 30000;

  constructor(
    private readonly extractionService: ExtractionService,
    private readonly cacheService: CacheService,
    @InjectQueue(QUEUE_NAMES.PRODUCT_EXTRACTION)
    private readonly extractionQueue: Queue<ExtractProductJobData>,
  ) {}

  /**
   * Check if a store is rate limited.
   * Returns the remaining backoff time in ms, or undefined if not blocked.
   */
  private async checkRateLimitStatus(storeName: string): Promise<number | undefined> {
    const rateLimitCheck = await this.cacheService.isStoreRateLimited(storeName);
    if (rateLimitCheck.blocked && rateLimitCheck.remainingMs) {
      return rateLimitCheck.remainingMs;
    }
    return undefined;
  }

  /**
   * Record rate limit for a store.
   */
  private async recordRateLimit(
    storeName: string,
    errorType: string,
    retryAfter?: number,
  ): Promise<number> {
    return this.cacheService.recordStoreRateLimit(storeName, errorType, retryAfter);
  }

  /**
   * Clear rate limit for a store.
   */
  private async clearRateLimit(storeName: string): Promise<void> {
    await this.cacheService.clearStoreRateLimit(storeName);
  }

  /**
   * Add random jitter to a delay to stagger jobs and prevent thundering herd.
   */
  private addJitter(delayMs: number): number {
    const jitter = Math.floor(Math.random() * this.MAX_JITTER_MS);
    return delayMs + jitter;
  }

  @Process({
    name: JOB_NAMES.EXTRACT_PRODUCT,
    concurrency: 20,
  })
  async process(job: Job<ExtractProductJobData>): Promise<ExtractProductJobResult> {
    const { productUrlId, storeId, handle } = job.data;

    // Get store info for rate limiting
    const store = await this.extractionService.getStore(storeId);
    const storeName = store?.name ?? `store-${storeId}`;

    // Check if store is rate limited
    const remainingMs = await this.checkRateLimitStatus(storeName);

    if (remainingMs) {
      const delayWithJitter = this.addJitter(remainingMs);
      this.logger.log(
        `[DELAYED] ${handle} @ ${storeName}: rate limited, re-queuing with ${delayWithJitter}ms delay`,
      );

      await this.extractionQueue.add(
        JOB_NAMES.EXTRACT_PRODUCT,
        job.data,
        {
          delay: delayWithJitter,
          priority: job.opts.priority,
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      return {
        productUrlId,
        variantsExtracted: 0,
        success: false,
        error: `Rate limited, rescheduled in ${remainingMs}ms`,
      };
    }

    this.logger.debug(`[START] Extracting ${handle} @ ${storeName}`);

    try {
      const result = await this.extractionService.extractProduct(
        productUrlId,
        storeId,
        handle,
      );

      if (result.success) {
        // Clear any backoff state on success
        await this.clearRateLimit(storeName);
        this.logger.debug(
          `[DONE] Extracted ${result.variantsExtracted} variants, ` +
            `upserted ${result.cardsUpserted} cards for ${handle} @ ${storeName}`,
        );
      } else {
        this.logger.warn(`[FAIL] Extraction failed for ${handle} @ ${storeName}: ${result.error}`);
      }

      return {
        productUrlId,
        variantsExtracted: result.variantsExtracted,
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      // Handle ScrapeError with proper classification
      if (error instanceof ScrapeError) {
        const errorType = error.type;

        // Check if this error should trigger backoff
        if (!NO_BACKOFF_ERRORS.includes(errorType)) {
          const backoffMs = await this.recordRateLimit(
            storeName,
            errorType,
            error.retryAfter,
          );

          const delayWithJitter = this.addJitter(backoffMs);
          this.logger.warn(
            `[BACKOFF] ${handle} @ ${storeName} (${errorType}): re-queuing with ${delayWithJitter}ms delay` +
              (error.retryAfter ? ` (server retry-after: ${error.retryAfter}s)` : ''),
          );

          await this.extractionQueue.add(
            JOB_NAMES.EXTRACT_PRODUCT,
            job.data,
            {
              delay: delayWithJitter,
              priority: job.opts.priority,
              removeOnComplete: 100,
              removeOnFail: 500,
            },
          );

          return {
            productUrlId,
            variantsExtracted: 0,
            success: false,
            error: `${errorType}, rescheduled in ${backoffMs}ms`,
          };
        }

        // Non-retryable error - mark as failed
        this.logger.error(`[ERROR] ${handle} @ ${storeName} (${errorType}): ${error.message}`);
        return {
          productUrlId,
          variantsExtracted: 0,
          success: false,
          error: error.message,
        };
      }

      // Unknown error type
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ERROR] Extraction error for ${handle} @ ${storeName}: ${errorMessage}`);

      return {
        productUrlId,
        variantsExtracted: 0,
        success: false,
        error: errorMessage,
      };
    }
  }
}
