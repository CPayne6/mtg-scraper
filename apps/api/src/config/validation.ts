import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(5000),
  FRONTEND_URL: Joi.string().default('http://localhost:3000'),
  TRUST_PROXY: Joi.string().optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  AUTH_JWKS_URL: Joi.string()
    .uri()
    .default('http://localhost:5002/auth/internal/.well-known/jwks.json'),
  AUTH_JWT_ISSUER: Joi.string().default('scoutlgs-auth'),
  AUTH_JWT_AUDIENCE: Joi.string().default('scoutlgs-api'),
  AUTH_ACCESS_COOKIE_NAME: Joi.string().default('scoutlgs_access'),
  SCHEDULER_INTERNAL_URL: Joi.string()
    .uri()
    .default('http://scheduler:5001'),
});
