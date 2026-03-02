import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  DiscoverStoreJobData,
  DiscoverStoreJobResult,
} from '@scoutlgs/shared';
import { DiscoveryService } from './discovery.service';

@Processor(QUEUE_NAMES.PRODUCT_DISCOVERY)
export class DiscoveryProcessor {
  private readonly logger = new Logger(DiscoveryProcessor.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly dataSource: DataSource,
  ) {}

  @Process({
    name: JOB_NAMES.DISCOVER_STORE,
    concurrency: 10,
  })
  async process(job: Job<DiscoverStoreJobData>): Promise<DiscoverStoreJobResult> {
    const { storeId, discoveryRunId } = job.data;

    this.logger.log(`[START] Discovery for store ID: ${storeId}`);

    try {
      const result = await this.discoveryService.discoverStore(storeId, {
        skipExtraction: job.data.skipExtraction,
        discoveryRunId,
      });

      if (result.errors.length > 0) {
        this.logger.warn(
          `[DONE] Discovery for ${result.storeName}: ${result.discovered} discovered, ` +
            `${result.extractionJobsQueued} extraction jobs. Errors: ${result.errors.join(', ')}`,
        );
      } else {
        this.logger.log(
          `[DONE] Discovery for ${result.storeName}: ${result.discovered} discovered, ` +
            `${result.newProducts} new, ${result.updatedProducts} updated, ` +
            `${result.skippedInvalid} skipped invalid, ${result.extractionJobsQueued} extraction jobs`,
        );
      }

      // Update discovery run counters atomically
      if (discoveryRunId) {
        const hasErrors = result.errors.length > 0;
        await this.updateDiscoveryRun(discoveryRunId, {
          storesCompleted: hasErrors ? 0 : 1,
          storesFailed: hasErrors ? 1 : 0,
          totalDiscovered: result.discovered,
          totalNewProducts: result.newProducts,
          totalUpdatedProducts: result.updatedProducts,
          totalExtractionJobsQueued: result.extractionJobsQueued,
          totalErrors: result.errors.length,
        });
      }

      return {
        storeId,
        discovered: result.discovered,
        validated: result.newProducts,
        success: result.errors.length === 0,
        error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ERROR] Discovery failed for store ID ${storeId}: ${errorMessage}`);

      // Update discovery run on failure
      if (discoveryRunId) {
        await this.updateDiscoveryRun(discoveryRunId, {
          storesCompleted: 0,
          storesFailed: 1,
          totalDiscovered: 0,
          totalNewProducts: 0,
          totalUpdatedProducts: 0,
          totalExtractionJobsQueued: 0,
          totalErrors: 1,
        });
      }

      return {
        storeId,
        discovered: 0,
        validated: 0,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Atomically increment discovery run counters and auto-complete when all stores are done.
   */
  private async updateDiscoveryRun(
    runId: number,
    deltas: {
      storesCompleted: number;
      storesFailed: number;
      totalDiscovered: number;
      totalNewProducts: number;
      totalUpdatedProducts: number;
      totalExtractionJobsQueued: number;
      totalErrors: number;
    },
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `UPDATE discovery_runs SET
          stores_completed = stores_completed + $1,
          stores_failed = stores_failed + $2,
          total_discovered = total_discovered + $3,
          total_new_products = total_new_products + $4,
          total_updated_products = total_updated_products + $5,
          total_extraction_jobs_queued = total_extraction_jobs_queued + $6,
          total_errors = total_errors + $7,
          status = CASE
            WHEN stores_completed + $1 + stores_failed + $2 >= stores_total
            THEN 'completed' ELSE status END,
          completed_at = CASE
            WHEN stores_completed + $1 + stores_failed + $2 >= stores_total
            THEN NOW() ELSE completed_at END
        WHERE id = $8`,
        [
          deltas.storesCompleted,
          deltas.storesFailed,
          deltas.totalDiscovered,
          deltas.totalNewProducts,
          deltas.totalUpdatedProducts,
          deltas.totalExtractionJobsQueued,
          deltas.totalErrors,
          runId,
        ],
      );
    } catch (error) {
      this.logger.error(`Failed to update discovery run #${runId}: ${error}`);
    }
  }
}
