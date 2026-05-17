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
} from '@scoutlgs/core';
import { V1CardsController } from './cards/v1-cards.controller';
import { V1CardsService } from './cards/v1-cards.service';
import { V1TokensController } from './tokens/v1-tokens.controller';
import { V1TokensService } from './tokens/v1-tokens.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CardName, CardPrinting, CardListing, CardVariant,
      ScryfallSet, Store,
      TokenName, TokenPrinting, TokenListing, TokenVariant,
    ]),
    StoreModule,
  ],
  controllers: [V1CardsController, V1TokensController],
  providers: [V1CardsService, V1TokensService],
})
export class V1Module {}
