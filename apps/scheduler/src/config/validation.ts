import * as Joi from 'joi';

export const validationSchema = Joi.object({
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  AUTH_DATABASE_HOST: Joi.string().default('localhost'),
  AUTH_DATABASE_PORT: Joi.number().default(5433),
  AUTH_DATABASE_USER: Joi.string().default('postgres'),
  AUTH_DATABASE_PASSWORD: Joi.string().default('postgres'),
  AUTH_DATABASE_NAME: Joi.string().default('scoutlgs_auth'),
  EXTRACTION_ENABLED: Joi.string().default('false'),
  EXTRACTION_CRON_TIME: Joi.string().default('0 1 * * *'),
  INCREMENTAL_EXTRACTION_ENABLED: Joi.string().default('false'),
  INCREMENTAL_EXTRACTION_CRON_TIME: Joi.string().default('0 9-21 * * *'),
  CART_CLEANUP_ENABLED: Joi.string().default('true'),
  CART_CLEANUP_CRON_TIME: Joi.string().default('0 3 * * *'),
  CART_ANONYMOUS_RETENTION_DAYS: Joi.number().default(30),
  SCHEDULE_TIMEZONE: Joi.string().default('America/Toronto'),
});
