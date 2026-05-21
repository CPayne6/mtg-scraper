import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(5002),
  FRONTEND_URL: Joi.string().default('http://localhost:3001'),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(true),
  COOKIE_DOMAIN: Joi.string().optional(),
  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().default(5433),
  DATABASE_NAME: Joi.string().default('scoutlgs_auth'),
  DATABASE_USER: Joi.string().default('postgres'),
  DATABASE_PASSWORD: Joi.string().default('postgres'),
  DATABASE_PASSWORD_FILE: Joi.string().optional(),
  AUTH_ACCESS_COOKIE_NAME: Joi.string().default('scoutlgs_access'),
  AUTH_REFRESH_COOKIE_NAME: Joi.string().default('scoutlgs_refresh'),
  AUTH_ANONYMOUS_COOKIE_NAME: Joi.string().default('scoutlgs_anon_session'),
  AUTH_JWT_ISSUER: Joi.string().default('scoutlgs-auth'),
  AUTH_JWT_AUDIENCE: Joi.string().default('scoutlgs-api'),
  AUTH_JWT_KEY_ID: Joi.string().default('local-dev'),
  AUTH_JWT_PRIVATE_KEY_FILE: Joi.string().optional(),
  AUTH_INTERNAL_ALLOWED_HOSTS: Joi.string().default(
    'auth,localhost,127.0.0.1',
  ),
  AUTH_ACCESS_TTL_SECONDS: Joi.number().min(60).default(900),
  AUTH_ANON_SESSION_TTL_DAYS: Joi.number().min(1).default(90),
  AUTH_ANON_CREATION_LIMIT_PER_IP_DAY: Joi.number().min(1).default(20),
  AUTH_USER_SESSION_REFRESH_TTL_DAYS: Joi.number().min(1).default(30),
  AUTH_TOKEN_HASH_SECRET: Joi.string().min(32).when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).when('AUTH_TOKEN_HASH_SECRET_FILE', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    otherwise: Joi.string()
      .min(32)
      .default('dev-only-change-this-secret-value-32-chars'),
  }),
  AUTH_TOKEN_HASH_SECRET_FILE: Joi.string().optional(),
  LOG_LEVEL: Joi.string().optional(),
});
