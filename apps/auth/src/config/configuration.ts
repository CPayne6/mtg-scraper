import { existsSync, readFileSync } from 'fs';

const seconds = (value: string | undefined, fallback: number) =>
  Number.parseInt(value ?? `${fallback}`, 10);

const readSecret = (
  value: string | undefined,
  file: string | undefined,
  fallback: string,
) => {
  if (file && existsSync(file)) {
    return readFileSync(file, 'utf8').trim();
  }
  return value ?? fallback;
};

export default () => ({
  port: seconds(process.env.PORT, 5002),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  cookies: {
    secure: process.env.COOKIE_SECURE !== 'false',
    domain: process.env.COOKIE_DOMAIN || undefined,
    accessName: process.env.AUTH_ACCESS_COOKIE_NAME ?? 'scoutlgs_access',
    refreshName: process.env.AUTH_REFRESH_COOKIE_NAME ?? 'scoutlgs_refresh',
    anonymousName:
      process.env.AUTH_ANONYMOUS_COOKIE_NAME ?? 'scoutlgs_anon_session',
  },
  jwt: {
    issuer: process.env.AUTH_JWT_ISSUER ?? 'scoutlgs-auth',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'scoutlgs-api',
    keyId: process.env.AUTH_JWT_KEY_ID ?? 'local-dev',
    privateKeyFile: process.env.AUTH_JWT_PRIVATE_KEY_FILE,
    internalAllowedHosts: (
      process.env.AUTH_INTERNAL_ALLOWED_HOSTS ?? 'auth,localhost,127.0.0.1'
    )
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    accessTtlSeconds: seconds(process.env.AUTH_ACCESS_TTL_SECONDS, 900),
  },
  anonymous: {
    sessionTtlDays: seconds(process.env.AUTH_ANON_SESSION_TTL_DAYS, 90),
    creationLimitPerIpDay: seconds(
      process.env.AUTH_ANON_CREATION_LIMIT_PER_IP_DAY,
      20,
    ),
  },
  userSession: {
    refreshTtlDays: seconds(process.env.AUTH_USER_SESSION_REFRESH_TTL_DAYS, 30),
  },
  security: {
    tokenHashSecret: readSecret(
      process.env.AUTH_TOKEN_HASH_SECRET,
      process.env.AUTH_TOKEN_HASH_SECRET_FILE,
      'dev-only-change-this-secret-value-32-chars',
    ),
  },
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: seconds(process.env.DATABASE_PORT, 5433),
    username: process.env.DATABASE_USER ?? 'postgres',
    password: readSecret(
      process.env.DATABASE_PASSWORD,
      process.env.DATABASE_PASSWORD_FILE,
      'postgres',
    ),
    name: process.env.DATABASE_NAME ?? 'scoutlgs_auth',
  },
});
