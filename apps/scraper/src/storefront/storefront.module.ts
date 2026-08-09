import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  ShopifyProduct,
  UnmatchedCard,
  CardListing,
  CardVariant,
  PlatformModule,
  QueueModule,
} from '@scoutlgs/core';
import { ExtractionModule } from '../extraction/extraction.module';
import { StorefrontProcessor } from './storefront.processor';
import { ListRefreshProcessor } from './list-refresh.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, ShopifyProduct, UnmatchedCard, CardListing, CardVariant]),
    QueueModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.STOREFRONT_EXTRACTION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.LIST_REFRESH }),
    PlatformModule,
    ExtractionModule,
  ],
  providers: [StorefrontProcessor, ListRefreshProcessor],
})
export class StorefrontModule {}
