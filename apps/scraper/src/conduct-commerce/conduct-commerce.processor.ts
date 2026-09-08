import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { JOB_NAMES, QUEUE_NAMES, ConductCommerceCatalogJobData } from '@scoutlgs/shared';
import {
  ConductCommerceApiError,
  ConductCommerceExtractionAdapter,
  ConductCategoryAudit,
  ProductUrl,
  Store,
} from '@scoutlgs/core';
import type { ConductCategoryExtraction } from '@scoutlgs/core';
import { ExtractionService } from '../extraction/extraction.service';

/**
 * Conduct's listings endpoint returns a complete response for a requested
 * category/search rather than Shopify's cursor connection.  The adapter owns
 * that source traversal; this processor only persists its normalized output.
 */
@Processor(QUEUE_NAMES.CONDUCT_COMMERCE_EXTRACTION)
export class ConductCommerceProcessor {
  private readonly logger = new Logger(ConductCommerceProcessor.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(ConductCategoryAudit)
    private readonly categoryAuditRepository: Repository<ConductCategoryAudit>,
    private readonly adapter: ConductCommerceExtractionAdapter,
    private readonly extractionService: ExtractionService,
  ) {}

  @Process({ name: JOB_NAMES.CONDUCT_COMMERCE_CATALOG, concurrency: 1 })
  async extract(job: Job<ConductCommerceCatalogJobData>) {
    const store = await this.storeRepository.findOne({ where: { id: job.data.storeId } });
    if (!store) throw new Error(`Store ${job.data.storeId} not found`);
    if (!store.isActive || store.platformType !== 'conduct_commerce') {
      throw new Error(`Store ${store.name} is not an active Conduct Commerce store`);
    }

    try {
      let processed = 0;
      let cards = 0;
      let errors = 0;
      let productsSeen = 0;
      await this.adapter.extractConfiguredSource(store, async (category) => {
        productsSeen += category.listingCount;
        await this.recordCategoryAudit(store, job.data.discoveryRunId, category);
        for (const product of category.products) {
          if (product.variants.length === 0) continue;
          const handle = String(product.inventoryID);
          let productUrl = await this.productUrlRepository.findOne({
            where: { storeId: store.id, handle },
          });
          if (!productUrl) {
            productUrl = this.productUrlRepository.create({ storeId: store.id, handle });
            productUrl = await this.productUrlRepository.save(productUrl);
          }
          try {
            const result = await this.extractionService.processExtractedVariants(
              productUrl.id,
              store.id,
              handle,
              product.variants,
              job.data.discoveryRunId,
            );
            if (result.success) {
              processed++;
              cards += result.cardsUpserted;
            } else {
              errors++;
            }
          } catch (error) {
            errors++;
            this.logger.warn(`${store.name}: failed Conduct inventory ${handle}: ${(error as Error).message}`);
          }
        }
      });
      return { storeId: store.id, products: productsSeen, processed, cards, errors, success: errors === 0 };
    } catch (error) {
      // Permanent configuration/API-contract failures must surface immediately;
      // transient upstream errors use Bull's bounded retry policy.
      if (error instanceof ConductCommerceApiError && !error.retryable) {
        await job.discard();
      }
      throw error;
    }
  }

  private async recordCategoryAudit(
    store: Store,
    extractionRunId: number | undefined,
    category: ConductCategoryExtraction,
  ) {
    const prior = await this.categoryAuditRepository.createQueryBuilder('audit')
      .where('audit.store_id = :storeId', { storeId: store.id })
      .andWhere('audit.category_name = :categoryName', { categoryName: category.category.name })
      .orderBy('audit.completed_at', 'DESC').getOne();
    if (prior && prior.listingCount >= 100 && category.listingCount < prior.listingCount / 2) {
      this.logger.warn(`${store.name}: Conduct category '${category.category.name}' dropped from ${prior.listingCount} to ${category.listingCount} listings`);
    }
    await this.categoryAuditRepository.save(this.categoryAuditRepository.create({
      storeId: store.id, extractionRunId, categoryId: category.category.id,
      categoryName: category.category.name, visible: category.category.visible,
      listingCount: category.listingCount, variantCount: category.variantCount,
    }));
  }
}
