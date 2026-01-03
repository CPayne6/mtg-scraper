import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { PopularCardsModule } from './popular-cards/popular-cards.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),

    // Enable cron jobs
    ScheduleModule.forRoot(),

    // Feature modules
    PopularCardsModule,
  ],
})
export class AppModule {}
