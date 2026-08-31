import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { CardsService, SearchResponse } from './cards.service';
import { SearchCardsQueryDto } from './dto/search-cards-query.dto';
import { BulkSearchCardsDto } from './dto/bulk-search-cards.dto';
import { parseSelectedStores } from '../shared/store-selection';

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get('search')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async searchCards(
    @Query() query: SearchCardsQueryDto,
  ): Promise<SearchResponse> {
    const stores = parseSelectedStores(query.stores);
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

  @Get('bulk-search')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async bulkSearchCards(
    @Query() query: BulkSearchCardsDto,
  ): Promise<{ results: Record<string, SearchResponse> }> {
    return this.cardsService.bulkSearchCards(query.names, query.limit);
  }
}
