import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '@mtg-scraper/shared';
import { ScrapeCardProcessor } from './scrape-card.processor';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.CARD_SCRAPE,
    }),
    ScraperModule,
  ],
  providers: [ScrapeCardProcessor],
  exports: [BullModule],
})
export class QueueModule {}
