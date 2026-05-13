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
  private readonly STALENESS_HOURS = 24;

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
    const { storeId, collectionHandle, discoveryRunId } = job.data;

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    this.logger.log(
      `Starting Storefront collection extraction for ${store.name} (collection: ${collectionHandle})`,
    );

    // Get the MTG singles collection by slug
    const collection = await this.getCollection(store, collectionHandle);
    if (!collection) {
      throw new Error(
        `No MTG singles collection found for ${store.name} (handle: ${collectionHandle})`,
      );
    }

    // Get the Storefront extraction adapter
    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    let productsExtracted = 0;
    let variantsExtracted = 0;
    let errors = 0;

    try {
      for await (const product of adapter.extractCollection(
        store,
        collectionHandle,
      )) {
        try {
          // 1. Upsert product_url row
          const productUrl = await this.upsertProductUrl(
            store.id,
            product.handle,
            collection.id,
            product.updatedAt,
          );

          // 2. Skip if recently extracted and not stale
          if (this.isRecentlyExtracted(productUrl)) {
            productsExtracted++;
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

          variantsExtracted += result.variantsExtracted;
          productsExtracted++;

          // 4. Report progress periodically
          if (productsExtracted % 100 === 0) {
            await job.updateProgress({
              productsExtracted,
              variantsExtracted,
            });
            this.logger.log(
              `${store.name}: Processed ${productsExtracted} products, ${variantsExtracted} variants`,
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

    this.logger.log(
      `Completed Storefront extraction for ${store.name}: ` +
        `${productsExtracted} products, ${variantsExtracted} variants, ${errors} errors`,
    );

    return {
      storeId,
      collectionHandle,
      productsExtracted,
      variantsExtracted,
      success: true,
    };
  }

  private async getCollection(
    store: Store,
    collectionHandle: string,
  ): Promise<MtgSinglesCollection | null> {
    return this.collectionRepository.findOne({
      where: { slug: collectionHandle },
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

  private isRecentlyExtracted(productUrl: ProductUrl): boolean {
    if (!productUrl.lastExtractedAt) return false;
    if (productUrl.extractionStatus === 'error') return false;

    const hoursAgo =
      (Date.now() - productUrl.lastExtractedAt.getTime()) / (1000 * 60 * 60);
    return hoursAgo < this.STALENESS_HOURS;
  }
}
