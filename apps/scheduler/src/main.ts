import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseLogLevel } from '@scoutlgs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: parseLogLevel(process.env.LOG_LEVEL),
  });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  const scheduleEnabled = configService.get<boolean>('schedule.enabled');
  const dailyScrapeTime = configService.get<string>('schedule.dailyScrapeTime');
  const timezone = configService.get<string>('schedule.timezone');
  const popularCardsLimit = configService.get<number>('popularCards.limit');

  logger.log('═══════════════════════════════════════════════════════');
  logger.log('ScoutLGS - Scheduler Service');
  logger.log('═══════════════════════════════════════════════════════');
  logger.log(`Schedule Enabled: ${scheduleEnabled}`);
  logger.log(`Daily Scrape Time: ${dailyScrapeTime} (${timezone})`);
  logger.log(`Popular Cards Limit: ${popularCardsLimit}`);
  logger.log('═══════════════════════════════════════════════════════');

  const port = configService.get<number>('port') ?? 3002;
  await app.listen(port);

  logger.log(`Scheduler service listening on port ${port}`);
  logger.log('Press Ctrl+C to stop');
}

bootstrap();
