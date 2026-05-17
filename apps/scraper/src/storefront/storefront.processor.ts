import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  StorefrontExtractionJobData,
  StorefrontExtractionJobResult,
  StorefrontBootstrapJobData,
} from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  ShopifyProduct,
  CardListing,
  PlatformAdapterFactory,
} from '@scoutlgs/core';
import type { ExtractedCardVariant } from '@scoutlgs/core';
import type { StorefrontExtractionAdapter } from '@scoutlgs/core';
import { ExtractionService } from '../extraction/extraction.service';
import { PrintingMatcherService } from '../extraction/printing-matcher.service';

interface ExtractedProduct {
  shopifyProductId: string;
  handle: string;
  updatedAt: Date;
  variants: ExtractedCardVariant[];
}

/**
 * Processes one page (250 products) per job.
 * After processing, enqueues the next page back into the queue.
 * With concurrency 5 per worker (× 3 workers = 15 concurrent pages),
 * pages from all stores interleave naturally.
 */
@Processor(QUEUE_NAMES.STOREFRONT_EXTRACTION)
export class StorefrontProcessor implements OnModuleInit {
  private readonly logger = new Logger(StorefrontProcessor.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(MtgSinglesCollection)
    private readonly collectionRepository: Repository<MtgSinglesCollection>,
    @InjectRepository(ShopifyProduct)
    private readonly shopifyProductRepository: Repository<ShopifyProduct>,
    @InjectRepository(CardListing)
    private readonly cardListingRepository: Repository<CardListing>,
    @InjectQueue(QUEUE_NAMES.STOREFRONT_EXTRACTION)
    private readonly storefrontQueue: Queue,
    private readonly dataSource: DataSource,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly extractionService: ExtractionService,
    private readonly printingMatcher: PrintingMatcherService,
  ) {
    this.logger.log('StorefrontProcessor instantiated');
  }

  async onModuleInit() {
    await this.printingMatcher.warmCaches();
  }

  /**
   * Process one page of products from a store.
   * Fetches 250 products starting from lastId, processes them,
   * then enqueues the next page if there are more products.
   */
  @Process({
    name: JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
    concurrency: 5,
  })
  async process(
    job: Job<StorefrontExtractionJobData>,
  ): Promise<StorefrontExtractionJobResult> {
    const { storeId, lastId, maxId, discoveryRunId } = job.data;

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    // Resolve scope from job data or store config
    const scope =
      job.data.scope ??
      store.scraperConfig?.storefrontScope;
    if (!scope) {
      throw new Error(
        `Store ${store.name} (${storeId}) is missing storefrontScope`,
      );
    }

    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    const collection = await this.getCollection(store);
    const collectionId = collection?.id ?? 0;

    // Fetch one page (with optional upper bound for range-split jobs)
    const { products, nextLastId } = await adapter.fetchPage(
      store,
      scope,
      lastId,
      maxId,
    );

    if (products.length === 0) {
      const rangeNote = maxId ? ` [range ≤${maxId}]` : '';
      this.logger.warn(`${store.name}${rangeNote}: no more products (done)`);
      return {
        storeId,
        productsProcessed: 0,
        cardsAdded: 0,
        errors: 0,
        isLastPage: true,
        success: true,
      };
    }

    // Process the page
    const pageResult = await this.processPage(
      products,
      store.id,
      collectionId,
      discoveryRunId,
    );

    // A "last page" within a range means: hit the end of the scope OR
    // crossed the upper bound. fetchPage signals this with nextLastId === null.
    const isLastPage = nextLastId === null;
    const rangeNote = maxId ? ` [≤${maxId}]` : '';

    this.logger.warn(
      `${store.name}${rangeNote}: ${products.length} products, ${pageResult.cards} cards, ${pageResult.errors} errors` +
        (isLastPage ? ' (range complete)' : ` (next: id:>${nextLastId})`),
    );

    // Enqueue next page if there are more products in this range
    if (!isLastPage) {
      await this.storefrontQueue.add(
        JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
        {
          storeId,
          lastId: nextLastId,
          maxId,
          scope,
          discoveryRunId,
        } as StorefrontExtractionJobData,
        {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    }

    return {
      storeId,
      productsProcessed: pageResult.processed,
      cardsAdded: pageResult.cards,
      errors: pageResult.errors,
      isLastPage,
      success: true,
    };
  }

  /**
   * Bootstrap job: discover min/max product IDs for a store, then enqueue
   * N parallel range-bounded extraction jobs.
   *
   * Lets a single store's pages be processed in parallel instead of being
   * chained sequentially by `lastId`. Throughput becomes constrained by
   * worker concurrency, not per-store sequentiality.
   */
  @Process({
    name: JOB_NAMES.BOOTSTRAP_STOREFRONT_EXTRACTION,
    concurrency: 5,
  })
  async bootstrap(
    job: Job<StorefrontBootstrapJobData>,
  ): Promise<{ storeId: number; rangesEnqueued: number; success: boolean }> {
    const { storeId, splitRanges, discoveryRunId } = job.data;

    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) throw new Error(`Store ${storeId} not found`);

    const scope = job.data.scope ?? store.scraperConfig?.storefrontScope;
    if (!scope) {
      throw new Error(
        `Store ${store.name} (${storeId}) is missing storefrontScope`,
      );
    }

    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    const { minId, maxId } = await adapter.fetchIdRange(store, scope);
    if (!minId || !maxId) {
      this.logger.warn(`${store.name}: bootstrap found no products`);
      return { storeId, rangesEnqueued: 0, success: true };
    }

    const ranges = splitIdRange(minId, maxId, splitRanges);
    this.logger.warn(
      `${store.name}: bootstrap [${minId}..${maxId}] → ${ranges.length} ranges`,
    );

    for (const { lastId, maxId: rangeMax } of ranges) {
      await this.storefrontQueue.add(
        JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
        {
          storeId,
          lastId,
          maxId: rangeMax,
          scope,
          discoveryRunId,
        } as StorefrontExtractionJobData,
        { removeOnComplete: 100, removeOnFail: 500 },
      );
    }

    return { storeId, rangesEnqueued: ranges.length, success: true };
  }


  // ---------------------------------------------------------------------------
  // Page processing with shopify_products lookup
  // ---------------------------------------------------------------------------

  private async processPage(
    products: ExtractedProduct[],
    storeId: number,
    collectionId: number,
    discoveryRunId?: number,
  ): Promise<{ processed: number; cards: number; errors: number }> {
    // Step 1: Bulk lookup shopify_products by PK
    const shopifyIds = products.map((p) => p.shopifyProductId);
    const existingRows = await this.shopifyProductRepository.find({
      where: { shopifyProductId: In(shopifyIds) },
      select: ['shopifyProductId', 'productUrlId', 'cardListingId', 'matchStatus'],
    });

    const existingMap = new Map(
      existingRows.map((r) => [r.shopifyProductId, r]),
    );

    // Step 2: Separate known (already matched) vs new
    const newProducts: ExtractedProduct[] = [];
    const knownProducts: {
      product: ExtractedProduct;
      productUrlId: number;
    }[] = [];

    for (const product of products) {
      const existing = existingMap.get(product.shopifyProductId);
      if (existing?.productUrlId && existing.matchStatus === 'matched') {
        knownProducts.push({
          product,
          productUrlId: existing.productUrlId,
        });
      } else {
        newProducts.push(product);
      }
    }

    let processed = 0;
    let cards = 0;
    let errors = 0;

    // Step 3: Known products — skip matching, just update variants
    for (const { product, productUrlId } of knownProducts) {
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
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    // Step 4: New products — full pipeline
    if (newProducts.length > 0) {
      const productUrlMap = await this.bulkUpsertProductUrls(
        storeId,
        collectionId,
        newProducts,
      );

      const successIds: number[] = [];
      const errorUpdates: { id: number; error: string }[] = [];
      const shopifyInserts: {
        shopifyProductId: string;
        productUrlId: number;
        matchStatus: string;
        isToken: boolean;
        cardListingId: number | null;
      }[] = [];

      for (const product of newProducts) {
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

            let matchStatus = 'unmatched';
            let cardListingId: number | null = null;
            const isToken =
              result.unmatchedCards === 0 &&
              result.matchedPrintings === 0 &&
              result.unmatchedPrintings === 0;

            if (isToken) {
              matchStatus = 'token';
            } else if (result.matchedPrintings > 0) {
              matchStatus = 'matched';
              const listing = await this.cardListingRepository.findOne({
                where: { productUrlId },
                select: ['id'],
              });
              cardListingId = listing?.id ?? null;
            }

            shopifyInserts.push({
              shopifyProductId: product.shopifyProductId,
              productUrlId,
              matchStatus,
              isToken,
              cardListingId,
            });
          } else {
            errors++;
            errorUpdates.push({
              id: productUrlId,
              error: result.error ?? 'Processing failed',
            });
            shopifyInserts.push({
              shopifyProductId: product.shopifyProductId,
              productUrlId,
              matchStatus: 'unmatched',
              isToken: false,
              cardListingId: null,
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

      await this.bulkUpdateProductUrlStatus(successIds, errorUpdates);

      if (shopifyInserts.length > 0) {
        await this.bulkUpsertShopifyProducts(storeId, shopifyInserts);
      }
    }

    return { processed, cards, errors };
  }

  // ---------------------------------------------------------------------------
  // Bulk DB operations
  // ---------------------------------------------------------------------------

  private async bulkUpsertProductUrls(
    storeId: number,
    collectionId: number,
    products: ExtractedProduct[],
  ): Promise<Map<string, number>> {
    if (products.length === 0) return new Map();

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

    await this.dataSource.query(
      `INSERT INTO product_urls (store_id, mtg_singles_collection_id, handle, sitemap_lastmod, extraction_status)
       VALUES ${values.join(', ')}
       ON CONFLICT (store_id, handle) DO UPDATE SET sitemap_lastmod = EXCLUDED.sitemap_lastmod`,
      params,
    );

    const handles = products.map((p) => p.handle);
    const rows = await this.productUrlRepository.find({
      where: { storeId, handle: In(handles) },
      select: ['id', 'handle'],
    });

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.handle, row.id);
    }
    return map;
  }

  private async bulkUpsertShopifyProducts(
    storeId: number,
    inserts: {
      shopifyProductId: string;
      productUrlId: number;
      matchStatus: string;
      isToken: boolean;
      cardListingId: number | null;
    }[],
  ): Promise<void> {
    if (inserts.length === 0) return;

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const row of inserts) {
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`,
      );
      params.push(
        row.shopifyProductId,
        storeId,
        row.productUrlId,
        row.cardListingId,
        row.isToken,
        row.matchStatus,
      );
      paramIdx += 6;
    }

    await this.dataSource.query(
      `INSERT INTO shopify_products (shopify_product_id, store_id, product_url_id, card_listing_id, is_token, match_status)
       VALUES ${values.join(', ')}
       ON CONFLICT (shopify_product_id) DO UPDATE SET
         card_listing_id = EXCLUDED.card_listing_id,
         match_status = EXCLUDED.match_status,
         is_token = EXCLUDED.is_token,
         updated_at = NOW()`,
      params,
    );
  }

  private async bulkUpdateProductUrlStatus(
    successIds: number[],
    errorUpdates: { id: number; error: string }[],
  ): Promise<void> {
    if (successIds.length > 0) {
      await this.productUrlRepository.update(
        { id: In(successIds) },
        {
          extractionStatus: 'success',
          lastExtractedAt: new Date(),
          extractionError: null as unknown as string,
        },
      );
    }

    for (const { id, error } of errorUpdates) {
      await this.productUrlRepository.update(
        { id },
        {
          extractionStatus: 'error',
          lastExtractedAt: new Date(),
          extractionError: error,
        },
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

/**
 * Split an ID range [minId, maxId] into `count` chunks of roughly equal ID-space.
 *
 * Returns chunks as `{ lastId, maxId }` pairs suitable for extraction jobs:
 *   - `lastId` is exclusive (the chunk fetches `id:>lastId`).
 *   - `maxId` is inclusive (the chunk fetches `id:<=maxId`).
 *
 * Chunk N covers `(boundary[N], boundary[N+1]]`. The first chunk uses
 * `minId - 1` as its exclusive lower bound so the actual minimum is included.
 *
 * Note: ID-space chunking gives roughly equal physical ranges, not equal
 * product counts. Stores with bursty imports will see uneven chunk durations.
 */
export function splitIdRange(
  minId: string,
  maxId: string,
  count: number,
): { lastId: string; maxId: string }[] {
  const min = BigInt(minId);
  const max = BigInt(maxId);
  if (count <= 1 || max <= min) {
    return [{ lastId: (min - 1n).toString(), maxId: max.toString() }];
  }

  const total = max - min + 1n;
  const chunkSize = total / BigInt(count);
  const remainder = total % BigInt(count);

  const ranges: { lastId: string; maxId: string }[] = [];
  let cursor = min - 1n;
  for (let i = 0; i < count; i++) {
    const size = chunkSize + (BigInt(i) < remainder ? 1n : 0n);
    const upper = cursor + size;
    ranges.push({ lastId: cursor.toString(), maxId: upper.toString() });
    cursor = upper;
  }
  return ranges;
}
