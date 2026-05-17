import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  QueueModule,
  CacheModule,
  PlatformModule,
  ProxyModule,
  RateLimiterModule,
  Store,
  ProductUrl,
  MtgSinglesCollection,
  InvalidProductHandle,
  DiscoveryRun,
} from '@scoutlgs/core';
import { DiscoveryService } from './discovery.service';
import { DiscoveryProcessor } from './discovery.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, MtgSinglesCollection, InvalidProductHandle, DiscoveryRun]),
    QueueModule,
    CacheModule,
    PlatformModule,
    ProxyModule,
    RateLimiterModule,
  ],
  providers: [DiscoveryService, DiscoveryProcessor],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
