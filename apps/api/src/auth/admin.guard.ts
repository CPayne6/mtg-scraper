import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrincipalGuard } from './principal.guard';
import type { PrincipalContext } from './principal.types';

type PrincipalRequest = Request & { principal?: PrincipalContext };

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly principalGuard: PrincipalGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.principalGuard.canActivate(context);

    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    const principal = request.principal;
    if (
      !principal ||
      principal.kind !== 'user' ||
      principal.role !== 'admin'
    ) {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}
