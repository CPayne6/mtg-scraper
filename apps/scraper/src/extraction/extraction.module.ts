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
  CardName,
  UnmatchedCard,
  CardCondition,
  TokenName,
  TokenPrinting,
  ExtractionRun,
} from '@scoutlgs/core';
import { ExtractionService } from './extraction.service';
import { PrintingMatcherService } from './printing-matcher.service';
import { BatchAccumulatorService } from './batch-accumulator.service';
import { ListingUpsertService } from './listing-upsert.service';
import { UnmatchedCardService } from './unmatched-card.service';
import { TokenMatcherService } from './token-matcher.service';
import { TokenBatchAccumulatorService } from './token-batch-accumulator.service';
import { TokenListingUpsertService } from './token-listing-upsert.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, ScryfallSet, CardPrinting, CardName, UnmatchedCard, CardCondition, TokenName, TokenPrinting, ExtractionRun]),
    QueueModule,
    PlatformModule,
    CacheModule,
  ],
  providers: [
    ExtractionService,
    PrintingMatcherService,
    BatchAccumulatorService,
    ListingUpsertService,
    UnmatchedCardService,
    TokenMatcherService,
    TokenBatchAccumulatorService,
    TokenListingUpsertService,
  ],
  exports: [ExtractionService, PrintingMatcherService, BatchAccumulatorService],
})
export class ExtractionModule {}
