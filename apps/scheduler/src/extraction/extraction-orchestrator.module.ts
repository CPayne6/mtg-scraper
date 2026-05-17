import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import {
  QueueModule,
  CacheModule,
  Store,
  ExtractionRun,
} from '@scoutlgs/core';
import { ExtractionOrchestrator } from './extraction-orchestrator.service';
import { ExtractionScheduler } from './extraction.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ExtractionRun]),
    QueueModule,
    CacheModule,
    ScheduleModule.forRoot(),
  ],
  providers: [ExtractionOrchestrator, ExtractionScheduler],
  exports: [ExtractionOrchestrator, ExtractionScheduler],
})
export class ExtractionOrchestratorModule {}
