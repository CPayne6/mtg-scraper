import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  QueueModule,
  PlatformModule,
  CacheModule,
  Store,
  ProductUrl,
  ScryfallSet,
  CardPrinting,
  UnmatchedCard,
} from '@scoutlgs/core';
import { ExtractionService } from './extraction.service';
import { ExtractionProcessor } from './extraction.processor';
import { PrintingMatcherService } from './printing-matcher.service';
import { BatchAccumulatorService } from './batch-accumulator.service';
import { ListingUpsertService } from './listing-upsert.service';
import { UnmatchedCardService } from './unmatched-card.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, ScryfallSet, CardPrinting, UnmatchedCard]),
    QueueModule,
    PlatformModule,
    CacheModule,
  ],
  providers: [
    ExtractionService,
    ExtractionProcessor,
    PrintingMatcherService,
    BatchAccumulatorService,
    ListingUpsertService,
    UnmatchedCardService,
  ],
  exports: [ExtractionService],
})
export class ExtractionModule {}
