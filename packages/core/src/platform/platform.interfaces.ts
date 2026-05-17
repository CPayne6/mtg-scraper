import { Condition } from '@scoutlgs/shared';
import type { Store } from '../database/store.entity';

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
 * Extraction adapter - fetches and normalizes product data
 * Implementations: StorefrontExtractionAdapter, ConductCommerceExtractionAdapter
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
