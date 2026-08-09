import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bullmq';
import { JOB_NAMES, QUEUE_NAMES, type CartProductRefreshJobData, type CartProductRefreshJobResult } from '@scoutlgs/shared';
import { StorefrontProcessor } from './storefront.processor';

/**
 * Interactive list refreshes have their own queue and worker concurrency.
 * This prevents long-running catalog discovery from delaying user feedback.
 */
@Processor(QUEUE_NAMES.LIST_REFRESH)
export class ListRefreshProcessor {
  constructor(private readonly storefrontProcessor: StorefrontProcessor) {}

  @Process({ name: JOB_NAMES.CART_PRODUCT_REFRESH, concurrency: 2 })
  refresh(job: Job<CartProductRefreshJobData>): Promise<CartProductRefreshJobResult> {
    return this.storefrontProcessor.refreshCartProducts(job);
  }
}
