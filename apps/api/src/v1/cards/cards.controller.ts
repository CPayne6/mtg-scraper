import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { CardsService, SearchResponse } from './cards.service';
import { SearchCardsQueryDto } from './dto/search-cards-query.dto';

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get('search')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async searchCards(
    @Query() query: SearchCardsQueryDto,
  ): Promise<SearchResponse> {
    const stores = query.stores
      ? query.stores.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const conditions = query.conditions
      ? query.conditions.split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;

    return this.cardsService.searchCards(
      query.name,
      query.limit,
      query.page,
      query.setCode,
      stores,
      conditions,
    );
  }
}
