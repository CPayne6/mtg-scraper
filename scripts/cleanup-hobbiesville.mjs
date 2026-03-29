/**
 * Cleanup script: Remove all Hobbiesville product data from the database.
 *
 * Deletes in FK-safe order:
 * 1. card_price_history (references card_listings)
 * 2. card_listings (references product_urls)
 * 3. unmatched_cards (references product_urls)
 * 4. product_urls
 *
 * Uses the store's ID looked up by name='hobbiesville'.
 *
 * Usage: node scripts/cleanup-hobbiesville.mjs [--dry-run]
 */

import { createRequire } from 'module';
const require = createRequire(new URL('../apps/api/', import.meta.url));
const pg = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

const config = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'scoutlgs',
};

async function main() {
  const client = new pg.Client(config);
  await client.connect();
  console.log(`Connected to ${config.database}@${config.host}:${config.port}`);
  if (DRY_RUN) console.log('*** DRY RUN — no data will be deleted ***\n');

  try {
    // Find Hobbiesville store ID
    const storeResult = await client.query(
      `SELECT id, name, display_name, base_url FROM stores WHERE name = 'hobbiesville'`,
    );

    if (storeResult.rows.length === 0) {
      console.log('Store "hobbiesville" not found in database.');
      return;
    }

    const store = storeResult.rows[0];
    console.log(`Found store: ${store.display_name} (ID: ${store.id}, URL: ${store.base_url})\n`);

    // Count rows in each table
    const counts = {};
    for (const table of ['product_urls', 'card_listings', 'unmatched_cards', 'card_price_history']) {
      const col = table === 'card_price_history' ? 'store_id' : 'store_id';
      const res = await client.query(
        `SELECT COUNT(*) as count FROM ${table} WHERE ${col} = $1`,
        [store.id],
      );
      counts[table] = parseInt(res.rows[0].count);
      console.log(`  ${table}: ${counts[table]} rows`);
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`\n  Total rows to delete: ${total}`);

    if (total === 0) {
      console.log('\nNothing to delete.');
      return;
    }

    if (DRY_RUN) {
      console.log('\nDry run complete. Re-run without --dry-run to delete.');
      return;
    }

    // Delete in FK-safe order within a transaction
    await client.query('BEGIN');

    console.log('\nDeleting...');

    // 1. card_price_history
    const priceResult = await client.query(
      `DELETE FROM card_price_history WHERE store_id = $1`,
      [store.id],
    );
    console.log(`  card_price_history: ${priceResult.rowCount} rows deleted`);

    // 2. card_listings
    const listingsResult = await client.query(
      `DELETE FROM card_listings WHERE store_id = $1`,
      [store.id],
    );
    console.log(`  card_listings: ${listingsResult.rowCount} rows deleted`);

    // 3. unmatched_cards
    const unmatchedResult = await client.query(
      `DELETE FROM unmatched_cards WHERE store_id = $1`,
      [store.id],
    );
    console.log(`  unmatched_cards: ${unmatchedResult.rowCount} rows deleted`);

    // 4. product_urls
    const urlsResult = await client.query(
      `DELETE FROM product_urls WHERE store_id = $1`,
      [store.id],
    );
    console.log(`  product_urls: ${urlsResult.rowCount} rows deleted`);

    await client.query('COMMIT');
    console.log('\nDone. All Hobbiesville product data has been removed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error (rolled back):', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
