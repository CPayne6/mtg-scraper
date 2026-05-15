import { Process, Processor } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import type { ExtractedCardVariant } from '@scoutlgs/core';
import type { StorefrontExtractionAdapter } from '@scoutlgs/core';
import { ExtractionService } from '../extraction/extraction.service';
import { PrintingMatcherService } from '../extraction/printing-matcher.service';

/** A single extracted product ready for processing */
interface ExtractedProduct {
  handle: string;
  updatedAt: Date;
  variants: ExtractedCardVariant[];
}

@Processor(QUEUE_NAMES.STOREFRONT_EXTRACTION)
export class StorefrontProcessor implements OnModuleInit {
  private readonly logger = new Logger(StorefrontProcessor.name);
  private readonly PAGE_SIZE = 250;

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(MtgSinglesCollection)
    private readonly collectionRepository: Repository<MtgSinglesCollection>,
    private readonly dataSource: DataSource,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly extractionService: ExtractionService,
    private readonly printingMatcher: PrintingMatcherService,
  ) {
    this.logger.log('StorefrontProcessor instantiated');
  }

  /**
   * Pre-warm the printing matcher caches on startup.
   * Loads card_names and sets into LRU caches so the first extraction
   * run doesn't pay the cold-cache penalty per product.
   */
  async onModuleInit() {
    await this.printingMatcher.warmCaches();
  }

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

    // Accumulate products per API page for batched DB operations
    let pageBatch: ExtractedProduct[] = [];

    try {
      for await (const product of adapter.extractByIdPagination(
        store,
        scope,
      )) {
        pageBatch.push(product);

        // Process in batches of PAGE_SIZE (one API page)
        if (pageBatch.length >= this.PAGE_SIZE) {
          const pageResult = await this.processPage(
            pageBatch, store.id, collectionId, discoveryRunId,
          );
          productsProcessed += pageResult.processed;
          cardsAdded += pageResult.cards;
          errors += pageResult.errors;
          pageBatch = [];

          if (maxCardsAdded && cardsAdded >= maxCardsAdded) {
            limitReached = true;
            this.logger.warn(
              `${store.name}: Card limit reached (${cardsAdded}/${maxCardsAdded}). Stopping.`,
            );
            break;
          }

          if (productsProcessed % 500 === 0 && productsProcessed > 0) {
            this.logger.warn(
              `${store.name}: ${productsProcessed} products, ${cardsAdded} cards, ${errors} errors`,
            );
          }
        }
      }

      // Flush remaining products
      if (pageBatch.length > 0 && !limitReached) {
        const pageResult = await this.processPage(
          pageBatch, store.id, collectionId, discoveryRunId,
        );
        productsProcessed += pageResult.processed;
        cardsAdded += pageResult.cards;
        errors += pageResult.errors;
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
  // Batched page processing
  // ---------------------------------------------------------------------------

  /**
   * Process a batch of products from one API page:
   * 1. Bulk upsert all product_urls in one query
   * 2. Process each product's variants (uses cached matcher)
   * 3. Bulk update product_url statuses in one query
   */
  private async processPage(
    products: ExtractedProduct[],
    storeId: number,
    collectionId: number,
    discoveryRunId?: number,
  ): Promise<{ processed: number; cards: number; errors: number }> {
    // Step 1: Bulk upsert product_urls (one query for the entire page)
    const productUrlMap = await this.bulkUpsertProductUrls(
      storeId, collectionId, products,
    );

    let processed = 0;
    let cards = 0;
    let errors = 0;
    const successIds: number[] = [];
    const errorUpdates: { id: number; error: string }[] = [];

    // Step 2: Process each product's variants
    for (const product of products) {
      const productUrlId = productUrlMap.get(product.handle);
      if (!productUrlId) {
        errors++;
        continue;
      }

      try {
        const result = await this.extractionService.processExtractedVariants(
          productUrlId,
          storeId,
          product.handle,
          product.variants,
          discoveryRunId,
        );

        if (result.success) {
          processed++;
          cards += result.cardsUpserted ?? 0;
          successIds.push(productUrlId);
        } else {
          errors++;
          errorUpdates.push({
            id: productUrlId,
            error: result.error ?? 'Processing failed',
          });
        }
      } catch (error) {
        errors++;
        errorUpdates.push({
          id: productUrlId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Step 3: Bulk update product_url statuses (two queries max)
    await this.bulkUpdateProductUrlStatus(successIds, errorUpdates);

    return { processed, cards, errors };
  }

  // ---------------------------------------------------------------------------
  // Bulk DB operations
  // ---------------------------------------------------------------------------

  /**
   * Upsert all product_urls for a page in a single INSERT ... ON CONFLICT query.
   * Returns a Map of handle → product_url ID.
   */
  private async bulkUpsertProductUrls(
    storeId: number,
    collectionId: number,
    products: ExtractedProduct[],
  ): Promise<Map<string, number>> {
    if (products.length === 0) return new Map();

    // Build VALUES clause
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const product of products) {
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, 'pending')`,
      );
      params.push(storeId, collectionId, product.handle, product.updatedAt);
      paramIdx += 4;
    }

    // Single INSERT ... ON CONFLICT for all products
    await this.dataSource.query(
      `INSERT INTO product_urls (store_id, mtg_singles_collection_id, handle, sitemap_lastmod, extraction_status)
       VALUES ${values.join(', ')}
       ON CONFLICT (store_id, handle) DO UPDATE SET sitemap_lastmod = EXCLUDED.sitemap_lastmod`,
      params,
    );

    // Fetch IDs for all handles in one query
    const handles = products.map((p) => p.handle);
    const rows: { id: number; handle: string }[] = await this.dataSource.query(
      `SELECT id, handle FROM product_urls WHERE store_id = $1 AND handle = ANY($2)`,
      [storeId, handles],
    );

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.handle, row.id);
    }
    return map;
  }

  /**
   * Bulk update product_url statuses after processing a page.
   * One UPDATE for successes, one for errors.
   */
  private async bulkUpdateProductUrlStatus(
    successIds: number[],
    errorUpdates: { id: number; error: string }[],
  ): Promise<void> {
    if (successIds.length > 0) {
      await this.dataSource.query(
        `UPDATE product_urls
         SET extraction_status = 'success',
             last_extracted_at = NOW(),
             extraction_error = NULL
         WHERE id = ANY($1)`,
        [successIds],
      );
    }

    // Errors are less common — update individually for per-row error messages
    for (const { id, error } of errorUpdates) {
      await this.dataSource.query(
        `UPDATE product_urls
         SET extraction_status = 'error',
             last_extracted_at = NOW(),
             extraction_error = $1
         WHERE id = $2`,
        [error, id],
      );
    }
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
}
