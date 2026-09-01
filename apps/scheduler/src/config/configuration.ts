import { existsSync, readFileSync } from 'fs';

const authDatabasePasswordFile = process.env.AUTH_DATABASE_PASSWORD_FILE;
const authDatabasePassword =
  authDatabasePasswordFile && existsSync(authDatabasePasswordFile)
    ? readFileSync(authDatabasePasswordFile, 'utf8').trim()
    : process.env.AUTH_DATABASE_PASSWORD ?? 'postgres';

export default () => ({
  port: parseInt(process.env.PORT ?? '5001', 10),
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  authDatabase: {
    host: process.env.AUTH_DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.AUTH_DATABASE_PORT ?? '5433', 10),
    username: process.env.AUTH_DATABASE_USER ?? 'postgres',
    password: authDatabasePassword,
    name: process.env.AUTH_DATABASE_NAME ?? 'scoutlgs_auth',
  },
  extraction: {
    // Enable/disable scheduled storefront extraction
    enabled: process.env.EXTRACTION_ENABLED === 'true',
    // Dispatcher cadence. Individual stores remain due once per 24 hours.
    cronTime: process.env.EXTRACTION_CRON_TIME ?? '*/15 * * * *',
    // Maximum stores with queued/running full traversal work at once.
    maxConcurrentStores: parseInt(process.env.EXTRACTION_MAX_CONCURRENT_STORES ?? '4', 10),
    // Trigger a run once on startup (handy for local testing)
    runOnInit: process.env.EXTRACTION_RUN_ON_INIT === 'true',
  },
  schedule: {
    // Timezone for all cron schedules
    timezone: process.env.SCHEDULE_TIMEZONE ?? 'America/Toronto',
  },
  cartCleanup: {
    enabled: process.env.CART_CLEANUP_ENABLED !== 'false',
    cronTime: process.env.CART_CLEANUP_CRON_TIME ?? '0 3 * * *',
    anonymousRetentionDays: parseInt(
      process.env.CART_ANONYMOUS_RETENTION_DAYS ?? '30',
      10,
    ),
  },
  scryfallCatalog: {
    enabled: process.env.SCRYFALL_CATALOG_SYNC_ENABLED !== 'false',
    // Run before the nightly extraction so new card names are available when
    // storefront products are matched.
    cronTime: process.env.SCRYFALL_CATALOG_SYNC_CRON_TIME ?? '0 0 * * *',
  },
});
