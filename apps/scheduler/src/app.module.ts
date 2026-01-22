import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { PopularCardsModule } from './popular-cards/popular-cards.module';
import { ManualModule } from './manual/manual.module';
import { getDatabaseConfig } from '@scoutlgs/core';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),

    // Enable cron jobs
    ScheduleModule.forRoot(),

    // Feature modules
    PopularCardsModule,

    // API to access scheduler status
    ManualModule
  ],
})
export class AppModule {}
