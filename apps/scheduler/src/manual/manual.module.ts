import { ExtractionOrchestratorModule } from '@/extraction/extraction-orchestrator.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule, ProductUrl, UnmatchedCard, ExtractionRun, Store, ShopifyProduct } from '@scoutlgs/core';
import { ManualController } from './manual.controller';
import { ManualService } from './manual.service';

@Module({
  imports: [
    ExtractionOrchestratorModule,
    QueueModule,
    TypeOrmModule.forFeature([ProductUrl, UnmatchedCard, ExtractionRun, Store, ShopifyProduct]),
  ],
  controllers: [ ManualController ],
  providers: [ ManualService ],
})
export class ManualModule { }