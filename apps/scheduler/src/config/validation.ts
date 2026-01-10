import * as Joi from 'joi';

export const validationSchema = Joi.object({
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  POPULAR_CARDS_API_URL: Joi.string().optional(),
  POPULAR_CARDS_LIMIT: Joi.number().default(1000),
  SCHEDULE_ENABLED: Joi.string().default('true'),
  DAILY_SCRAPE_TIME: Joi.string().default('0 2 * * *'),
});
