import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().optional(),
        WEBSHARE_USERNAME: Joi.string().required(),
        WEBSHARE_PASSWORD: Joi.string().required(),
        WEBSHARE_PORT: Joi.string().default('80'),
        WEBSHARE_HOST: Joi.string().default('p.webshare.io'),
        OXYLABS_USERNAME: Joi.string().optional(),
        OXYLABS_PASSWORD: Joi.string().optional(),
        OXYLABS_PORT: Joi.string().default('8000'),
        OXYLABS_HOST: Joi.string().default('dc.oxylabs.io'),
      }),
    }),
  ],
})
export class ConfigModule {}
