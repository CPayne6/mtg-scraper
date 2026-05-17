export const QUEUE_NAMES = {
  STOREFRONT_EXTRACTION: 'storefront-extraction',
} as const;

export const JOB_NAMES = {
  EXTRACT_STOREFRONT_COLLECTION: 'extract-storefront-collection',
  /**
   * Bootstrap job: fetches min/max product IDs for a store and enqueues N
   * range-bounded extraction jobs. Lets a single store's pages run in parallel
   * instead of being serially chained by `lastId`.
   */
  BOOTSTRAP_STOREFRONT_EXTRACTION: 'bootstrap-storefront-extraction',
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
 * Store discovery configuration stored in stores.discovery_config
 */
export interface StoreDiscoveryConfig {
  mtgSinglesCollectionId: number;
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
 * Job data for planning storefront extraction (Phase 1).
 * Queries card_names for prefixes and enqueues prefix jobs.
 */
export interface StorefrontPlanJobData {
  storeId: number;
  discoveryRunId?: number;
  maxCardsAdded?: number;
}

/**
 * Job data for extracting products matching a title prefix (Phase 2).
 * Paginates products(query: "scope title:prefix*").
 * If 25K limit is hit, splits into sub-prefix jobs.
 */
export interface StorefrontPrefixJobData {
  storeId: number;
  prefix: string;
  scope: string;
  discoveryRunId?: number;
  maxCardsAdded?: number;
  /** Recursion depth: 1=single letter, 2=two letters, 3=three letters */
  depth: number;
}

export interface StorefrontPrefixJobResult {
  storeId: number;
  prefix: string;
  productsProcessed: number;
  cardsAdded: number;
  errors: number;
  /** True if this prefix hit 25K and was split into sub-prefixes */
  wasSplit: boolean;
  success: boolean;
  error?: string;
}
