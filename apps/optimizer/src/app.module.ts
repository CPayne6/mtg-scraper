import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardOptimizationService, getDatabaseConfig, QueueModule } from '@scoutlgs/core';
import { OptimizationProcessor } from './optimization.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: getDatabaseConfig }),
    QueueModule,
  ],
  providers: [CardOptimizationService, OptimizationProcessor],
})
export class AppModule {}
