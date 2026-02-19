export default () => ({
  port: parseInt(process.env.PORT ?? '5000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  // V2 Scraping: Use database-first approach instead of cache-first
  useDatabaseFirst: process.env.USE_DATABASE_FIRST === 'true',
});
