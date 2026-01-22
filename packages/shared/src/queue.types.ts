import type { CardWithStore } from './card.types.js';

export const QUEUE_NAMES = {
  CARD_SCRAPE: 'card-scrape',
} as const;

export const JOB_NAMES = {
  SCRAPE_CARD: 'scrape-card',
} as const;

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
