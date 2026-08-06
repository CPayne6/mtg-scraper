import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardController } from './card.controller';
import { CardService } from './card.service';
import { CacheModule, StoreModule, Card, CardVariant, CardName, CardPrinting, Store } from '@scoutlgs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([Card, CardVariant, CardName, CardPrinting, Store]),
    CacheModule,
    StoreModule,
  ],
  controllers: [CardController],
  providers: [CardService],
})
export class CardModule {}
