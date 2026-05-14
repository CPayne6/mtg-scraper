/**
 * Test script for Storefront API extraction.
 *
 * Usage:
 *   node scripts/test-storefront-extraction.mjs [--limit=1000] [--store=game-knight]
 *
 * Connects to local PostgreSQL + Redis (exposed by docker-compose.dev.yml),
 * switches selected stores to 'shopify_storefront' platform type,
 * and enqueues storefront-extraction jobs with a maxCardsAdded limit.
 *
 * Prerequisites:
 *   - docker-compose -f docker-compose.dev.yml up
 *   - Database seeded (nx run api:seed && nx run api:migration:run)
 */

import { Queue } from 'bullmq';
import pg from 'pg';

// --- Configuration ---

const MAX_CARDS = parseInt(
  process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || '1000',
  10,
);
const STORE_FILTER = process.argv
  .find((a) => a.startsWith('--store='))
  ?.split('=')[1];

const redis = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'scoutlgs',
};

// Stores that can use the Storefront API (all Shopify-based stores)
const SHOPIFY_STORES = [
  'face-to-face-games',
  '401-games',
  'hobbiesville',
  'house-of-cards',
  'black-knight-games',
  'exor-games',
  'game-knight',
  'the-cg-realm',
];

// --- Main ---

async function run() {
  const client = new pg.Client(dbConfig);
  await client.connect();
  console.log('Connected to PostgreSQL');

  const queue = new Queue('storefront-extraction', { connection: redis });
  console.log('Connected to Redis');

  try {
    // Determine which stores to test
    const storesToTest = STORE_FILTER
      ? [STORE_FILTER]
      : SHOPIFY_STORES;

    console.log(`\nStores to test: ${storesToTest.join(', ')}`);
    console.log(`Max cards per store: ${MAX_CARDS}\n`);

    // Switch stores to shopify_storefront and enqueue jobs
    for (const storeName of storesToTest) {
      // Update platform type
      const { rowCount } = await client.query(
        `UPDATE stores SET platform_type = 'shopify_storefront' WHERE name = $1 AND platform_type = 'shopify'`,
        [storeName],
      );

      if (rowCount > 0) {
        console.log(`  [${storeName}] Switched to shopify_storefront`);
      }

      // Get store ID
      const {
        rows: [store],
      } = await client.query(
        `SELECT id, name, display_name, platform_type FROM stores WHERE name = $1`,
        [storeName],
      );

      if (!store) {
        console.log(`  [${storeName}] Store not found in database, skipping`);
        continue;
      }

      if (store.platform_type !== 'shopify_storefront') {
        console.log(
          `  [${storeName}] Platform type is '${store.platform_type}', expected 'shopify_storefront', skipping`,
        );
        continue;
      }

      // Enqueue job
      const job = await queue.add(
        'extract-storefront-collection',
        {
          storeId: store.id,
          maxCardsAdded: MAX_CARDS,
        },
        {
          priority: 10,
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 1,
        },
      );

      console.log(
        `  [${storeName}] Enqueued job ${job.id} (storeId=${store.id}, maxCardsAdded=${MAX_CARDS})`,
      );
    }

    console.log('\nAll jobs enqueued. Monitor scraper logs for progress.');
    console.log(
      'Queue status: run `redis-cli LLEN bull:storefront-extraction:wait` to check pending jobs.',
    );
  } finally {
    await client.end();
    await queue.close();
  }
}

// --- Revert helper ---

async function revert() {
  const client = new pg.Client(dbConfig);
  await client.connect();

  const { rowCount } = await client.query(
    `UPDATE stores SET platform_type = 'shopify' WHERE platform_type = 'shopify_storefront'`,
  );
  console.log(`Reverted ${rowCount} stores back to 'shopify' platform type`);

  await client.end();
}

// --- Entry point ---

if (process.argv.includes('--revert')) {
  revert().catch(console.error);
} else {
  run().catch(console.error);
}
