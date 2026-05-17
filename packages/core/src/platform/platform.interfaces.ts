import { Condition } from '@scoutlgs/shared';
import type { Store } from '../database/store.entity';
import type { MtgSinglesCollection } from '../database/mtg-singles-collection.entity';

/**
 * Represents a discovered product from a store's catalog
 * Platform-agnostic - adapters normalize to this format
 */
export interface DiscoveredProduct {
  /** Unique product identifier within the store (e.g., product handle/slug) */
  handle: string;
  /** When product was last updated (from sitemap/feed) */
  lastModified?: Date;
  /** Product image URL */
  imageUrl?: string;
  /** Image title - often contains card name + set */
  imageTitle?: string;
}

/**
 * Represents a single card variant extracted from a product
 * Platform-agnostic - this is the normalized output format
 */
export interface ExtractedCardVariant {
  /** Parsed card name (e.g., "Lightning Bolt") */
  cardName: string;
  /** Set name (e.g., "Magic 2010") */
  setName: string;
  /** Card condition */
  condition: Condition;
  /** Whether the card is foil */
  foil: boolean;
  /** Price in store currency */
  price: number;
  /** Currency code (e.g., "CAD") */
  currency: string;
  /** Whether the card is in stock */
  inStock: boolean;
  /** Quantity available (if known) */
  quantity?: number;
  /** Card image URL */
  imageUrl?: string;
  /** Direct link to purchase */
  productUrl: string;
  /** SKU if available */
  sku?: string;
  /** Platform's internal variant ID (for deduplication) */
  platformVariantId?: string;
  /** Set code if extractable (e.g., "M10") */
  setCode?: string;
  /** Collector number if extractable */
  collectorNumber?: string;
  /** Whether this variant is a token (detected from SKU or other signals) */
  isToken?: boolean;
}

/**
 * Discovery adapter - fetches product catalog from a store
 * Implementations: ShopifyDiscoveryAdapter, ConductCommerceDiscoveryAdapter
 */
export interface IDiscoveryAdapter {
  /**
   * Fetch all product handles from the store's catalog
   * @param store - Store configuration
   * @param collection - MTG singles collection to filter by
   * @returns Async iterator of discovered products
   */
  discoverProducts(
    store: Store,
    collection: MtgSinglesCollection,
  ): AsyncIterable<DiscoveredProduct>;

  /**
   * Validate if a product belongs to the MTG singles collection
   * @param store - Store configuration
   * @param collection - MTG singles collection
   * @param handle - Product handle to validate
   * @returns true if product is a valid MTG single
   */
  validateProduct(
    store: Store,
    collection: MtgSinglesCollection,
    handle: string,
  ): Promise<boolean>;
}

/**
 * Extraction adapter - fetches and normalizes product data
 * Implementations: ShopifyExtractionAdapter, ConductCommerceExtractionAdapter
 */
export interface IExtractionAdapter {
  /**
   * Fetch product data and normalize to common format
   * @param store - Store configuration
   * @param handle - Product handle/identifier
   * @returns Array of card variants (one product may have multiple conditions/foils)
   */
  extractProduct(
    store: Store,
    handle: string,
  ): Promise<ExtractedCardVariant[]>;
}

/**
 * Sitemap entry from XML parsing
 */
export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  image?: {
    loc?: string;
    title?: string;
  };
}

/**
 * Function type for getting a proxy agent
 */
export type GetProxyAgentFn = () => Promise<import('undici').ProxyAgent | undefined>;
