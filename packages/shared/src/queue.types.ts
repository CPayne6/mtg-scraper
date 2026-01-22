import type { CardWithStore } from './card.types.js';

export const QUEUE_NAMES = {
  CARD_SCRAPE: 'card-scrape',
} as const;

export const JOB_NAMES = {
  SCRAPE_CARD: 'scrape-card',
} as const;

export interface ScrapeCardJobData {
  cardName: string;
  priority?: number;
  requestId?: string;
  /** Optional list of store names to scrape. If not provided, scrapes all stores. */
  stores?: string[];
  /** Previous store errors for retry tracking. Used to increment retry counts. */
  previousErrors?: StoreError[];
}

export interface StoreError {
  storeName: string;
  error: string;
  retryCount?: number;
}

export interface ScrapeCardJobResult {
  cardName: string;
  results: CardWithStore[];
  timestamp: number;
  success: boolean;
  error?: string;
  storeErrors?: StoreError[];
}
