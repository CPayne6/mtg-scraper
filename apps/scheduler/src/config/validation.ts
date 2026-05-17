import * as Joi from 'joi';

export const validationSchema = Joi.object({
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  EXTRACTION_ENABLED: Joi.string().default('false'),
  EXTRACTION_CRON_TIME: Joi.string().default('0 1 * * *'),
  INCREMENTAL_EXTRACTION_ENABLED: Joi.string().default('false'),
  INCREMENTAL_EXTRACTION_CRON_TIME: Joi.string().default('0 9-21 * * *'),
  SCHEDULE_TIMEZONE: Joi.string().default('America/Toronto'),
});
