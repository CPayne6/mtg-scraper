import { Module } from '@nestjs/common';
import { StoreModule } from '@scoutlgs/core';
import { AuthModule } from '../../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { CheckoutAuditService } from './checkout-audit.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutRateLimiterService } from './checkout-rate-limiter.service';
import { CheckoutService } from './checkout.service';
import { XRequestedWithGuard } from './csrf.guard';

@Module({
  imports: [AuthModule, StoreModule, CartModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    CheckoutRateLimiterService,
    CheckoutAuditService,
    XRequestedWithGuard,
  ],
})
export class CheckoutModule {}
