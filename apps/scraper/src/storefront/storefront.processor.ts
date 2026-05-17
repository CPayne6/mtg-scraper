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

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(MtgSinglesCollection)
    private readonly collectionRepository: Repository<MtgSinglesCollection>,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly extractionService: ExtractionService,
  ) {
    this.logger.log('StorefrontProcessor instantiated');
  }

  /**
   * Extract all products from a store using ID-based pagination.
   *
   * Uses `products(query: "scope id:>lastId", sortKey: ID, first: 250)`
   * to step through the entire catalog. Each request starts fresh from
   * the last seen ID, so we never accumulate cursor state and never hit
   * the 25K pagination limit.
   */
  @Process({
    name: JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
    concurrency: 1,
  })
  async process(
    job: Job<StorefrontExtractionJobData>,
  ): Promise<StorefrontExtractionJobResult> {
    const { storeId, discoveryRunId, maxCardsAdded } = job.data;

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    const scope = store.scraperConfig?.storefrontScope;
    if (!scope) {
      throw new Error(
        `Store ${store.name} (${storeId}) is missing scraperConfig.storefrontScope`,
      );
    }

    this.logger.warn(
      `Starting Storefront ID-based extraction for ${store.name}` +
        (maxCardsAdded ? ` (limit: ${maxCardsAdded} cards)` : ''),
    );

    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    const collection = await this.getCollection(store);
    const collectionId = collection?.id ?? 0;

    let productsProcessed = 0;
    let cardsAdded = 0;
    let errors = 0;
    let limitReached = false;

    try {
      for await (const product of adapter.extractByIdPagination(
        store,
        scope,
      )) {
        try {
          const productUrl = await this.upsertProductUrl(
            store.id,
            product.handle,
            collectionId,
            product.updatedAt,
          );

          const result =
            await this.extractionService.processExtractedVariants(
              productUrl.id,
              store.id,
              product.handle,
              product.variants,
              discoveryRunId,
            );

          if (result.success) {
            productsProcessed++;
            cardsAdded += result.cardsUpserted ?? 0;
          } else {
            errors++;
          }

          // Check card limit
          if (maxCardsAdded && cardsAdded >= maxCardsAdded) {
            limitReached = true;
            this.logger.warn(
              `${store.name}: Card limit reached (${cardsAdded}/${maxCardsAdded}). Stopping.`,
            );
            break;
          }

          // Progress logging
          if (productsProcessed % 500 === 0 && productsProcessed > 0) {
            this.logger.warn(
              `${store.name}: ${productsProcessed} products, ${cardsAdded} cards, ${errors} errors`,
            );
          }
        } catch (error) {
          errors++;
          this.logger.error(
            `Error processing ${product.handle} at ${store.name}: ${error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Storefront extraction failed for ${store.name}: ${error}`,
      );
      throw error;
    }

    this.logger.warn(
      `Completed Storefront extraction for ${store.name}: ` +
        `${productsProcessed} products, ${cardsAdded} cards, ${errors} errors` +
        (limitReached ? ` (limit ${maxCardsAdded} reached)` : ''),
    );

    return {
      storeId,
      collectionHandle: collection?.slug ?? '',
      productsAttempted: productsProcessed + errors,
      productsProcessed,
      productsSkipped: 0,
      errors,
      variantsExtracted: 0,
      cardsAdded,
      maxCardsAdded,
      limitReached,
      success: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getCollection(
    store: Store,
  ): Promise<MtgSinglesCollection | null> {
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
    await this.productUrlRepository
      .createQueryBuilder()
      .insert()
      .into(ProductUrl)
      .values({
        storeId,
        handle,
        mtgSinglesCollectionId: collectionId,
        sitemapLastmod: updatedAt,
        extractionStatus: 'pending',
      })
      .orUpdate(['sitemap_lastmod'], ['store_id', 'handle'])
      .execute();

    return this.productUrlRepository.findOneOrFail({
      where: { storeId, handle },
    });
  }
}
