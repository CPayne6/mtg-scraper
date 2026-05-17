import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  ShopifyProduct,
  UnmatchedCard,
  PlatformModule,
  QueueModule,
} from '@scoutlgs/core';
import { ExtractionModule } from '../extraction/extraction.module';
import { StorefrontProcessor } from './storefront.processor';
import { StorefrontController } from './storefront.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, MtgSinglesCollection, ShopifyProduct, UnmatchedCard]),
    QueueModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.STOREFRONT_EXTRACTION }),
    PlatformModule,
    ExtractionModule,
  ],
  controllers: [StorefrontController],
  providers: [StorefrontProcessor],
})
export class StorefrontModule {}
