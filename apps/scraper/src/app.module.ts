import { Module } from '@nestjs/common';
import {
  ConfigModule as NestConfigModule,
  ConfigService,
} from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './config/config.module';
import { getDatabaseConfig } from '@scoutlgs/core';
import { ScraperModule } from './scraper/scraper.module';
import { ExtractionModule } from './extraction/extraction.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    ScraperModule,
    ExtractionModule,
    DiscoveryModule,
    HealthModule,
  ],
})
export class AppModule {}
