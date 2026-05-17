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
  RetryUnmatchedJobData,
  RetryUnmatchedJobResult,
} from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  ShopifyProduct,
  UnmatchedCard,
  CardListing,
  PlatformAdapterFactory,
} from '@scoutlgs/core';
import type { ExtractedCardVariant } from '@scoutlgs/core';
import type { StorefrontExtractionAdapter } from '@scoutlgs/core';
import { ExtractionService } from '../extraction/extraction.service';
import { PrintingMatcherService } from '../extraction/printing-matcher.service';
import { BatchAccumulatorService } from '../extraction/batch-accumulator.service';
import type { ListingRow, VariantRow } from '../extraction/listing-upsert.service';

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
    @InjectRepository(UnmatchedCard)
    private readonly unmatchedCardRepository: Repository<UnmatchedCard>,
    @InjectRepository(CardListing)
    private readonly cardListingRepository: Repository<CardListing>,
    @InjectQueue(QUEUE_NAMES.STOREFRONT_EXTRACTION)
    private readonly storefrontQueue: Queue,
    private readonly dataSource: DataSource,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly extractionService: ExtractionService,
    private readonly printingMatcher: PrintingMatcherService,
    private readonly batchAccumulator: BatchAccumulatorService,
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

  /**
   * Retry matching on unmatched_cards. Loads a batch of unmatched products
   * (one row per product_url), re-runs the printing matcher against each,
   * and promotes any that now match to card_listings via the batch
   * accumulator.
   *
   * Why this works: the matcher now uses warmed LRU caches and improved
   * extractors. Cards that failed during the initial extraction's warm-up
   * race or with older extractor logic can be promoted retroactively
   * without re-fetching from Shopify.
   */
  @Process({
    name: JOB_NAMES.RETRY_UNMATCHED,
    concurrency: 1,
  })
  async retryUnmatched(
    job: Job<RetryUnmatchedJobData>,
  ): Promise<RetryUnmatchedJobResult> {
    const { storeId, limit = 5000 } = job.data;

    // One representative row per product_url so we don't re-match the same
    // product N times (once per variant). DISTINCT ON is Postgres-specific,
    // so we use the QueryBuilder's distinctOn() helper rather than .find().
    const qb = this.unmatchedCardRepository
      .createQueryBuilder('uc')
      .select([
        'uc.productUrlId',
        'uc.storeId',
        'uc.rawName',
        'uc.setCode',
        'uc.collectorNumber',
        'uc.setName',
      ])
      .distinctOn(['uc.product_url_id'])
      .where('uc.productUrlId IS NOT NULL')
      .orderBy('uc.product_url_id')
      .addOrderBy('uc.id')
      .limit(limit);

    if (storeId) qb.andWhere('uc.storeId = :storeId', { storeId });

    const unmatchedProducts = await qb.getMany();

    this.logger.warn(
      `retry-unmatched: ${unmatchedProducts.length} products to retry` +
        (storeId ? ` (store ${storeId})` : ''),
    );

    let matched = 0;
    let stillUnmatched = 0;
    let errors = 0;

    // Process in batches: run the matcher per product in-memory, then collapse
    // every DB write into bulk operations. Reduces ~3 round-trips/product to
    // ~3 round-trips per batch (regardless of size).
    const BATCH_SIZE = 500;
    for (let i = 0; i < unmatchedProducts.length; i += BATCH_SIZE) {
      const batch = unmatchedProducts.slice(i, i + BATCH_SIZE);

      const matchedProducts: Array<{
        product: typeof batch[0];
        result: Awaited<ReturnType<PrintingMatcherService['match']>>;
      }> = [];
      const stillUnmatchedKeys: Array<{ pid: number; sid: number }> = [];

      for (const product of batch) {
        try {
          const result = await this.printingMatcher.match(
            product.rawName,
            product.setCode ?? undefined,
            product.collectorNumber ?? undefined,
            product.setName ?? undefined,
          );

          if (result.confidence !== 'none' && result.cardNameId) {
            matchedProducts.push({ product, result });
          } else {
            stillUnmatchedKeys.push({
              pid: product.productUrlId,
              sid: product.storeId,
            });
          }
        } catch (error) {
          errors++;
          this.logger.error(
            `retry-unmatched ${product.rawName}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Bulk-promote matched products in this batch
      if (matchedProducts.length > 0) {
        await this.bulkPromoteToListings(matchedProducts);
        matched += matchedProducts.length;
      }

      // Bulk-bump retry_count for still-unmatched products
      if (stillUnmatchedKeys.length > 0) {
        await this.bulkBumpRetryCount(stillUnmatchedKeys);
        stillUnmatched += stillUnmatchedKeys.length;
      }
    }

    this.logger.warn(
      `retry-unmatched complete: ${matched} matched, ${stillUnmatched} still unmatched, ${errors} errors`,
    );

    return {
      storeId: storeId ?? null,
      attempted: unmatchedProducts.length,
      matched,
      stillUnmatched,
      errors,
      success: true,
    };
  }

  /**
   * Bulk-promote a batch of matched products to card_listings.
   * Collapses what used to be 3N queries (find variants, delete unmatched,
   * update shopify_products — once per product) into 3 queries per batch.
   */
  private async bulkPromoteToListings(
    items: Array<{
      product: Pick<UnmatchedCard, 'productUrlId' | 'storeId' | 'rawName'>;
      result: {
        cardNameId: number | null;
        cardPrintingId: number | null;
        nameMatch: 'exact' | 'fuzzy' | 'frontface' | 'none';
        setMatch: 'code_provided' | 'name_exact' | 'name_fuzzy' | 'none';
        printingMatch: 'set_and_number' | 'set_only' | 'any' | 'none';
      };
    }>,
  ): Promise<void> {
    if (items.length === 0) return;

    const productUrlIds = items.map((i) => i.product.productUrlId);

    // 1 query: fetch all variants for every product in the batch
    const allVariants = await this.unmatchedCardRepository.find({
      where: { productUrlId: In(productUrlIds) },
    });

    // Group variants by product_url_id for assembly
    const variantsByProduct = new Map<number, UnmatchedCard[]>();
    for (const v of allVariants) {
      const list = variantsByProduct.get(v.productUrlId) ?? [];
      list.push(v);
      variantsByProduct.set(v.productUrlId, list);
    }

    // Build listing rows for the batch accumulator (in-memory)
    const accumulatorRows = items
      .map(({ product, result }) => {
        const variants = variantsByProduct.get(product.productUrlId) ?? [];
        if (variants.length === 0) return null;

        const inStock = variants.filter(
          (v) => v.inStock && (v.quantity == null || v.quantity > 0),
        );

        const variantRows: VariantRow[] = inStock.map((v) => ({
          conditionCode: v.condition,
          foil: v.foil,
          price: Number(v.price),
          quantity: v.quantity ?? null,
          platformVariantId: v.platformVariantId ?? null,
          sku: v.sku ?? null,
        }));

        if (variantRows.length === 0) return null;

        const listing: ListingRow = {
          cardNameId: result.cardNameId,
          cardPrintingId: result.cardPrintingId,
          storeId: product.storeId,
          productUrlId: product.productUrlId,
          rawTitle: product.rawName,
          imageUrl: variants[0]?.imageUrl ?? null,
          currency: variants[0]?.currency ?? 'CAD',
          nameMatch: result.nameMatch,
          setMatch: result.setMatch,
          printingMatch: result.printingMatch,
        };

        return {
          listing,
          variants: variantRows,
          staleCleanup: {
            productUrlId: product.productUrlId,
            inStockVariantIds: inStock
              .map((v) => v.platformVariantId)
              .filter((id): id is string => !!id),
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (accumulatorRows.length > 0) {
      this.batchAccumulator.addMany(accumulatorRows);
    }

    // 1 query: bulk-delete unmatched rows for every promoted product
    await this.unmatchedCardRepository.delete({
      productUrlId: In(productUrlIds),
    });

    // 1 query: bulk-update shopify_products status for the batch
    await this.shopifyProductRepository.update(
      { productUrlId: In(productUrlIds) },
      { matchStatus: 'matched', updatedAt: new Date() },
    );
  }

  /**
   * Bulk-bump retry_count for products that still don't match after a retry
   * pass. One UPDATE instead of N.
   */
  private async bulkBumpRetryCount(
    keys: Array<{ pid: number; sid: number }>,
  ): Promise<void> {
    if (keys.length === 0) return;

    // Group by store_id (typically all the same, but be safe) so a single
    // UPDATE per group can use IN-list semantics cleanly.
    const byStore = new Map<number, number[]>();
    for (const { pid, sid } of keys) {
      const list = byStore.get(sid) ?? [];
      list.push(pid);
      byStore.set(sid, list);
    }

    for (const [storeId, pids] of byStore.entries()) {
      await this.unmatchedCardRepository
        .createQueryBuilder()
        .update()
        .set({
          retryCount: () => 'COALESCE(retry_count, 0) + 1',
          lastRetryAt: () => 'NOW()',
        })
        .where('product_url_id IN (:...pids) AND store_id = :storeId', {
          pids,
          storeId,
        })
        .execute();
    }
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
