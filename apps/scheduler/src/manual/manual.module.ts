import { PopularCardsModule } from '@/popular-cards/popular-cards.module';
import { DiscoveryModule } from '@/discovery/discovery.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule, QueueModule, ProductUrl, UnmatchedCard, DiscoveryRun, Store, ShopifyProduct } from '@scoutlgs/core';
import { ManualController } from './manual.controller';
import { ManualService } from './manual.service';

@Module({
  imports: [
    PopularCardsModule,
    DiscoveryModule,
    CacheModule,
    QueueModule,
    TypeOrmModule.forFeature([ProductUrl, UnmatchedCard, DiscoveryRun, Store, ShopifyProduct]),
  ],
  controllers: [ ManualController ],
  providers: [ ManualService ],
})
export class ManualModule { }