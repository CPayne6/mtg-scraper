export default () => ({
  port: parseInt(process.env.PORT ?? '5001', 10),
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  discovery: {
    // Enable/disable product discovery (V2 scraping)
    enabled: process.env.DISCOVERY_ENABLED === 'true',
    // Cron expression for discovery (default: 1 AM daily, before popular cards scrape)
    cronTime: process.env.DISCOVERY_CRON_TIME ?? '0 1 * * *',
    // Run discovery when the application starts
    runOnInit: process.env.DISCOVERY_RUN_ON_INIT === 'true',
  },
  popularCards: {
    // EDHREC API configuration
    edhrecBaseUrl: process.env.EDHREC_API_URL ?? 'https://json.edhrec.com/pages/top/month-pastmonth',
    // Number of pages to fetch from EDHREC (each page has ~100 cards)
    edhrecPages: parseInt(process.env.EDHREC_PAGES ?? '10', 10),
    // Starting page for EDHREC API (1-based, default: 1)
    edhrecStartPage: parseInt(process.env.EDHREC_START_PAGE ?? '1', 10),
    // Fallback: Number of cards to scrape (used if API fails)
    limit: parseInt(process.env.POPULAR_CARDS_LIMIT ?? '1000', 10),
    // Legacy batch mode settings
    batchSize: parseInt(process.env.POPULAR_CARDS_BATCH_SIZE ?? '50', 10),
    batchDelayMs: parseInt(process.env.BATCH_DELAY_MS ?? '1000', 10),
    // Streaming mode settings (backpressure-based)
    maxQueueDepth: parseInt(process.env.MAX_QUEUE_DEPTH ?? '1000', 10),
    refillBatchSize: parseInt(process.env.REFILL_BATCH_SIZE ?? '100', 10),
  },
  schedule: {
    // Enable/disable all scheduled tasks
    enabled: process.env.SCHEDULE_ENABLED !== 'false',
    // Cron expression for daily scrape (default: 2 AM daily)
    dailyScrapeTime: process.env.DAILY_SCRAPE_TIME ?? '0 2 * * *',
    // Timezone for cron schedule (default: America/Toronto)
    timezone: process.env.SCHEDULE_TIMEZONE ?? 'America/Toronto',
    // Run the job when the application starts
    runOnInit: process.env.RUN_ON_INIT === 'true',
  },
});
