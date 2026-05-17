export default () => ({
  port: parseInt(process.env.PORT ?? '5001', 10),
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  extraction: {
    // Enable/disable scheduled storefront extraction
    enabled: process.env.EXTRACTION_ENABLED === 'true',
    // Cron expression for the nightly full crawl (default: 1 AM daily)
    cronTime: process.env.EXTRACTION_CRON_TIME ?? '0 1 * * *',
    // Trigger a run once on startup (handy for local testing)
    runOnInit: process.env.EXTRACTION_RUN_ON_INIT === 'true',
    // Hourly incremental refresh: re-scrape only products with updated_at
    // newer than the previous run's startedAt. Default runs every hour
    // between 9 AM and 9 PM (timezone-aware via SCHEDULE_TIMEZONE).
    incrementalEnabled: process.env.INCREMENTAL_EXTRACTION_ENABLED === 'true',
    incrementalCronTime: process.env.INCREMENTAL_EXTRACTION_CRON_TIME ?? '0 9-21 * * *',
  },
  schedule: {
    // Timezone for all cron schedules
    timezone: process.env.SCHEDULE_TIMEZONE ?? 'America/Toronto',
  },
});
