import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CardName,
  CardPrinting,
  CardListing,
  Store,
  StoreModule,
} from '@scoutlgs/core';
import { V1CardsController } from './cards/v1-cards.controller';
import { V1CardsService } from './cards/v1-cards.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CardName, CardPrinting, CardListing, Store]),
    StoreModule,
  ],
  controllers: [V1CardsController],
  providers: [V1CardsService],
})
export class V1Module {}
