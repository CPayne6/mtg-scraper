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
  CartProductRefreshJobData,
  CartProductRefreshJobResult,
  CartRefreshItemResult,
  StorefrontKnownOfferRecoveryJobData,
} from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  ShopifyProduct,
  UnmatchedCard,
  CardListing,
  CardVariant,
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
  rawProductTitle: string;
  updatedAt: Date;
  isArtSeries?: boolean;
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

// Storefront's documented nodes(ids:) query accepts up to 250 IDs. Keep all
// exact-ID refresh paths at that limit so large refreshes do not serialize
// five times as many network round trips.
const STOREFRONT_NODES_BATCH_SIZE = 250;

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
    @InjectRepository(CardVariant)
    private readonly cardVariantRepository: Repository<CardVariant>,
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
    await this.backfillShopifyListingMappings();
  }

  /**
   * This is an idempotent compatibility backfill, but every Swarm scraper
   * replica starts it at once after a deployment. Serialize it explicitly:
   * the broad UPDATE otherwise deadlocks and prevents workers from starting.
   */
  private async backfillShopifyListingMappings(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [47_384_921]);
      await queryRunner.query(
        `UPDATE shopify_products sp SET card_listing_id = cl.id
         FROM card_listings cl
         WHERE sp.card_listing_id IS NULL AND sp.store_id = cl.store_id
           AND sp.product_url_id = cl.product_url_id`,
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction().catch(() => undefined);
      const code = (error as { code?: string; driverError?: { code?: string } }).code
        ?? (error as { driverError?: { code?: string } }).driverError?.code;
      // Existing product_url_id joins keep refresh lookup correct; do not
      // sacrifice the entire worker to a transient startup deadlock.
      if (code === '40P01') {
        this.logger.warn('Skipping startup Shopify-listing mapping backfill after a database deadlock');
        return;
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
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
   * Ranges are split until their millisecond timestamp precision is exhausted.
   * An unsplittable 25K bucket cannot be discovered exhaustively through
   * Storefront pagination, so known local offers are recovered separately.
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
        if (!canSplitDateRange(createdAtStart, createdAtEnd)) {
          this.logger.error(
            `${store.name}: INCOMPLETE DISCOVERY: bucket [${createdAtStart}..${createdAtEnd}) hit Shopify's 25K limit at timestamp precision; recovering known offers only`,
          );
          await this.storefrontQueue.add(
            JOB_NAMES.STOREFRONT_KNOWN_OFFER_RECOVERY,
            { storeId, createdAtStart, createdAtEnd, discoveryRunId } satisfies StorefrontKnownOfferRecoveryJobData,
            STOREFRONT_JOB_OPTS,
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
            success: true,
            error: 'Incomplete discovery: recovered known local offers only',
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
   * Fetches only already-mapped Shopify IDs. This is deliberately a nodes(ids:)
   * recovery, never a catalog/discovery query: Shopify cannot paginate an
   * irreducibly dense created_at timestamp bucket past 25K products.
   */
  @Process({ name: JOB_NAMES.STOREFRONT_KNOWN_OFFER_RECOVERY, concurrency: 2 })
  async recoverKnownOffers(job: Job<StorefrontKnownOfferRecoveryJobData>) {
    const { storeId, createdAtStart, createdAtEnd, discoveryRunId } = job.data;
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) throw new Error(`Store ${storeId} not found`);
    // product_url_id is the durable association. Do not depend on the direct
    // card_listing_id backfill being complete before recovery starts.
    const known = await this.dataSource.query<{ shopifyProductId: string; cardListingId: number }[]>(
      `SELECT sp.shopify_product_id AS "shopifyProductId", cl.id AS "cardListingId"
       FROM shopify_products sp
       INNER JOIN card_listings cl ON cl.store_id = sp.store_id
         AND cl.product_url_id = sp.product_url_id
       WHERE sp.store_id = $1 AND sp.match_status = 'matched'`,
      [storeId],
    );
    const adapter = this.platformAdapterFactory.getExtractionAdapter(store.platformType!) as StorefrontExtractionAdapter;
    let recovered = 0;
    let errors = 0;
    for (let offset = 0; offset < known.length; offset += STOREFRONT_NODES_BATCH_SIZE) {
      const batch = known.slice(offset, offset + STOREFRONT_NODES_BATCH_SIZE);
      try {
        const { products } = await adapter.fetchProductsByIds(store, batch.map((row) => row.shopifyProductId));
        const returned = new Set(products.map((product) => product.shopifyProductId));
        const missingListingIds = batch.filter((row) => !returned.has(row.shopifyProductId)).map((row) => row.cardListingId!);
        // Only a successful exact-ID response is evidence of absence.
        if (missingListingIds.length) await this.cardVariantRepository.update({ cardListingId: In(missingListingIds) }, { inStock: false, quantity: 0 });
        if (products.length) await this.processPage(products, storeId, discoveryRunId);
        recovered += products.length;
      } catch (error) {
        errors++;
        this.logger.warn(`${store.name}: known-offer recovery batch ${offset} failed; preserved catalog data: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.logger.error(`${store.name}: INCOMPLETE DISCOVERY remains for [${createdAtStart}..${createdAtEnd}); recovered ${recovered}/${known.length} known offers, failures=${errors}. Unknown Shopify products cannot be recovered without pagination.`);
    return { storeId, recovered, known: known.length, errors, success: errors === 0, incompleteDiscovery: true };
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

    // Re-fetch known IDs directly through Storefront's nodes(ids:) API.
    // Each batch:
    //   1. Fetch from Shopify first — if this fails, no DB changes
    //   2. Delete the batch's stale unmatched_cards rows
    //   3. Run processPage (upserts product_urls, matches, promotes or
    //      writes fresh unmatched_cards rows from the new extraction)
    //
    // This ordering limits data loss on failure to a single 50-product batch
    // instead of the entire job's remaining products.
    const BATCH_SIZE = STOREFRONT_NODES_BATCH_SIZE;
    for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
      const batch = unmatched.slice(i, i + BATCH_SIZE);
      const batchProductUrlIds = batch
        .map((p) => p.productUrlId)
        .filter((id): id is number => id != null);

      try {
        // 1. Fetch first — pre-commit to nothing if Shopify fails
        const { products } = await adapter.fetchProductsByIds(store, batch.map((p) => p.shopifyProductId));
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

  /** Re-fetches bounded, known Shopify products for the cart cards only. */
  @Process({ name: JOB_NAMES.CART_PRODUCT_REFRESH, concurrency: 2 })
  async refreshCartProducts(job: Job<CartProductRefreshJobData>): Promise<CartProductRefreshJobResult> {
    // The request service calculates this before enqueueing. Retain the
    // derived fallback so older queued jobs remain refreshable.
    const totalProducts = job.data.totalProducts ?? job.data.targets.reduce((total, target) => total + target.products.length, 0);
    let completedProducts = 0;
    let lastPublishedProgress = 0;
    let progressWrite = Promise.resolve();
    const reportProgress = async (count: number) => {
      completedProducts += count;
      const completedPercent = totalProducts === 0 ? 100 : (completedProducts / totalProducts) * 100;
      // Publish at most once per 5% boundary. This gives the client useful,
      // stable information while limiting progression writes to 20 per job.
      const progress = Math.min(95, Math.floor(completedPercent / 5) * 5);
      if (progress <= lastPublishedProgress) return;
      lastPublishedProgress = progress;
      const completedAtWrite = completedProducts;
      // Store workers complete independently; serialize Redis writes so a
      // slower earlier batch cannot overwrite a newer percentage.
      progressWrite = progressWrite.then(async () => {
        await this.setJobProgress(job, progress);
        this.logger.log(`cart-product-refresh ${job.id}: ${progress}% (${completedAtWrite}/${totalProducts})`);
      });
      await progressWrite;
    };
    await this.setJobProgress(job, totalProducts === 0 ? 100 : 0);
    const outcomes = new Map<number, CartRefreshItemResult>(job.data.snapshot.map((item) => [item.variantId, {
      variantId: item.variantId, title: item.title, cardKey: item.cardKey, previousPrice: item.previousPrice,
      outcome: (!item.storeId || !item.shopifyProductId ? 'unsupported' : 'unconfirmed') as import('@scoutlgs/shared').CartRefreshOutcome,
    }]));

    // Dispatch every exact-ID batch immediately. StorefrontClient's shared
    // per-store limiter controls the actual request rate, so this keeps the
    // worker fully utilized without bypassing Shopify throttle protection.
    await Promise.all(job.data.targets.map(async (target) => {
      try {
        const store = await this.storeRepository.findOne({ where: { id: target.storeId } });
        if (!store) throw new Error('Store no longer exists');
        const adapter = this.platformAdapterFactory.getExtractionAdapter(store.platformType!) as StorefrontExtractionAdapter;
        // Each nodes(ids:) request remains bounded to Shopify's 250-ID limit;
        // the requests themselves may run in parallel.
        await Promise.all(Array.from(
          { length: Math.ceil(target.products.length / STOREFRONT_NODES_BATCH_SIZE) },
          async (_, index) => {
          const offset = index * STOREFRONT_NODES_BATCH_SIZE;
          const batch = target.products.slice(offset, offset + STOREFRONT_NODES_BATCH_SIZE);
          const batchIds = new Set(batch.map((product) => product.productId));
          const targetItems = job.data.snapshot.filter((item) => item.storeId === target.storeId && item.shopifyProductId && batchIds.has(item.shopifyProductId));
          try {
            const { products } = await adapter.fetchProductsByIds(store, batch.map(({ productId }) => productId));
            const returned = new Set(products.map((product) => product.shopifyProductId));
            const missing = batch.filter((product) => !returned.has(product.productId));
            const missingListingIds = missing.flatMap((product) => product.listingIds);
            // A confirmed absent product invalidates every locally known offer
            // for that product, not merely the cart's selected variant.
            if (missingListingIds.length) await this.cardVariantRepository.update({ cardListingId: In(missingListingIds) }, { inStock: false, quantity: 0 });
            for (const item of targetItems.filter((item) => !returned.has(item.shopifyProductId!))) outcomes.set(item.variantId, { variantId: item.variantId, title: item.title, cardKey: item.cardKey, previousPrice: item.previousPrice, outcome: 'unavailable' });
            const processed = products.length ? await this.processPage(products, store.id) : undefined;
            if (processed && processed.errors > 0) {
              for (const item of targetItems.filter((item) => returned.has(item.shopifyProductId!))) {
                outcomes.set(item.variantId, { variantId: item.variantId, title: item.title, cardKey: item.cardKey, previousPrice: item.previousPrice, outcome: 'unconfirmed', message: 'Listing extraction did not complete' });
              }
              await reportProgress(batch.length);
              return;
            }
            const refreshed = await this.cardVariantRepository.find({ where: { id: In(targetItems.filter((item) => returned.has(item.shopifyProductId!)).map((item) => item.variantId)) } });
            const byId = new Map(refreshed.map((variant) => [variant.id, variant]));
            for (const item of targetItems) {
              if (!returned.has(item.shopifyProductId!)) continue;
              const variant = byId.get(item.variantId);
              if (!variant || !variant.inStock) outcomes.set(item.variantId, { variantId: item.variantId, title: item.title, cardKey: item.cardKey, previousPrice: item.previousPrice, outcome: 'unavailable' });
              else outcomes.set(item.variantId, { variantId: item.variantId, title: item.title, cardKey: item.cardKey, previousPrice: item.previousPrice, price: Number(variant.price), outcome: Number(variant.price) !== item.previousPrice ? 'price_changed' : 'refreshed' });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            for (const item of targetItems) outcomes.set(item.variantId, { variantId: item.variantId, title: item.title, cardKey: item.cardKey, previousPrice: item.previousPrice, outcome: 'unconfirmed', message });
            this.logger.warn(`cart-product-refresh store ${target.storeId} batch ${offset}: ${message}`);
          }
          await reportProgress(batch.length);
          },
        ));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const targetItems = job.data.snapshot.filter((item) => item.storeId === target.storeId && item.shopifyProductId);
        for (const item of targetItems) outcomes.set(item.variantId, { variantId: item.variantId, title: item.title, cardKey: item.cardKey, previousPrice: item.previousPrice, outcome: 'unconfirmed', message });
        this.logger.warn(`cart-product-refresh store ${target.storeId}: ${message}`);
        await reportProgress(target.products.length);
      }
    }));
    await progressWrite;
    await this.setJobProgress(job, 100);
    this.logger.log(`cart-product-refresh ${job.id}: 100% (${completedProducts}/${totalProducts})`);
    return { items: [...outcomes.values()], success: true };
  }

  // ---------------------------------------------------------------------------
  // Page processing with shopify_products lookup
  // ---------------------------------------------------------------------------

  private async processPage(
    products: ExtractedProduct[],
    storeId: number,
    discoveryRunId?: number,
  ): Promise<{ processed: number; cards: number; errors: number }> {
    const artSeriesProducts = products.filter((product) => product.isArtSeries);
    const cardProducts = products.filter((product) => !product.isArtSeries);

    await this.excludeArtSeriesProducts(storeId, artSeriesProducts);

    if (cardProducts.length === 0) {
      return { processed: artSeriesProducts.length, cards: 0, errors: 0 };
    }

    // Step 1: Bulk lookup shopify_products by PK
    const shopifyIds = cardProducts.map((p) => p.shopifyProductId);
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

    for (const product of cardProducts) {
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

    await this.bulkUpdateShopifyProductTitles(
      storeId,
      knownProducts.map(({ product }) => product),
    );
    await this.reconcileShopifyListingMappings(storeId, knownProducts.map(({ productUrlId }) => productUrlId));

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
        rawProductTitle: string;
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
              rawProductTitle: product.rawProductTitle,
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
              rawProductTitle: product.rawProductTitle,
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
      await this.reconcileShopifyListingMappings(storeId, [...productUrlMap.values()]);
    }

    return {
      processed: processed + artSeriesProducts.length,
      cards,
      errors,
    };
  }

  /**
   * Remove Art Series products from search results and remember that the
   * Shopify product is intentionally excluded. This also clears any listing
   * created before Art Series filtering was added.
   */
  private async excludeArtSeriesProducts(
    storeId: number,
    products: ExtractedProduct[],
  ): Promise<void> {
    if (products.length === 0) return;

    const productUrlMap = await this.bulkUpsertProductUrls(storeId, products);
    const productUrlIds = [...productUrlMap.values()];

    if (productUrlIds.length > 0) {
      await Promise.all([
        this.cardListingRepository.delete({ productUrlId: In(productUrlIds) }),
        this.unmatchedCardRepository.delete({ productUrlId: In(productUrlIds) }),
      ]);
      await this.bulkUpdateProductUrlStatus(productUrlIds, []);
    }

    await this.bulkUpsertShopifyProducts(
      storeId,
      products.flatMap((product) => {
        const productUrlId = productUrlMap.get(product.handle);
        return productUrlId
          ? [{
              shopifyProductId: product.shopifyProductId,
              productUrlId,
              matchStatus: 'excluded',
              isToken: false,
              cardListingId: null,
              rawProductTitle: product.rawProductTitle,
            }]
          : [];
      }),
    );
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
      rawProductTitle: string;
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
          rawProductTitle: row.rawProductTitle,
          productUrlId: row.productUrlId,
          cardListingId: row.cardListingId,
          isToken: row.isToken,
          matchStatus: row.matchStatus as 'pending' | 'matched' | 'unmatched' | 'token' | 'excluded',
          updatedAt: now,
        })),
      )
      .orUpdate(
        ['raw_product_title', 'card_listing_id', 'match_status', 'is_token', 'updated_at'],
        ['shopify_product_id'],
      )
      .execute();
  }

  /** The listing is durable at product-url upsert time; keep the optional
   * direct mapping in sync for fast lookups while retaining URL fallback. */
  private async reconcileShopifyListingMappings(storeId: number, productUrlIds: number[]): Promise<void> {
    if (!productUrlIds.length) return;
    await this.shopifyProductRepository.query(
      `UPDATE shopify_products sp SET card_listing_id = cl.id
       FROM card_listings cl
       WHERE sp.store_id = $1 AND sp.product_url_id = cl.product_url_id
         AND cl.store_id = $1 AND sp.product_url_id = ANY($2)`,
      [storeId, productUrlIds],
    );
  }

  private async bulkUpdateShopifyProductTitles(
    storeId: number,
    products: ExtractedProduct[],
  ): Promise<void> {
    if (products.length === 0) return;

    await this.shopifyProductRepository
      .createQueryBuilder()
      .insert()
      .values(
        products.map((product) => ({
          shopifyProductId: product.shopifyProductId,
          storeId,
          rawProductTitle: product.rawProductTitle,
          updatedAt: new Date(),
        })),
      )
      .orUpdate(['raw_product_title', 'updated_at'], ['shopify_product_id'])
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

  /** @nestjs/bull workers expose Bull's progress(value), while the queue
   * client uses BullMQ's updateProgress(value). Support both at this boundary. */
  private async setJobProgress(job: Job, progress: number): Promise<void> {
    const queueJob = job as unknown as {
      updateProgress?: (value: number) => Promise<void>;
      progress?: (value: number) => Promise<void>;
    };
    if (typeof queueJob.updateProgress === 'function') {
      await queueJob.updateProgress(progress);
    } else if (typeof queueJob.progress === 'function') {
      await queueJob.progress(progress);
    }
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

/** Shopify's ISO filters are millisecond-precise; do not create empty ranges. */
export function canSplitDateRange(start: string, end: string): boolean {
  return new Date(end).getTime() - new Date(start).getTime() > 1;
}
