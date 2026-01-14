import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PopularCardsModule } from '../popular-cards/popular-cards.module';
import { PopularCardsService } from '../popular-cards/popular-cards.service';
import { validationSchema } from '../config/validation';
import { CacheModule, CacheService, QueueService } from '@scoutlgs/core';

const DEFAULT_START_PAGE = 110;
const DEFAULT_PAGE_COUNT = 1;

interface StoreError {
  storeName: string;
  error: string;
}

interface CardError {
  cardName: string;
  position: number;
  storeErrors: StoreError[];
}

function createTestConfig(startPage: number, pageCount: number) {
  return () => ({
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    },
    popularCards: {
      edhrecBaseUrl: process.env.EDHREC_API_URL ?? 'https://json.edhrec.com/pages/top/month-pastmonth',
      edhrecPages: pageCount,
      edhrecStartPage: startPage,
      limit: parseInt(process.env.POPULAR_CARDS_LIMIT ?? '1000', 10),
      batchSize: parseInt(process.env.POPULAR_CARDS_BATCH_SIZE ?? '50', 10),
      batchDelayMs: parseInt(process.env.BATCH_DELAY_MS ?? '1000', 10),
    },
    schedule: {
      enabled: true,
      dailyScrapeTime: '0 0 * * *',
    },
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [createTestConfig(
        parseInt(process.env.TEST_START_PAGE ?? String(DEFAULT_START_PAGE), 10),
        parseInt(process.env.TEST_PAGE_COUNT ?? String(DEFAULT_PAGE_COUNT), 10)
      )],
      validationSchema,
    }),
    ScheduleModule.forRoot(),
    PopularCardsModule,
    CacheModule,
  ],
})
class TestModule {}

async function main() {
  const startPage = parseInt(process.env.TEST_START_PAGE ?? String(DEFAULT_START_PAGE), 10);
  const pageCount = parseInt(process.env.TEST_PAGE_COUNT ?? String(DEFAULT_PAGE_COUNT), 10);

  const app = await NestFactory.createApplicationContext(TestModule, {
    logger: ['error', 'warn', 'log'],
  });

  const logger = new Logger('TestScrape');

  logger.log('═══════════════════════════════════════════════════════');
  logger.log('ScoutLGS - Test Scrape');
  logger.log('═══════════════════════════════════════════════════════');
  logger.log(`Start Page: ${startPage}`);
  logger.log(`Page Count: ${pageCount}`);
  logger.log(`End Page: ${startPage + pageCount - 1}`);
  logger.log('═══════════════════════════════════════════════════════');

  const popularCardsService = app.get(PopularCardsService);
  const queueService = app.get(QueueService);
  const cacheService = app.get(CacheService);

  logger.log('Fetching cards from EDHREC...');
  const cards = await popularCardsService.getPopularCards();
  logger.log(`Fetched ${cards.length} cards`);

  const errors: CardError[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cards.length; i++) {
    const cardName = cards[i];
    const position = i + 1;

    logger.log(`[${position}/${cards.length}] Processing: ${cardName}`);

    await queueService.enqueueScrapeJob(cardName, 1);
    await cacheService.waitForScrapeCompletion(cardName, 120000);

    const result = await cacheService.getCachedResult(cardName);

    if (!result) {
      logger.error(`[${position}/${cards.length}] FAILED: ${cardName} - No result returned`);
      errorCount++;
      continue;
    }

    if (result.storeErrors && result.storeErrors.length > 0) {
      errorCount++;
      errors.push({
        cardName,
        position,
        storeErrors: result.storeErrors,
      });

      logger.error(`[${position}/${cards.length}] STORE ERRORS for ${cardName}:`);
      for (const storeError of result.storeErrors) {
        logger.error(`  - ${storeError.storeName}: ${storeError.error}`);
      }
    } else {
      successCount++;
      logger.log(`[${position}/${cards.length}] SUCCESS: ${cardName} (${result.results.length} results)`);
    }
  }

  logger.log('');
  logger.log('═══════════════════════════════════════════════════════');
  logger.log('Test Scrape Summary');
  logger.log('═══════════════════════════════════════════════════════');
  logger.log(`Total cards: ${cards.length}`);
  logger.log(`Successful: ${successCount}`);
  logger.log(`With errors: ${errorCount}`);
  logger.log('═══════════════════════════════════════════════════════');

  if (errors.length > 0) {
    logger.log('');
    logger.log('Cards with store errors:');
    logger.log('───────────────────────────────────────────────────────');
    for (const error of errors) {
      logger.log(`[${error.position}] ${error.cardName}`);
      for (const storeError of error.storeErrors) {
        logger.log(`    └─ ${storeError.storeName}: ${storeError.error}`);
      }
    }
  }

  await app.close();
}

main().catch((err) => {
  console.error('Test scrape failed:', err);
  process.exit(1);
});
