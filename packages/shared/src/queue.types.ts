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
   * Re-runs the matcher against unmatched_cards rows and promotes any that
   * now match (with the warm cache populated, with better extractors, etc.).
   * Platform-agnostic — works for any extraction backend.
   */
  RETRY_UNMATCHED: 'retry-unmatched',
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
  discoveryRunId?: number;
  maxCardsAdded?: number;
}

/**
 * Job data for retrying matches on unmatched_cards rows.
 * Scoped per-store; the worker loads the store's unmatched_cards in batches
 * and re-runs the matcher (which has the warm cache populated by now).
 */
export interface RetryUnmatchedJobData {
  /** Optional — if omitted, retries all stores in one job. */
  storeId?: number;
  /** Max products to retry in this job. Default 5000. */
  limit?: number;
}

export interface RetryUnmatchedJobResult {
  storeId: number | null;
  attempted: number;
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
