import { Module } from '@nestjs/common';
import { PopularCardsService } from './popular-cards.service';
import { PopularCardsScheduler } from './popular-cards.scheduler';
import { QueueModule, CacheModule } from '@scoutlgs/core';
import { EdhrecService } from '../edhrec/edhrec.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [QueueModule, CacheModule, ScheduleModule.forRoot()],
  providers: [PopularCardsService, PopularCardsScheduler, EdhrecService],
  exports: [PopularCardsService, PopularCardsScheduler],
})
export class PopularCardsModule {}
