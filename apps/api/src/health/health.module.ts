import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { StoreModule, CacheModule } from '@scoutlgs/core';

@Module({
  imports: [StoreModule, CacheModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
