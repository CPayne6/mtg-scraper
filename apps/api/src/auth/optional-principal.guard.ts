import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrincipalJwtService } from './principal-jwt.service';
import type { PrincipalContext } from './principal.types';

type PrincipalRequest = Request & { principal?: PrincipalContext };

@Injectable()
export class OptionalPrincipalGuard implements CanActivate {
  constructor(private readonly principalJwtService: PrincipalJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    try {
      request.principal = await this.principalJwtService.verifyRequest(request);
    } catch {
      request.principal = undefined;
    }
    return true;
  }
}
