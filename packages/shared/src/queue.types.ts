export const QUEUE_NAMES = {
  STOREFRONT_EXTRACTION: 'storefront-extraction',
} as const;

export const PUBSUB_CHANNELS = {
  CARD_DATA_CHANGED: 'scoutlgs:card-data-changed',
} as const;

export const JOB_NAMES = {
  /** @deprecated id:>X chained pagination — replaced by the bucket flow. */
  EXTRACT_STOREFRONT_COLLECTION: 'extract-storefront-collection',
  /** @deprecated id-range bootstrap — replaced by STOREFRONT_PLAN. */
  BOOTSTRAP_STOREFRONT_EXTRACTION: 'bootstrap-storefront-extraction',
  /**
   * Per-store plan job: probes the store's `created_at` range and fans out
   * one bucket job per year. Replaces the legacy id-based bootstrap.
   */
  STOREFRONT_PLAN: 'storefront-plan',
  /**
   * Per-date-range bucket job. Cursor-paginates products matching
   * `scope created_at:>='start' created_at:<'end'`. On 25K depth-limit hit,
   * splits the date range in half and enqueues two child bucket jobs.
   */
  STOREFRONT_BUCKET: 'storefront-bucket',
  /**
   * Re-fetches unmatched products from the upstream Shopify Storefront API
   * and runs them through the current extraction pipeline. Use this to
   * apply extractor fixes (better title parsing, new SKU formats, etc.)
   * to products that previously failed to match — works even when the
   * stored `raw_name` is wrong because we pull fresh data from Shopify.
   */
  REEXTRACT_UNMATCHED: 'reextract-unmatched',
} as const;

/**
 * Platform types for extraction adapters
 */
export type PlatformType = 'shopify' | 'shopify_storefront' | 'conduct_commerce';

/**
 * Per-store opt-in flag for scheduled extraction. Stored in
 * stores.discovery_config (the column name is a leftover from the V2
 * pipeline; the V3 storefront flow only uses `discoveryEnabled`).
 */
export interface StoreDiscoveryConfig {
  discoveryEnabled: boolean;
  discoverySchedule?: string;
}

/**
 * Job data for extracting one page of products from Shopify Storefront API.
 * Each job fetches 250 products, processes them, then enqueues the next page.
 * With concurrency 5, pages from all stores interleave naturally.
 */
export interface StorefrontExtractionJobData {
  storeId: number;
  /** Shopify product ID to start from (id:>lastId). Null for first page. */
  lastId?: string | null;
  /**
   * Upper bound on Shopify product ID for this job (id:<=maxId).
   * Used when a store's range is split into N parallel jobs by the bootstrap
   * step. Omit for "no upper bound" (default behavior).
   */
  maxId?: string | null;
  /** Scope query for this store (e.g. 'product_type:"MTG Single"') */
  scope?: string;
  /**
   * ISO-8601 timestamp for incremental mode. When set, the query gets
   * `updated_at:>'<value>'` appended so only products modified after this
   * cutoff are returned. Propagated unchanged to next-page jobs so an
   * entire run uses a single, stable cutoff.
   */
  updatedSince?: string;
  priority?: number;
  discoveryRunId?: number;
  maxCardsAdded?: number;
  /**
   * Bumped by the @OnQueueFailed recovery handler each time a permanent
   * failure auto-re-enqueues this job. Caps the recovery loop so a
   * genuinely-broken page doesn't spin forever.
   */
  recoveryDepth?: number;
}

/**
 * Job data for the bootstrap phase that splits a store's ID range into N
 * parallel extraction jobs. Optional optimization triggered by passing
 * `splitRanges > 1` to the trigger endpoint.
 */
export interface StorefrontBootstrapJobData {
  storeId: number;
  /** Number of parallel range jobs to create. */
  splitRanges: number;
  scope?: string;
  /** Same as StorefrontExtractionJobData.updatedSince. Propagated to each range job. */
  updatedSince?: string;
  discoveryRunId?: number;
  maxCardsAdded?: number;
}

/**
 * Job data for re-extracting unmatched products from Shopify.
 * Scoped per-store; the worker pulls the store's unmatched product IDs
 * in batches, fetches them via Storefront API, and runs them through
 * the current extraction pipeline (which uses the latest extractor logic).
 */
export interface ReextractUnmatchedJobData {
  /** Required — re-extraction queries Shopify per-store. */
  storeId: number;
  /** Max products to re-fetch in this job. Default 5000. */
  limit?: number;
}

export interface ReextractUnmatchedJobResult {
  storeId: number;
  attempted: number;
  refetched: number;
  matched: number;
  stillUnmatched: number;
  errors: number;
  success: boolean;
}

/**
 * Result from extracting one page of products
 */
export interface StorefrontExtractionJobResult {
  storeId: number;
  productsProcessed: number;
  cardsAdded: number;
  errors: number;
  /** True if this was the last page (< 250 products returned) */
  isLastPage: boolean;
  success: boolean;
  error?: string;
}

/**
 * Per-store plan job. Probes the store's `created_at` range and fans out
 * one bucket job per year between the min and max. The bucket jobs then
 * cursor-paginate within their date range.
 *
 * Replaces the legacy chained-pagination model (which silently lost
 * products due to Shopify's undocumented `id:>X` behaviour).
 */
export interface StorefrontPlanJobData {
  storeId: number;
  discoveryRunId?: number;
}

/**
 * Job data for cursor-paginating one date bucket.
 *
 * Lifecycle:
 *   1. Plan job creates the initial bucket with `cursor: null` and a year-wide
 *      date range.
 *   2. The processor fetches one page and, if `nextCursor` is non-null,
 *      re-enqueues the same bucket with `cursor: nextCursor`.
 *   3. If Shopify returns the 25K depth error, the processor halves the
 *      date range and enqueues two child buckets with `bucketDepth + 1`.
 *
 * `bucketDepth` caps the recursive splitting (year → ~6mo → ~3mo → ~1mo → ~2wk).
 */
export interface StorefrontBucketJobData {
  storeId: number;
  scope: string;
  /** Inclusive ISO-8601 lower bound on created_at. */
  createdAtStart: string;
  /** Exclusive ISO-8601 upper bound on created_at. */
  createdAtEnd: string;
  /** Opaque Shopify pageInfo.endCursor. Null for the first page of the bucket. */
  cursor: string | null;
  /** 0 for year-wide buckets created by the plan job; +1 per recursive split. */
  bucketDepth: number;
  discoveryRunId?: number;
  /**
   * Number of times the failed-bucket cron sweeper has re-enqueued this job
   * after it permanently failed. Capped by the sweeper so a chronically-
   * broken bucket (e.g. one Shopify can no longer serve at all) doesn't
   * cycle forever between failed and wait.
   */
  sweeperAttempts?: number;
}

export interface StorefrontBucketJobResult {
  storeId: number;
  createdAtStart: string;
  createdAtEnd: string;
  productsProcessed: number;
  cardsAdded: number;
  errors: number;
  /** True if `nextCursor === null` — bucket fully drained. */
  isBucketComplete: boolean;
  /** True if this job hit the 25K wall and spawned two child buckets. */
  wasSplit: boolean;
  success: boolean;
  error?: string;
}
