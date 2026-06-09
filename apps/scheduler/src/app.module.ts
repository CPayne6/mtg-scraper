import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { ManualModule } from './manual/manual.module';
import { ExtractionOrchestratorModule } from './extraction/extraction-orchestrator.module';
import { getDatabaseConfig } from '@scoutlgs/core';
import { CartCleanupModule } from './cart-cleanup/cart-cleanup.module';

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
    TypeOrmModule.forRootAsync({
      name: 'auth',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('authDatabase.host'),
        port: configService.get<number>('authDatabase.port'),
        username: configService.get<string>('authDatabase.username'),
        password: configService.get<string>('authDatabase.password'),
        database: configService.get<string>('authDatabase.name'),
        synchronize: false,
      }),
    }),

    // Enable cron jobs
    ScheduleModule.forRoot(),

    // Product discovery (V2 scraping)
    ExtractionOrchestratorModule,

    // Long-term cart retention cleanup
    CartCleanupModule,

    // API to access scheduler status
    ManualModule
  ],
})
export class AppModule {}
