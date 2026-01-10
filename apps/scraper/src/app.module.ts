import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './config/config.module';
import { getDatabaseConfig } from '@scoutlgs/core';
import { ScraperModule } from './scraper/scraper.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    ScraperModule,
  ]
})
export class AppModule {}
