import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardModule } from './card/card.module';
import { HealthModule } from './health/health.module';
import { StoreModule } from '@mtg-scraper/core';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { getDatabaseConfig } from '@mtg-scraper/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    StoreModule,
    CardModule,
    HealthModule,
  ],
})
export class AppModule {}
