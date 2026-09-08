import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CardName,
  CardPrinting,
  PrintingMatcherService,
  ScryfallSet,
  Store,
  StorefrontOnboardingDryRunService,
  TokenMatcherService,
  TokenName,
  TokenPrinting,
  PlatformModule,
} from '@scoutlgs/core';
import { AuthModule } from '../auth/auth.module';
import { StorefrontOnboardingController } from './storefront-onboarding.controller';
import { StorefrontOnboardingRun } from './storefront-onboarding-run.entity';
import { StorefrontOnboardingApiService } from './storefront-onboarding.service';
import { StorefrontOnboardingIdentityService } from './storefront-onboarding-identity.service';
import { StorefrontOnboardingExecutionService } from './storefront-onboarding-execution.service';
import { ShopifyStorefrontOnboardingExplorer } from './api-onboarding-executor.service';
import { AdminStoreStatusController } from './admin-store-status.controller';
import { ConductCommerceOnboardingExplorer } from './conduct-commerce-onboarding-explorer.service';
import { ApiStorefrontOnboardingExecutor, ONBOARDING_EXPLORERS } from './onboarding-explorer-registry.service';

@Module({
  imports: [
    AuthModule,
    PlatformModule,
    TypeOrmModule.forFeature([
      StorefrontOnboardingRun,
      Store,
      CardName,
      CardPrinting,
      ScryfallSet,
      TokenName,
      TokenPrinting,
    ]),
  ],
  controllers: [StorefrontOnboardingController, AdminStoreStatusController],
  providers: [
    StorefrontOnboardingApiService,
    PrintingMatcherService,
    TokenMatcherService,
    StorefrontOnboardingDryRunService,
    StorefrontOnboardingIdentityService,
    StorefrontOnboardingExecutionService,
    ShopifyStorefrontOnboardingExplorer,
    ConductCommerceOnboardingExplorer,
    {
      provide: ONBOARDING_EXPLORERS,
      useFactory: (conduct: ConductCommerceOnboardingExplorer, shopify: ShopifyStorefrontOnboardingExplorer) => [conduct, shopify],
      inject: [ConductCommerceOnboardingExplorer, ShopifyStorefrontOnboardingExplorer],
    },
    ApiStorefrontOnboardingExecutor,
  ],
  exports: [StorefrontOnboardingIdentityService, StorefrontOnboardingExecutionService],
})
export class StorefrontOnboardingModule {}
