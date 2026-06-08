import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutBuild, StoreModule } from '@scoutlgs/core';
import { AuthModule } from '../../auth/auth.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutRateLimiterService } from './checkout-rate-limiter.service';
import { CheckoutService } from './checkout.service';
import { XRequestedWithGuard } from './csrf.guard';

@Module({
  imports: [TypeOrmModule.forFeature([CheckoutBuild]), AuthModule, StoreModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutRateLimiterService, XRequestedWithGuard],
})
export class CheckoutModule {}
