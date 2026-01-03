import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  const scheduleEnabled = configService.get<boolean>('schedule.enabled');
  const dailyScrapeTime = configService.get<string>('schedule.dailyScrapeTime');
  const popularCardsLimit = configService.get<number>('popularCards.limit');

  logger.log('═══════════════════════════════════════════════════════');
  logger.log('MTG Scraper - Scheduler Service');
  logger.log('═══════════════════════════════════════════════════════');
  logger.log(`Schedule Enabled: ${scheduleEnabled}`);
  logger.log(`Daily Scrape Time: ${dailyScrapeTime}`);
  logger.log(`Popular Cards Limit: ${popularCardsLimit}`);
  logger.log('═══════════════════════════════════════════════════════');

  await app.init();

  logger.log('Scheduler service initialized and ready');
  logger.log('Press Ctrl+C to stop');
}

bootstrap();
