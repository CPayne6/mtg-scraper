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
} from '@scoutlgs/core';
import { AuthModule } from '../auth/auth.module';
import { StorefrontOnboardingController } from './storefront-onboarding.controller';
import { StorefrontOnboardingRun } from './storefront-onboarding-run.entity';
import { StorefrontOnboardingApiService } from './storefront-onboarding.service';
import { StorefrontOnboardingIdentityService } from './storefront-onboarding-identity.service';

@Module({
  imports: [
    AuthModule,
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
  controllers: [StorefrontOnboardingController],
  providers: [
    StorefrontOnboardingApiService,
    PrintingMatcherService,
    TokenMatcherService,
    StorefrontOnboardingDryRunService,
    StorefrontOnboardingIdentityService,
  ],
  exports: [StorefrontOnboardingIdentityService],
})
export class StorefrontOnboardingModule {}
