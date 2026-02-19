import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  QueueModule,
  CacheModule,
  PlatformModule,
  ProxyModule,
  Store,
  ProductUrl,
  MtgSinglesCollection,
} from '@scoutlgs/core';
import { DiscoveryService } from './discovery.service';
import { DiscoveryProcessor } from './discovery.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Store, ProductUrl, MtgSinglesCollection]),
    QueueModule,
    CacheModule,
    PlatformModule,
    ProxyModule,
  ],
  providers: [DiscoveryService, DiscoveryProcessor],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
