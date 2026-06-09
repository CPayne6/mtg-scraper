import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardCart } from '@scoutlgs/core';
import { CartCleanupScheduler } from './cart-cleanup.scheduler';
import { CartCleanupService } from './cart-cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([CardCart]), ScheduleModule.forRoot()],
  providers: [CartCleanupScheduler, CartCleanupService],
})
export class CartCleanupModule {}
