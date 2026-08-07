import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardCart, CardListing, CardVariant, QueueModule, ShopifyProduct } from '@scoutlgs/core';
import { AuthModule } from '../../auth/auth.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRefreshService } from './cart-refresh.service';
import { CartRescrapePolicy } from './cart-rescrape.policy';

@Module({
  imports: [TypeOrmModule.forFeature([CardCart, CardListing, CardVariant, ShopifyProduct]), AuthModule, QueueModule],
  controllers: [CartController],
  providers: [CartService, CartRefreshService, CartRescrapePolicy],
  exports: [CartService],
})
export class CartModule {}
