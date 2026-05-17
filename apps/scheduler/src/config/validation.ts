import * as Joi from 'joi';

export const validationSchema = Joi.object({
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  DISCOVERY_ENABLED: Joi.string().default('false'),
  DISCOVERY_CRON_TIME: Joi.string().default('0 1 * * *'),
  SCHEDULE_TIMEZONE: Joi.string().default('America/Toronto'),
});
