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
}

export interface ScrapeCardJobResult {
  cardName: string;
  results: CardWithStore[];
  timestamp: number;
  success: boolean;
  error?: string;
}
