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
  private readonly defaultMaxPages: number;
  private readonly startPage: number;
  private readonly cardsPerPage = 100; // Approximate cards per EDHREC page

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.getOrThrow<string>('popularCards.edhrecBaseUrl');
    this.defaultMaxPages = this.configService.getOrThrow<number>('popularCards.edhrecPages');
    this.startPage = this.configService.get<number>('popularCards.edhrecStartPage') ?? 1;
  }

  /**
   * Fetches popular cards from EDHREC API
   * @param limit Optional limit - if provided, fetches enough pages to satisfy the limit
   * @returns Array of unique card names
   */
  async fetchPopularCards(limit?: number): Promise<string[]> {
    const allCards: string[] = [];
    const seenCards = new Set<string>();
    const batchSize = 2;
    const delayBetweenBatches = 1000;

    // Calculate pages needed: use limit if provided, otherwise use default config
    // Early termination will stop fetching once limit is reached
    const pagesNeeded = limit
      ? Math.ceil(limit / this.cardsPerPage)
      : this.defaultMaxPages;
    const endPage = this.startPage + pagesNeeded - 1;

    this.logger.log(`Fetching popular cards from EDHREC (pages ${this.startPage}-${endPage}, ${pagesNeeded} total in batches of ${batchSize})${limit ? ` for limit of ${limit}` : ''}...`);

    for (let batchStart = this.startPage; batchStart <= endPage; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, endPage);
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

      // Stop early if we have enough cards
      if (limit && allCards.length >= limit) {
        this.logger.log(`Reached target of ${limit} cards, stopping early`);
        break;
      }

      if (batchEnd < endPage) {
        this.logger.debug(`Waiting ${delayBetweenBatches}ms before next batch...`);
        await this.delay(delayBetweenBatches);
      }
    }

    this.logger.log(`Successfully fetched ${allCards.length} unique cards from EDHREC`);
    return limit ? allCards.slice(0, limit) : allCards;
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
