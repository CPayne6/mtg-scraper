export default () => ({
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  popularCards: {
    // EDHREC API configuration
    edhrecBaseUrl: process.env.EDHREC_API_URL ?? 'https://json.edhrec.com/pages/top/month-pastmonth',
    // Number of pages to fetch from EDHREC (each page has ~100 cards)
    edhrecPages: parseInt(process.env.EDHREC_PAGES ?? '10', 10),
    // Fallback: Number of cards to scrape (used if API fails)
    limit: parseInt(process.env.POPULAR_CARDS_LIMIT ?? '1000', 10),
    // Batch size for enqueueing cards
    batchSize: parseInt(process.env.POPULAR_CARDS_BATCH_SIZE ?? '50', 10),
  },
  schedule: {
    // Enable/disable all scheduled tasks
    enabled: process.env.SCHEDULE_ENABLED !== 'false',
    // Cron expression for daily scrape (default: 2 AM daily)
    dailyScrapeTime: process.env.DAILY_SCRAPE_TIME ?? '0 2 * * *',
  },
});
