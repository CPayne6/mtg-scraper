import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import {
  QueueModule,
  CacheModule,
  Store,
} from '@scoutlgs/core';
import { DiscoveryService } from './discovery.service';
import { DiscoveryScheduler } from './discovery.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store]),
    QueueModule,
    CacheModule,
    ScheduleModule.forRoot(),
  ],
  providers: [DiscoveryService, DiscoveryScheduler],
  exports: [DiscoveryService, DiscoveryScheduler],
})
export class DiscoveryModule {}
