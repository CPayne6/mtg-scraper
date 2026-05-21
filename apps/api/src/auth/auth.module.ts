import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { PrincipalJwtService } from './principal-jwt.service';
import { PrincipalGuard } from './principal.guard';
import { OptionalPrincipalGuard } from './optional-principal.guard';

@Module({
  providers: [
    PrincipalJwtService,
    PrincipalGuard,
    OptionalPrincipalGuard,
    AdminGuard,
  ],
  exports: [
    PrincipalJwtService,
    PrincipalGuard,
    OptionalPrincipalGuard,
    AdminGuard,
  ],
})
export class AuthModule {}
