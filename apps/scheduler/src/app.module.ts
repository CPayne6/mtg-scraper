import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { ManualModule } from './manual/manual.module';
import { ExtractionOrchestratorModule } from './extraction/extraction-orchestrator.module';
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

    // Product discovery (V2 scraping)
    ExtractionOrchestratorModule,

    // API to access scheduler status
    ManualModule
  ],
})
export class AppModule {}
