import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  StorefrontExtractionJobData,
  StorefrontExtractionJobResult,
} from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  PlatformAdapterFactory,
} from '@scoutlgs/core';
import type { StorefrontExtractionAdapter } from '@scoutlgs/core';
import { ExtractionService } from '../extraction/extraction.service';

@Processor(QUEUE_NAMES.STOREFRONT_EXTRACTION)
export class StorefrontProcessor {
  private readonly logger = new Logger(StorefrontProcessor.name);
  private readonly ERROR_RATE_THRESHOLD = 0.25;
  private readonly MIN_ERRORS_FOR_RATE_FAILURE = 10;

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(MtgSinglesCollection)
    private readonly collectionRepository: Repository<MtgSinglesCollection>,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly extractionService: ExtractionService,
  ) {}

  @Process({ name: JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION, concurrency: 1 })
  async process(
    job: Job<StorefrontExtractionJobData>,
  ): Promise<StorefrontExtractionJobResult> {
    const { storeId, discoveryRunId } = job.data;

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    this.logger.log(
      `Starting Storefront collection extraction for ${store.name}`,
    );

    const collection = await this.getCollection(store);
    if (!collection) {
      throw new Error(
        `No MTG singles collection configured for ${store.name}`,
      );
    }
    const collectionHandle = collection.slug;

    // Get the Storefront extraction adapter
    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    let productsAttempted = 0;
    let productsProcessed = 0;
    let productsSkipped = 0;
    let variantsExtracted = 0;
    let errors = 0;

    try {
      for await (const product of adapter.extractCollection(
        store,
        collectionHandle,
      )) {
        productsAttempted++;

        try {
          // 1. Upsert product_url row
          const productUrl = await this.upsertProductUrl(
            store.id,
            product.handle,
            collection.id,
            product.updatedAt,
          );

          // 2. Skip only if the stored extraction is newer than Shopify's updatedAt.
          if (this.isCurrentExtraction(productUrl, product.updatedAt)) {
            productsSkipped++;
            continue;
          }

          // 3. Process variants inline
          const result = await this.extractionService.processExtractedVariants(
            productUrl.id,
            store.id,
            product.handle,
            product.variants,
            discoveryRunId,
          );

          if (result.success) {
            variantsExtracted += result.variantsExtracted;
            productsProcessed++;
          } else {
            errors++;
          }

          // 4. Report progress periodically
          if (productsAttempted % 100 === 0) {
            await job.updateProgress({
              productsAttempted,
              productsProcessed,
              productsSkipped,
              errors,
              variantsExtracted,
            });
            this.logger.log(
              `${store.name}: Attempted ${productsAttempted} products, processed ${productsProcessed}, skipped ${productsSkipped}, errors ${errors}`,
            );
          }
        } catch (error) {
          errors++;
          this.logger.error(
            `Error processing ${product.handle} at ${store.name}: ${error}`,
          );
          // Continue with next product rather than failing the entire job
        }
      }
    } catch (error) {
      // Collection-level error (e.g., API down, collection not found after first page)
      this.logger.error(
        `Collection extraction failed for ${store.name}: ${error}`,
      );
      throw error;
    }

    if (productsAttempted > 0 && productsProcessed === 0 && errors > 0) {
      throw new Error(
        `Storefront extraction failed for ${store.name}: all ${productsAttempted} attempted products failed`,
      );
    }

    const errorRate = productsAttempted > 0 ? errors / productsAttempted : 0;
    if (
      errors >= this.MIN_ERRORS_FOR_RATE_FAILURE &&
      errorRate > this.ERROR_RATE_THRESHOLD
    ) {
      throw new Error(
        `Storefront extraction failed for ${store.name}: ${errors}/${productsAttempted} products failed`,
      );
    }

    this.logger.log(
      `Completed Storefront extraction for ${store.name}: ` +
        `${productsProcessed} processed, ${productsSkipped} skipped, ${variantsExtracted} variants, ${errors} errors`,
    );

    return {
      storeId,
      collectionHandle,
      productsAttempted,
      productsProcessed,
      productsSkipped,
      errors,
      variantsExtracted,
      success: true,
    };
  }

  private async getCollection(store: Store): Promise<MtgSinglesCollection | null> {
    if (!store.discoveryConfig?.mtgSinglesCollectionId) {
      return null;
    }

    return this.collectionRepository.findOne({
      where: { id: store.discoveryConfig.mtgSinglesCollectionId },
    });
  }

  private async upsertProductUrl(
    storeId: number,
    handle: string,
    collectionId: number,
    updatedAt: Date,
  ): Promise<ProductUrl> {
    let productUrl = await this.productUrlRepository.findOne({
      where: { storeId, handle },
    });

    if (productUrl) {
      // Update sitemapLastmod with the Storefront API's updatedAt
      productUrl.sitemapLastmod = updatedAt;
      await this.productUrlRepository.save(productUrl);
    } else {
      // Create new product_url
      productUrl = this.productUrlRepository.create({
        storeId,
        handle,
        mtgSinglesCollectionId: collectionId,
        sitemapLastmod: updatedAt,
        extractionStatus: 'pending',
      });
      productUrl = await this.productUrlRepository.save(productUrl);
    }

    return productUrl;
  }

  private isCurrentExtraction(productUrl: ProductUrl, storefrontUpdatedAt: Date): boolean {
    if (!productUrl.lastExtractedAt) return false;
    if (productUrl.extractionStatus === 'error') return false;
    if (Number.isNaN(storefrontUpdatedAt.getTime())) return false;

    return productUrl.lastExtractedAt >= storefrontUpdatedAt;
  }
}
