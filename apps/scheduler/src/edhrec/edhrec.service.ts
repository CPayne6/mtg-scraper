import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EdhrecCard {
  id: string;
  name: string;
  sanitized: string;
  url: string;
  inclusion?: number;
  num_decks?: number;
  potential_decks?: number;
  color_identity?: string[];
  cmc?: number;
  image_uris?: Array<{
    normal: string;
    art_crop: string;
  }>;
  layout?: string;
  names?: string[];
  prices?: Record<string, any>;
  primary_type?: string;
  rarity?: string;
  salt?: number;
  scryfall_uri?: string;
  spellbook_uri?: string;
  type?: string;
  combos?: boolean;
  label?: string;
  legal_commander?: boolean;
  new?: boolean;
  precon?: string;
}

interface EdhrecResponse {
  cardviews?: EdhrecCard[];
  is_paginated?: boolean;
  more?: string;
}

@Injectable()
export class EdhrecService {
  private readonly logger = new Logger(EdhrecService.name);
  private readonly baseUrl: string;
  private readonly maxPages: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.getOrThrow<string>('popularCards.edhrecBaseUrl');
    this.maxPages = this.configService.getOrThrow<number>('popularCards.edhrecPages');
  }

  /**
   * Fetches popular cards from EDHREC API
   * @returns Array of unique card names
   */
  async fetchPopularCards(): Promise<string[]> {
    const allCards: string[] = [];
    const seenCards = new Set<string>();
    const batchSize = 2;
    const delayBetweenBatches = 1000; // 1 second delay between batches

    this.logger.log(`Fetching popular cards from EDHREC (${this.maxPages} pages in batches of ${batchSize})...`);

    for (let batchStart = 1; batchStart <= this.maxPages; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, this.maxPages);
      const batchPages: number[] = [];

      // Create array of page numbers for this batch
      for (let page = batchStart; page <= batchEnd; page++) {
        batchPages.push(page);
      }

      this.logger.log(`Fetching batch: pages ${batchStart}-${batchEnd} (${batchPages.length} pages)`);

      // Fetch all pages in this batch concurrently
      const batchResults = await Promise.allSettled(
        batchPages.map(page => this.fetchPage(page))
      );

      // Process results
      let batchSuccessCount = 0;
      let batchFailCount = 0;

      batchResults.forEach((result, index) => {
        const page = batchPages[index];

        if (result.status === 'fulfilled') {
          const cards = result.value;
          batchSuccessCount++;

          // Deduplicate cards
          for (const cardName of cards) {
            const normalized = cardName.toLowerCase().trim();
            if (!seenCards.has(normalized)) {
              seenCards.add(normalized);
              allCards.push(cardName);
            }
          }

          this.logger.debug(`Page ${page}: ${cards.length} cards`);
        } else {
          batchFailCount++;
          this.logger.warn(`Failed to fetch page ${page}: ${result.reason?.message || result.reason}`);
        }
      });

      this.logger.log(
        `Batch ${batchStart}-${batchEnd} complete: ${batchSuccessCount} succeeded, ${batchFailCount} failed (total unique: ${allCards.length})`
      );

      // Add delay between batches (except for the last batch)
      if (batchEnd < this.maxPages) {
        this.logger.debug(`Waiting ${delayBetweenBatches}ms before next batch...`);
        await this.delay(delayBetweenBatches);
      }
    }

    this.logger.log(`Successfully fetched ${allCards.length} unique cards from EDHREC`);
    return allCards;
  }

  /**
   * Helper method to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetches a single page from EDHREC API
   * @param page Page number (1-based)
   * @returns Array of card names from that page
   */
  private async fetchPage(page: number): Promise<string[]> {
    const url = `${this.baseUrl}-${page}.json`;

    this.logger.debug(`Fetching: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: EdhrecResponse = await response.json() as any;

    // Parse the nested structure to extract card names
    const cardlists = data.cardviews ?? [];
    const cards: string[] = [];

    for (const card of cardlists) {
      if (card.name) {
        cards.push(card.name);
      }
    }

    return cards;
  }
}
