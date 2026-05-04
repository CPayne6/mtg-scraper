import { Module } from '@nestjs/common';
import { PrincipalJwtService } from './principal-jwt.service';
import { PrincipalGuard } from './principal.guard';
import { OptionalPrincipalGuard } from './optional-principal.guard';

@Module({
  providers: [PrincipalJwtService, PrincipalGuard, OptionalPrincipalGuard],
  exports: [PrincipalJwtService, PrincipalGuard, OptionalPrincipalGuard],
})
export class AuthModule {}
