import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PopularCardsModule } from '../popular-cards/popular-cards.module';
import { validationSchema } from '../config/validation';
import { CacheModule, CacheService, StoreModule, StoreService } from '@scoutlgs/core';
import { PopularCardsScheduler } from '@/popular-cards/popular-cards.scheduler';

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
        parseInt(process.env.TEST_PAGE_COUNT ?? String(DEFAULT_PAGE_COUNT), 10),
      )],
      validationSchema,
    }),
    ScheduleModule.forRoot(),
    PopularCardsModule,
    CacheModule,
    StoreModule,
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

  const popularCardsScheduler = app.get(PopularCardsScheduler);
  const cacheService = app.get(CacheService);
  const storeService = app.get(StoreService);

  // Get all active stores to check results
  const stores = await storeService.findAllActive();
  const storeNames = stores.map(s => s.name);

  logger.log('Fetching and scraping cards from EDHREC...');
  const cards = await popularCardsScheduler.scrapePopularCards({
    enabled: true,
    limit: 1000,
    batchSize: 50,
    batchDelayMs: 1000,
    waitForCompletion: true,
  });
  logger.log(`Scraped ${cards.length} cards`);

  const errors: CardError[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cards.length; i++) {
    const cardName = cards[i];
    const position = i + 1;

    // Get cached results for all stores
    const storeResults = await cacheService.getMultipleStoreCards(cardName, storeNames);

    let totalResults = 0;
    const cardStoreErrors: StoreError[] = [];

    for (const [storeName, entry] of storeResults) {
      if (entry) {
        totalResults += entry.results.length;
        if (entry.error) {
          cardStoreErrors.push({ storeName, error: entry.error });
        }
      }
    }

    if (totalResults === 0 && cardStoreErrors.length === 0) {
      logger.error(`[${position}/${cards.length}] FAILED: ${cardName} - No results from any store`);
      errorCount++;
      continue;
    }

    if (cardStoreErrors.length > 0) {
      errorCount++;
      errors.push({
        cardName,
        position,
        storeErrors: cardStoreErrors,
      });

      logger.error(`[${position}/${cards.length}] STORE ERRORS for ${cardName}:`);
      for (const storeError of cardStoreErrors) {
        logger.error(`  - ${storeError.storeName}: ${storeError.error}`);
      }
    } else {
      successCount++;
      logger.log(`[${position}/${cards.length}] SUCCESS: ${cardName} (${totalResults} results)`);
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
