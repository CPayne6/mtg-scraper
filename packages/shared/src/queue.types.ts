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
  collectionHandle: string;
  priority?: number;
  /** ID of the discovery_runs row tracking this run. */
  discoveryRunId?: number;
}

/**
 * Result from extracting products via Shopify Storefront API
 */
export interface StorefrontExtractionJobResult {
  storeId: number;
  collectionHandle: string;
  productsExtracted: number;
  variantsExtracted: number;
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
