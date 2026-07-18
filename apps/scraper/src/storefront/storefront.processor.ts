import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  StorefrontPlanJobData,
  StorefrontBucketJobData,
  StorefrontBucketJobResult,
  ReextractUnmatchedJobData,
  ReextractUnmatchedJobResult,
} from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  ShopifyProduct,
  UnmatchedCard,
  CardListing,
  ExtractionHttpError,
  PlatformAdapterFactory,
  StorefrontPaginationLimitError,
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

// Pagination jobs re-enqueue themselves for the next page. Without explicit
// attempts/backoff they default to 1 try, so any transient `fetch failed`
// from undici (proxy IP drop, TLS hiccup) permanently fails that page.
//
// 5 attempts gives ~2 minutes of exponential backoff (5s, 10s, 20s, 40s) to
// recover from a single flaky proxy IP — empirically the EAI_AGAIN /
// UND_ERR_CONNECT_TIMEOUT errors we see are usually transient on individual
// IPs in the Webshare rotation, so a fresh proxy on the next attempt
// typically succeeds. Rate-limit errors (429 / THROTTLED) take a different
// path via rescheduleIfThrottled — they're not counted against this budget.
const STOREFRONT_JOB_OPTS = {
  removeOnComplete: 100,
  removeOnFail: 500,
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

// Cap recursive bucket splitting. F2F's empirical worst case was a single
// 10-day migration window with >25K products (Shopify catalog import on
// 2025-01-20/21 brought in ~50K cards at once). Yearly bucket → 6mo → 3mo →
// 6wk → 3wk → 10d → 5d → 2.5d → ~30hr covers that without abandonment.
// Hitting 25K at depth 8 means >800K products in a ~30hr window — that's a
// genuine outlier and surfacing it as an error is the right move.
const MAX_BUCKET_DEPTH = 8;

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
  ) {
    this.logger.log('StorefrontProcessor instantiated');
  }

  async onModuleInit() {
    this.printingMatcher.subscribeToCardDataChanges();
    await this.printingMatcher.warmCaches();
  }

  /**
   * Per-store plan job (V2 entrypoint).
   *
   * Probes the store's `created_at` range and enqueues one bucket job per
   * year between the min and max. Each bucket then cursor-paginates within
   * its date range, recursively splitting if it hits Shopify's 25K limit.
   *
   * Replaces the id-based bootstrap. The reason `created_at` instead of `id`:
   * Shopify's `products(query: "id:>X")` filter is undocumented and partially
   * ignored — pages came back with non-deterministic gaps and we silently
   * lost ~50% of large catalogs. `created_at` is a documented filter and
   * cursor pagination is documented to be exhaustive within a snapshot.
   */
  @Process({
    name: JOB_NAMES.STOREFRONT_PLAN,
    concurrency: 5,
  })
  async plan(
    job: Job<StorefrontPlanJobData>,
  ): Promise<{ storeId: number; bucketsEnqueued: number; success: boolean }> {
    const { storeId, discoveryRunId } = job.data;

    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) throw new Error(`Store ${storeId} not found`);

    const scope = store.scraperConfig?.storefrontScope;
    if (!scope) {
      throw new Error(
        `Store ${store.name} (${storeId}) is missing storefrontScope`,
      );
    }

    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    let minCreatedAt: string | null;
    let maxCreatedAt: string | null;
    try {
      ({ minCreatedAt, maxCreatedAt } = await adapter.findCreatedAtRange(
        store,
        scope,
      ));
    } catch (error) {
      if (await this.rescheduleIfThrottled(job, error)) {
        return { storeId, bucketsEnqueued: 0, success: true };
      }
      throw error;
    }

    if (!minCreatedAt || !maxCreatedAt) {
      this.logger.warn(`${store.name}: plan found no products`);
      return { storeId, bucketsEnqueued: 0, success: true };
    }

    const buckets = generateYearlyBuckets(minCreatedAt, maxCreatedAt);
    this.logger.warn(
      `${store.name}: plan [${minCreatedAt}..${maxCreatedAt}] → ${buckets.length} yearly buckets`,
    );

    for (const { start, end } of buckets) {
      await this.storefrontQueue.add(
        JOB_NAMES.STOREFRONT_BUCKET,
        {
          storeId,
          scope,
          createdAtStart: start,
          createdAtEnd: end,
          cursor: null,
          bucketDepth: 0,
          discoveryRunId,
        } satisfies StorefrontBucketJobData,
        STOREFRONT_JOB_OPTS,
      );
    }

    return { storeId, bucketsEnqueued: buckets.length, success: true };
  }

  /**
   * Per-date-range bucket job. Cursor-paginates products within
   * `[createdAtStart, createdAtEnd)` until either:
   *   - `hasNextPage: false` → the bucket is fully drained
   *   - `StorefrontPaginationLimitError` (Shopify's documented 25K cap) →
   *     halves the date range and enqueues two child buckets at depth+1
   *
   * Cap at MAX_BUCKET_DEPTH so a genuinely pathological store can't recurse
   * forever — log and abandon at the cap.
   */
  @Process({
    name: JOB_NAMES.STOREFRONT_BUCKET,
    concurrency: 5,
  })
  async bucket(
    job: Job<StorefrontBucketJobData>,
  ): Promise<StorefrontBucketJobResult> {
    const {
      storeId,
      scope,
      createdAtStart,
      createdAtEnd,
      cursor,
      bucketDepth,
      discoveryRunId,
    } = job.data;

    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) throw new Error(`Store ${storeId} not found`);

    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    let products: ExtractedProduct[];
    let nextCursor: string | null;
    try {
      const result = await adapter.fetchPageByCursor(
        store,
        scope,
        createdAtStart,
        createdAtEnd,
        cursor,
      );
      products = result.products;
      nextCursor = result.nextCursor;
    } catch (error) {
      if (error instanceof StorefrontPaginationLimitError) {
        if (bucketDepth >= MAX_BUCKET_DEPTH) {
          this.logger.error(
            `${store.name}: bucket [${createdAtStart}..${createdAtEnd}) hit 25K at max depth ${bucketDepth} — abandoning`,
          );
          return {
            storeId,
            createdAtStart,
            createdAtEnd,
            productsProcessed: 0,
            cardsAdded: 0,
            errors: 0,
            isBucketComplete: false,
            wasSplit: false,
            success: false,
            error: 'Max bucket depth exceeded',
          };
        }

        const [left, right] = halveDateRange(createdAtStart, createdAtEnd);
        this.logger.warn(
          `${store.name}: bucket [${createdAtStart}..${createdAtEnd}) hit 25K — splitting into [${left.end}) + [${right.start}..)`,
        );

        await Promise.all([
          this.storefrontQueue.add(
            JOB_NAMES.STOREFRONT_BUCKET,
            {
              storeId,
              scope,
              createdAtStart: left.start,
              createdAtEnd: left.end,
              cursor: null,
              bucketDepth: bucketDepth + 1,
              discoveryRunId,
            } satisfies StorefrontBucketJobData,
            STOREFRONT_JOB_OPTS,
          ),
          this.storefrontQueue.add(
            JOB_NAMES.STOREFRONT_BUCKET,
            {
              storeId,
              scope,
              createdAtStart: right.start,
              createdAtEnd: right.end,
              cursor: null,
              bucketDepth: bucketDepth + 1,
              discoveryRunId,
            } satisfies StorefrontBucketJobData,
            STOREFRONT_JOB_OPTS,
          ),
        ]);

        return {
          storeId,
          createdAtStart,
          createdAtEnd,
          productsProcessed: 0,
          cardsAdded: 0,
          errors: 0,
          isBucketComplete: false,
          wasSplit: true,
          success: true,
        };
      }
      if (await this.rescheduleIfThrottled(job, error)) {
        return {
          storeId,
          createdAtStart,
          createdAtEnd,
          productsProcessed: 0,
          cardsAdded: 0,
          errors: 0,
          isBucketComplete: false,
          wasSplit: false,
          success: true,
        };
      }
      throw error;
    }

    let cardsAdded = 0;
    let errors = 0;
    if (products.length > 0) {
      const pageResult = await this.processPage(
        products,
        store.id,
        discoveryRunId,
      );
      cardsAdded = pageResult.cards;
      errors = pageResult.errors;
    }

    const isBucketComplete = nextCursor === null;

    this.logger.warn(
      `${store.name} [${createdAtStart}..${createdAtEnd}) d=${bucketDepth}: ${products.length} products, ${cardsAdded} cards, ${errors} errors${
        isBucketComplete ? ' (bucket complete)' : ' (next page)'
      }`,
    );

    if (!isBucketComplete) {
      await this.storefrontQueue.add(
        JOB_NAMES.STOREFRONT_BUCKET,
        {
          storeId,
          scope,
          createdAtStart,
          createdAtEnd,
          cursor: nextCursor,
          bucketDepth,
          discoveryRunId,
        } satisfies StorefrontBucketJobData,
        STOREFRONT_JOB_OPTS,
      );
    }

    return {
      storeId,
      createdAtStart,
      createdAtEnd,
      productsProcessed: products.length,
      cardsAdded,
      errors,
      isBucketComplete,
      wasSplit: false,
      success: true,
    };
  }

  /**
   * Re-extract unmatched products from Shopify.
   *
   * Loads the store's unmatched product IDs (from shopify_products where
   * match_status='unmatched'), fetches them fresh from the Storefront API
   * in batches, and routes them through the normal `processPage` pipeline.
   *
   * Use this to apply extractor improvements (better title parsing, new
   * SKU formats, etc.) without re-fetching the entire catalog. Products
   * that now match get promoted; those still unmatched get their
   * `unmatched_cards` row replaced with the fresh extraction data so the
   * next retry has correct field values.
   */
  @Process({
    name: JOB_NAMES.REEXTRACT_UNMATCHED,
    concurrency: 2,
  })
  async reextractUnmatched(
    job: Job<ReextractUnmatchedJobData>,
  ): Promise<ReextractUnmatchedJobResult> {
    const { storeId, limit = 5000 } = job.data;

    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) throw new Error(`Store ${storeId} not found`);

    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    // Pull the unmatched Shopify product IDs for this store
    const unmatched = await this.shopifyProductRepository.find({
      where: { storeId, matchStatus: 'unmatched' },
      select: ['shopifyProductId', 'productUrlId'],
      take: limit,
    });

    this.logger.warn(
      `reextract-unmatched: ${store.name} has ${unmatched.length} unmatched products to re-fetch`,
    );

    if (unmatched.length === 0) {
      return {
        storeId,
        attempted: 0,
        refetched: 0,
        matched: 0,
        stillUnmatched: 0,
        errors: 0,
        success: true,
      };
    }

    let refetched = 0;
    let errors = 0;

    // Re-fetch in batches via the products(query: "id:X OR id:Y OR ...") API.
    // Each batch:
    //   1. Fetch from Shopify first — if this fails, no DB changes
    //   2. Delete the batch's stale unmatched_cards rows
    //   3. Run processPage (upserts product_urls, matches, promotes or
    //      writes fresh unmatched_cards rows from the new extraction)
    //
    // This ordering limits data loss on failure to a single 50-product batch
    // instead of the entire job's remaining products.
    const BATCH_SIZE = 50;
    for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
      const batch = unmatched.slice(i, i + BATCH_SIZE);
      const idQuery = batch
        .map((p) => `id:${p.shopifyProductId}`)
        .join(' OR ');
      const batchProductUrlIds = batch
        .map((p) => p.productUrlId)
        .filter((id): id is number => id != null);

      try {
        // 1. Fetch first — pre-commit to nothing if Shopify fails
        const { products } = await adapter.fetchProductsByQuery(store, idQuery);
        refetched += products.length;

        if (products.length === 0) continue;

        // 2. Drop stale unmatched_cards for this batch only. If we crash
        //    here or in processPage, only these ~50 products lose their
        //    old data — retrievable by re-running the job.
        if (batchProductUrlIds.length > 0) {
          await this.unmatchedCardRepository.delete({
            productUrlId: In(batchProductUrlIds),
          });
        }

        // 3. Process: writes the fresh extraction's view to the DB
        await this.processPage(products, store.id);
      } catch (error) {
        // If Shopify throttled us, reschedule the whole job for after
        // the cooldown and stop processing the rest of the batches.
        // BullMQ will pick up the rescheduled job; we return normally.
        if (await this.rescheduleIfThrottled(job, error)) {
          return {
            storeId,
            attempted: unmatched.length,
            refetched,
            matched: 0,
            stillUnmatched: unmatched.length - refetched,
            errors,
            success: true,
          };
        }
        errors++;
        this.logger.error(
          `reextract-unmatched batch ${i}-${i + batch.length}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // After processing, count what's left as still unmatched for the same set
    const stillUnmatched = await this.shopifyProductRepository.count({
      where: { storeId, matchStatus: 'unmatched' },
    });
    const matched = unmatched.length - stillUnmatched;

    this.logger.warn(
      `reextract-unmatched ${store.name} complete: refetched=${refetched}, matched=${matched}, stillUnmatched=${stillUnmatched}, errors=${errors}`,
    );

    return {
      storeId,
      attempted: unmatched.length,
      refetched,
      matched,
      stillUnmatched,
      errors,
      success: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Page processing with shopify_products lookup
  // ---------------------------------------------------------------------------

  private async processPage(
    products: ExtractedProduct[],
    storeId: number,
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
    products: ExtractedProduct[],
  ): Promise<Map<string, number>> {
    if (products.length === 0) return new Map();

    // On conflict, only refresh sitemap_lastmod — leave extraction_status
    // alone so previously-processed URLs keep their 'success'/'error' state
    // across re-discovery cycles.
    await this.productUrlRepository
      .createQueryBuilder()
      .insert()
      .values(
        products.map((p) => ({
          storeId,
          handle: p.handle,
          sitemapLastmod: p.updatedAt,
          extractionStatus: 'pending' as const,
        })),
      )
      .orUpdate(['sitemap_lastmod'], ['store_id', 'handle'])
      .execute();

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

    const now = new Date();
    await this.shopifyProductRepository
      .createQueryBuilder()
      .insert()
      .values(
        inserts.map((row) => ({
          shopifyProductId: row.shopifyProductId,
          storeId,
          productUrlId: row.productUrlId,
          cardListingId: row.cardListingId,
          isToken: row.isToken,
          matchStatus: row.matchStatus as 'pending' | 'matched' | 'unmatched' | 'token',
          updatedAt: now,
        })),
      )
      .orUpdate(
        ['card_listing_id', 'match_status', 'is_token', 'updated_at'],
        ['shopify_product_id'],
      )
      .execute();
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

  /**
   * If the error is a Shopify throttle (HTTP 429 or GraphQL THROTTLED) with
   * a known retryAfter, re-enqueue the same job with that delay instead of
   * letting BullMQ run its fixed exponential backoff.
   *
   * Returns true if the job was rescheduled — caller should return normally
   * rather than throwing, otherwise BullMQ would also retry on top of our
   * delayed re-enqueue.
   *
   * Adds ±20% jitter so multiple workers hitting the same store don't all
   * retry at the exact same moment.
   */
  private async rescheduleIfThrottled(
    job: Job,
    error: unknown,
  ): Promise<boolean> {
    if (!(error instanceof ExtractionHttpError)) return false;
    if (!error.retryAfter || error.retryAfter <= 0) return false;

    // Cap to 5 min — if Shopify is asking for longer than that, something
    // bigger is wrong and we should let normal job-fail visibility kick in.
    const baseMs = Math.min(error.retryAfter, 300) * 1000;
    const jittered = Math.round(baseMs * (0.8 + Math.random() * 0.4));

    this.logger.warn(
      `${job.name}: throttled (${error.statusCode}) — rescheduling in ${jittered}ms`,
    );

    await this.storefrontQueue.add(job.name, job.data, {
      ...STOREFRONT_JOB_OPTS,
      delay: jittered,
    });
    return true;
  }
}

/**
 * Split [minCreatedAt, maxCreatedAt] into yearly buckets aligned to Jan 1
 * UTC boundaries. The first bucket starts at the actual `minCreatedAt`
 * (not the year start) so the catalog's true earliest product is included.
 * The last bucket ends one second past `maxCreatedAt` so the most recent
 * product is included (created_at filter is exclusive on the upper bound).
 */
export function generateYearlyBuckets(
  minCreatedAt: string,
  maxCreatedAt: string,
): { start: string; end: string }[] {
  const min = new Date(minCreatedAt);
  const max = new Date(maxCreatedAt);
  if (min > max) return [];

  const buckets: { start: string; end: string }[] = [];
  let cursor = min;
  while (cursor <= max) {
    const nextYear = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1));
    const end = nextYear > max ? new Date(max.getTime() + 1000) : nextYear;
    buckets.push({ start: cursor.toISOString(), end: end.toISOString() });
    cursor = nextYear;
  }
  return buckets;
}

/**
 * Split a date range in two at its midpoint. Used by the bucket processor
 * when a query hits Shopify's 25K pagination cap — each half becomes its
 * own bucket job at bucketDepth + 1.
 */
export function halveDateRange(
  start: string,
  end: string,
): [{ start: string; end: string }, { start: string; end: string }] {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const midMs = startMs + Math.floor((endMs - startMs) / 2);
  const mid = new Date(midMs).toISOString();
  return [
    { start, end: mid },
    { start: mid, end },
  ];
}
