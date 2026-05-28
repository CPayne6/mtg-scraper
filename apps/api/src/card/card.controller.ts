import { Controller, Get, Param, Logger, VERSION_NEUTRAL } from '@nestjs/common';
import { CardService } from './card.service';
import { CardSearchResponse } from '@scoutlgs/shared';
import { GetCardDto } from './dto/get-card.dto';

// Legacy endpoint — kept VERSION_NEUTRAL so /api/card/:name stays where it is.
// The deck-list UI still reads from this; new clients should use /api/v1/cards.
@Controller({ path: 'card', version: VERSION_NEUTRAL })
export class CardController {
  private readonly logger = new Logger(CardController.name);

  constructor(private readonly cardService: CardService) {}

  @Get(':cardName')
  async getCard(@Param() params: GetCardDto): Promise<CardSearchResponse> {
    this.logger.log(`Fetching card: ${params.cardName}`);
    const response = await this.cardService.getCardByName(params.cardName);
    this.logger.log(`Found ${response.results.length} results for: ${params.cardName}`);
    return response;
  }
}
