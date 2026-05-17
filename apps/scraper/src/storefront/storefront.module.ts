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
  PlatformModule,
  QueueModule,
} from '@scoutlgs/core';
import { ExtractionModule } from '../extraction/extraction.module';
import { StorefrontProcessor } from './storefront.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, ShopifyProduct, UnmatchedCard, CardListing]),
    QueueModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.STOREFRONT_EXTRACTION }),
    PlatformModule,
    ExtractionModule,
  ],
  providers: [StorefrontProcessor],
})
export class StorefrontModule {}
