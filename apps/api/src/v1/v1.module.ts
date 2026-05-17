import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CardName,
  CardPrinting,
  CardListing,
  CardVariant,
  ScryfallSet,
  Store,
  StoreModule,
  TokenName,
  TokenPrinting,
  TokenListing,
  TokenVariant,
  CardList,
  CardListEntry,
} from '@scoutlgs/core';
import { CardsController } from './cards/cards.controller';
import { CardsService } from './cards/cards.service';
import { TokensController } from './tokens/tokens.controller';
import { TokensService } from './tokens/tokens.service';
import { ListsController } from './lists/lists.controller';
import { ListsService } from './lists/lists.service';
import { CardNameResolverService } from './shared/card-name-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CardName, CardPrinting, CardListing, CardVariant,
      ScryfallSet, Store,
      TokenName, TokenPrinting, TokenListing, TokenVariant,
      CardList, CardListEntry,
    ]),
    StoreModule,
  ],
  controllers: [CardsController, TokensController, ListsController],
  providers: [CardsService, TokensService, ListsService, CardNameResolverService],
})
export class V1Module {}
