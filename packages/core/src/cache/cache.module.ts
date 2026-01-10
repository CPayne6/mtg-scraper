import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { QUEUE_NAMES } from '@scoutlgs/shared';
import { CacheService } from './cache.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: QUEUE_NAMES.CARD_SCRAPE,
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
