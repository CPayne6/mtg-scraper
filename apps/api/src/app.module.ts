import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { CardModule } from './card/card.module';
import { HealthModule } from './health/health.module';
import { V1Module } from './v1/v1.module';
import { StoreModule } from '@scoutlgs/core';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { getDatabaseConfig } from '@scoutlgs/core';
import { AuthModule } from './auth/auth.module';
import { StorefrontOnboardingModule } from './storefront-onboarding/storefront-onboarding.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...getDatabaseConfig(configService),
        autoLoadEntities: true,
      }),
      // API-owned entities (such as onboarding audit runs) are not part of
      // @scoutlgs/core's shared database configuration.
    }),
    StoreModule,
    AuthModule,
    AdminModule,
    CardModule,
    V1Module,
    HealthModule,
    StorefrontOnboardingModule,
  ],
})
export class AppModule {}
