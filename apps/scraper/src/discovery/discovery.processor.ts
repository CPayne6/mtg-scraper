import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
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

  constructor(private readonly discoveryService: DiscoveryService) {}

  @Process({
    name: JOB_NAMES.DISCOVER_STORE,
    concurrency: 10,
  })
  async process(job: Job<DiscoverStoreJobData>): Promise<DiscoverStoreJobResult> {
    const { storeId } = job.data;

    this.logger.log(`[START] Discovery for store ID: ${storeId}`);

    try {
      const result = await this.discoveryService.discoverStore(storeId);

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

      return {
        storeId,
        discovered: 0,
        validated: 0,
        success: false,
        error: errorMessage,
      };
    }
  }
}
