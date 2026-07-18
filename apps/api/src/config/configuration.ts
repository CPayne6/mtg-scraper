export default () => ({
  port: parseInt(process.env.PORT ?? '5000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  trustProxy: process.env.TRUST_PROXY,
  auth: {
    jwksUrl:
      process.env.AUTH_JWKS_URL ??
      'http://localhost:5002/auth/internal/.well-known/jwks.json',
    issuer: process.env.AUTH_JWT_ISSUER ?? 'scoutlgs-auth',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'scoutlgs-api',
    accessCookieName: process.env.AUTH_ACCESS_COOKIE_NAME ?? 'scoutlgs_access',
  },
  scheduler: {
    internalUrl:
      process.env.SCHEDULER_INTERNAL_URL ?? 'http://scheduler:5001',
  },
  delivery: {
    addressQuotesEnabled: process.env.ENABLE_DELIVERY_ADDRESS_QUOTES === 'true',
  },
  // V2 Scraping: Use database-first approach instead of cache-first
  useDatabaseFirst: process.env.USE_DATABASE_FIRST === 'true',
});
