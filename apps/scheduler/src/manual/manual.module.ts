import { PopularCardsModule } from '@/popular-cards/popular-cards.module';
import { Module } from '@nestjs/common';
import { CacheModule } from '@scoutlgs/core';
import { ManualController } from './manual.controller';
import { ManualService } from './manual.service';

@Module({
  imports: [
    PopularCardsModule,
    CacheModule
  ],
  controllers: [ ManualController ],
  providers: [ ManualService ],
})
export class ManualModule { }