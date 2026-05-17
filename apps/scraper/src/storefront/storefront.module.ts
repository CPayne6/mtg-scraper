import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  CardName,
  PlatformModule,
  CacheModule,
  QueueModule,
} from '@scoutlgs/core';
import { ExtractionModule } from '../extraction/extraction.module';
import { StorefrontProcessor } from './storefront.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, MtgSinglesCollection, CardName]),
    QueueModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.STOREFRONT_EXTRACTION }),
    PlatformModule,
    ExtractionModule,
    CacheModule,
  ],
  providers: [StorefrontProcessor],
})
export class StorefrontModule {}
