import { PopularCardsModule } from '@/popular-cards/popular-cards.module';
import { DiscoveryModule } from '@/discovery/discovery.module';
import { Module } from '@nestjs/common';
import { CacheModule } from '@scoutlgs/core';
import { ManualController } from './manual.controller';
import { ManualService } from './manual.service';

@Module({
  imports: [
    PopularCardsModule,
    DiscoveryModule,
    CacheModule
  ],
  controllers: [ ManualController ],
  providers: [ ManualService ],
})
export class ManualModule { }