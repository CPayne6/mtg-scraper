import { Injectable, Logger } from '@nestjs/common';
import { EdhrecService } from '../edhrec/edhrec.service';
import { getPopularCardsList } from './popular-cards.data';

@Injectable()
export class PopularCardsService {
  private readonly logger = new Logger(PopularCardsService.name);

  constructor(
    private readonly edhrecService: EdhrecService,
  ) {}

  /**
   * Get the list of popular cards to scrape
   *
   * Primary source: EDHREC API
   * Fallback: Hardcoded list
   */
  async getPopularCards(limit: number): Promise<string[]> {

    // Try fetching from EDHREC API
    try {
      this.logger.log('Fetching popular cards from EDHREC API...');
      const cards = await this.edhrecService.fetchPopularCards();

      if (cards.length > 0) {
        this.logger.log(`Successfully fetched ${cards.length} cards from EDHREC`);
        return cards;
      }

      this.logger.warn('EDHREC API returned no cards, falling back to hardcoded list');
    } catch (error) {
      this.logger.error(
        `Failed to fetch from EDHREC API: ${error.message}`,
        error.stack,
      );
      this.logger.warn('Falling back to hardcoded popular cards list');
    }

    // Fallback to hardcoded list
    this.logger.log(`Using hardcoded popular cards list (limit: ${limit})`);
    return getPopularCardsList(limit);
  }
}
