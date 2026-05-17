export default () => ({
  port: parseInt(process.env.PORT ?? '5001', 10),
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  discovery: {
    // Enable/disable product discovery (V2 scraping)
    enabled: process.env.DISCOVERY_ENABLED === 'true',
    // Cron expression for discovery (default: 1 AM daily)
    cronTime: process.env.DISCOVERY_CRON_TIME ?? '0 1 * * *',
    // Run discovery when the application starts
    runOnInit: process.env.DISCOVERY_RUN_ON_INIT === 'true',
  },
  schedule: {
    // Timezone for cron schedule (default: America/Toronto)
    timezone: process.env.SCHEDULE_TIMEZONE ?? 'America/Toronto',
  },
});
