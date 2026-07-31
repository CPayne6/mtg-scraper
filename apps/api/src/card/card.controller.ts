import { Controller, Get, Param, Logger, VERSION_NEUTRAL } from '@nestjs/common';
import { CardService } from './card.service';
import { CardSearchResponse } from '@scoutlgs/shared';
import { GetCardDto } from './dto/get-card.dto';

// Kept VERSION_NEUTRAL so card lookups stay under /api/card.
// The deck-list UI still reads from this; new clients should use /api/v1/cards.
@Controller({ path: 'card', version: VERSION_NEUTRAL })
export class CardController {
  private readonly logger = new Logger(CardController.name);

  constructor(private readonly cardService: CardService) {}

  @Get(':oracleId/:cardName')
  async getCard(@Param() params: GetCardDto): Promise<CardSearchResponse> {
    this.logger.log(`Fetching card: ${params.cardName} (${params.oracleId})`);
    const response = await this.cardService.getCardByOracleId(params.oracleId, params.cardName);
    this.logger.log(`Found ${response.results.length} results for: ${params.cardName}`);
    return response;
  }
}
