import { Controller, Get, Param, Logger } from '@nestjs/common';
import { CardService } from './card.service';
import { CardSearchResponse } from '@scoutlgs/shared';
import { GetCardDto } from './dto/get-card.dto';

@Controller('card')
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
