import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { TokensService, TokenSearchResponse } from './tokens.service';
import { SearchTokensQueryDto } from './dto/search-tokens-query.dto';

@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get('search')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async searchTokens(
    @Query() query: SearchTokensQueryDto,
  ): Promise<TokenSearchResponse> {
    const stores = query.stores
      ? query.stores.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const conditions = query.conditions
      ? query.conditions.split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;

    return this.tokensService.searchTokens({
      name: query.name,
      type: query.type,
      subtype: query.subtype,
      power: query.power,
      toughness: query.toughness,
      colors: query.colors,
      setCode: query.setCode,
      stores,
      conditions,
      limit: query.limit ?? 50,
      page: query.page ?? 1,
    });
  }
}
