import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '@scoutlgs/shared';
import {
  QueueModule,
  PlatformModule,
  CacheModule,
  Store,
  ProductUrl,
  ScryfallSet,
  CardPrinting,
  UnmatchedCard,
  CardCondition,
  TokenName,
  TokenPrinting,
} from '@scoutlgs/core';
import { ExtractionService } from './extraction.service';
import { ExtractionProcessor } from './extraction.processor';
import { ExtractionController } from './extraction.controller';
import { PrintingMatcherService } from './printing-matcher.service';
import { BatchAccumulatorService } from './batch-accumulator.service';
import { ListingUpsertService } from './listing-upsert.service';
import { UnmatchedCardService } from './unmatched-card.service';
import { TokenMatcherService } from './token-matcher.service';
import { TokenBatchAccumulatorService } from './token-batch-accumulator.service';
import { TokenListingUpsertService } from './token-listing-upsert.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, ScryfallSet, CardPrinting, UnmatchedCard, CardCondition, TokenName, TokenPrinting]),
    QueueModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.STOREFRONT_EXTRACTION }),
    PlatformModule,
    CacheModule,
  ],
  controllers: [ExtractionController],
  providers: [
    ExtractionService,
    ExtractionProcessor,
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
