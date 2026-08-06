import { Controller, Get, Param, Logger, Query, VERSION_NEUTRAL, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { CardService } from './card.service';
import { CardSearchResponse } from '@scoutlgs/shared';
import { GetCardDto } from './dto/get-card.dto';

// Kept VERSION_NEUTRAL so card lookups stay under /api/card.
// The deck-list UI still reads from this; new clients should use /api/v1/cards.
@Controller({ path: 'card', version: VERSION_NEUTRAL })
export class CardController {
  private readonly logger = new Logger(CardController.name);

  constructor(private readonly cardService: CardService) {}

  @Get('name-id/:cardNameId')
  async getCardByCardNameId(
    @Param('cardNameId', ParseIntPipe) cardNameId: number,
    @Query('name') requestedName = 'Unknown card',
  ): Promise<CardSearchResponse> {
    return this.cardService.getCardByCardNameId(cardNameId, requestedName);
  }

  @Get(':oracleId/:cardName')
  async getCard(@Param() params: GetCardDto): Promise<CardSearchResponse> {
    this.logger.log(`Fetching card: ${params.cardName} (${params.oracleId})`);
    const response = await this.cardService.getCardByOracleId(params.oracleId, params.cardName);
    this.logger.log(`Found ${response.results.length} results for: ${params.cardName}`);
    return response;
  }

  @Get('bulk')
  async getCards(
    @Query('names') rawNames: string | string[],
  ): Promise<{ results: Record<string, CardSearchResponse> }> {
    // `names` is a repeated query parameter. Do not split on commas because
    // commas are valid card-name punctuation (e.g. "Zada, Hedron Grinder").
    const names = (Array.isArray(rawNames) ? rawNames : [rawNames ?? ''])
      .map((value) => value.trim())
      .filter(Boolean);
    if (names.length === 0 || names.length > 150) {
      throw new BadRequestException('names must contain between 1 and 150 cards');
    }
    return { results: await this.cardService.getCardsByName(names) };
  }

}
