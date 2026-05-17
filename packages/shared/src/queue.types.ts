import type { CardWithStore } from './card.types.js';

export const QUEUE_NAMES = {
  CARD_SCRAPE: 'card-scrape',
  PRODUCT_DISCOVERY: 'product-discovery',
  PRODUCT_EXTRACTION: 'product-extraction',
  STOREFRONT_EXTRACTION: 'storefront-extraction',
} as const;

export const JOB_NAMES = {
  SCRAPE_CARD: 'scrape-card',
  DISCOVER_STORE: 'discover-store',
  EXTRACT_PRODUCT: 'extract-product',
  EXTRACT_STOREFRONT_COLLECTION: 'extract-storefront-collection',
  STOREFRONT_PLAN: 'storefront-plan',
  STOREFRONT_PREFIX: 'storefront-prefix',
} as const;

/**
 * Platform types for discovery/extraction adapters
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
 * Job data for discovering products from a store's sitemap
 */
export interface DiscoverStoreJobData {
  storeId: number;
  priority?: number;
  /** When true, discovery will upsert product URLs but skip enqueueing extraction jobs. */
  skipExtraction?: boolean;
  /** ID of the discovery_runs row tracking this run. */
  discoveryRunId?: number;
}

/**
 * Job data for extracting product data from a discovered URL
 */
export interface ExtractProductJobData {
  productUrlId: number;
  storeId: number;
  handle: string;
  priority?: number;
  /** ID of the discovery_runs row tracking this run. */
  discoveryRunId?: number;
}

/**
 * Result from discovering products at a store
 */
export interface DiscoverStoreJobResult {
  storeId: number;
  discovered: number;
  validated: number;
  success: boolean;
  error?: string;
}

/**
 * Result from extracting a single product
 */
export interface ExtractProductJobResult {
  productUrlId: number;
  variantsExtracted: number;
  success: boolean;
  error?: string;
}

/**
 * Job data for extracting products from a Shopify Storefront API collection
 */
export interface StorefrontExtractionJobData {
  storeId: number;
  priority?: number;
  /** ID of the discovery_runs row tracking this run. */
  discoveryRunId?: number;
  /** Stop after this many cards have been upserted. */
  maxCardsAdded?: number;
}

/**
 * Result from extracting products via Shopify Storefront API
 */
export interface StorefrontExtractionJobResult {
  storeId: number;
  collectionHandle: string;
  productsAttempted: number;
  productsProcessed: number;
  productsSkipped: number;
  errors: number;
  variantsExtracted: number;
  cardsAdded?: number;
  maxCardsAdded?: number;
  limitReached: boolean;
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

/**
 * Job data for scraping a single card from a single store.
 * Each job represents one card-store combination.
 */
export interface ScrapeCardJobData {
  cardName: string;
  /** Store name slug (e.g., 'f2f', '401', 'hobbies') */
  storeName: string;
  priority?: number;
  requestId?: string;
  /** Track retries for this specific store-card combo */
  retryCount?: number;
  /** Scraper type for API-level rate limiting (e.g., 'binderpos') */
  scraperType?: string;
}

/**
 * Result from scraping a single store for a card.
 */
export interface ScrapeCardJobResult {
  cardName: string;
  /** Store name slug (e.g., 'f2f', '401', 'hobbies') */
  storeName: string;
  results: CardWithStore[];
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Cache entry for a single store-card combination.
 * Used for batch cache retrieval by the API.
 */
export interface StoreCardCacheEntry {
  /** Store name slug (e.g., 'f2f', '401', 'hobbies') */
  storeName: string;
  results: CardWithStore[];
  timestamp: number;
  error?: string;
  retryCount?: number;
}
