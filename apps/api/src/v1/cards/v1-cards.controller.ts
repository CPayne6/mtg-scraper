import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { V1CardsService, V1SearchResponse } from './v1-cards.service';
import { SearchCardsQueryDto } from './dto/search-cards-query.dto';

@Controller('v1/cards')
export class V1CardsController {
  constructor(private readonly v1CardsService: V1CardsService) {}

  @Get('search')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async searchCards(
    @Query() query: SearchCardsQueryDto,
  ): Promise<V1SearchResponse> {
    const stores = query.stores
      ? query.stores.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const conditions = query.conditions
      ? query.conditions.split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;

    return this.v1CardsService.searchCards(
      query.name,
      query.limit,
      query.page,
      query.setCode,
      stores,
      conditions,
    );
  }
}
