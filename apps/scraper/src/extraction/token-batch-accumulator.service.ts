import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { TokenListingUpsertService, TokenListingWithVariants } from './token-listing-upsert.service';

@Injectable()
export class TokenBatchAccumulatorService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenBatchAccumulatorService.name);
  private readonly BATCH_SIZE = 500;
  private readonly FLUSH_INTERVAL_MS = 2000;
  private readonly MAX_CONCURRENT_FLUSHES = 3;

  private buffer: TokenListingWithVariants[] = [];
  private activeFlushes = 0;
  private drainLoop: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;

  constructor(private readonly tokenListingUpsertService: TokenListingUpsertService) {
    this.drainLoop = setInterval(() => {
      this.drainBuffer();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Add multiple token listing-with-variants items to the buffer. Returns immediately (non-blocking).
   * Kicks off a drain if buffer exceeds batch size.
   */
  addMany(items: TokenListingWithVariants[]): void {
    this.buffer.push(...items);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.drainBuffer();
    }
  }

  /**
   * Drain buffered items in batches. Multiple flushes can run concurrently
   * up to MAX_CONCURRENT_FLUSHES to keep the pipeline moving.
   */
  private drainBuffer(): void {
    while (
      this.buffer.length > 0 &&
      this.activeFlushes < this.MAX_CONCURRENT_FLUSHES
    ) {
      const batch = this.buffer.splice(0, this.BATCH_SIZE);
      this.activeFlushes++;

      this.tokenListingUpsertService
        .upsertBatch(batch)
        .then(async (count) => {
          // Run stale cleanup after upsert completes to avoid race condition
          for (const item of batch) {
            if (item.staleCleanup) {
              await this.tokenListingUpsertService.deleteStaleListings(
                item.staleCleanup.productUrlId,
                item.staleCleanup.inStockVariantIds,
              );
            }
          }

          // Increment extraction success counters per discovery run
          const runCounts = new Map<number, number>();
          for (const item of batch) {
            if (item.discoveryRunId) {
              runCounts.set(item.discoveryRunId, (runCounts.get(item.discoveryRunId) ?? 0) + 1);
            }
          }
          for (const [runId, n] of runCounts) {
            await this.tokenListingUpsertService.incrementRunExtractions(runId, n).catch((err) => {
              this.logger.error(`Failed to increment run #${runId} token extractions: ${err}`);
            });
          }

          this.logger.debug(`Flushed ${count} token listings to database`);
        })
        .catch((error) => {
          this.buffer.unshift(...batch);
          this.logger.error(
            `Flush failed, ${batch.length} token items re-queued: ${error}`,
          );
        })
        .finally(() => {
          this.activeFlushes--;
        });
    }
  }

  /**
   * Wait for all in-flight flushes to complete and drain remaining buffer.
   */
  async drain(): Promise<void> {
    while (this.buffer.length > 0 || this.activeFlushes > 0) {
      if (this.buffer.length > 0 && this.activeFlushes < this.MAX_CONCURRENT_FLUSHES) {
        this.drainBuffer();
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    if (this.drainLoop) {
      clearInterval(this.drainLoop);
      this.drainLoop = null;
    }

    await this.drain();
  }
}
