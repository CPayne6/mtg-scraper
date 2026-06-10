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
  CardCart,
  CardList,
  CardListEntry,
} from '@scoutlgs/core';
import { AuthModule } from '../auth/auth.module';
import { CardsController } from './cards/cards.controller';
import { CardsService } from './cards/cards.service';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
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
      CardCart, CardList, CardListEntry,
    ]),
    StoreModule,
    AuthModule,
    CartModule,
    CheckoutModule,
  ],
  controllers: [CardsController, TokensController, ListsController],
  providers: [CardsService, TokensService, ListsService, CardNameResolverService],
})
export class V1Module {}
