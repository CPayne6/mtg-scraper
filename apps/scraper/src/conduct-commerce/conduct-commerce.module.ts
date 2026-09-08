import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConductCategoryAudit, ProductUrl, Store, PlatformModule, QueueModule } from '@scoutlgs/core';
import { QUEUE_NAMES } from '@scoutlgs/shared';
import { ExtractionModule } from '../extraction/extraction.module';
import { ConductCommerceProcessor } from './conduct-commerce.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, ConductCategoryAudit]),
    QueueModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.CONDUCT_COMMERCE_EXTRACTION }),
    PlatformModule,
    ExtractionModule,
  ],
  providers: [ConductCommerceProcessor],
})
export class ConductCommerceModule {}
