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
import { V1CardsController } from './cards/v1-cards.controller';
import { V1CardsService } from './cards/v1-cards.service';
import { V1TokensController } from './tokens/v1-tokens.controller';
import { V1TokensService } from './tokens/v1-tokens.service';
import { V1ListsController } from './lists/v1-lists.controller';
import { V1ListsService } from './lists/v1-lists.service';
import { V1StoresController } from './stores/v1-stores.controller';
import { V1StoresService } from './stores/v1-stores.service';
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
  controllers: [
    V1CardsController,
    V1TokensController,
    V1ListsController,
    V1StoresController,
  ],
  providers: [
    V1CardsService,
    V1TokensService,
    V1ListsService,
    V1StoresService,
    CardNameResolverService,
  ],
})
export class V1Module {}
