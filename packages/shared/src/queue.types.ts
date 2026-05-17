export const QUEUE_NAMES = {
  STOREFRONT_EXTRACTION: 'storefront-extraction',
} as const;

export const JOB_NAMES = {
  EXTRACT_STOREFRONT_COLLECTION: 'extract-storefront-collection',
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
 * With concurrency 3, pages from all stores interleave naturally.
 */
export interface StorefrontExtractionJobData {
  storeId: number;
  /** Shopify product ID to start from (id:>lastId). Null for first page. */
  lastId?: string | null;
  /** Scope query for this store (e.g. 'product_type:"MTG Single"') */
  scope?: string;
  priority?: number;
  discoveryRunId?: number;
  maxCardsAdded?: number;
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
