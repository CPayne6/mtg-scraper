import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrincipalGuard } from './principal.guard';
import type { PrincipalContext } from './principal.types';

type PrincipalRequest = Request & { principal?: PrincipalContext };

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly principalGuard: PrincipalGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Deliberately collapse every auth failure mode (missing token, invalid
    // token, valid token but non-admin) into a single 404 so callers cannot
    // distinguish "this endpoint exists but you can't see it" from "this
    // endpoint does not exist." Bots scanning for admin surface get nothing.
    try {
      await this.principalGuard.canActivate(context);
    } catch {
      throw new NotFoundException();
    }

    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    const principal = request.principal;
    if (
      !principal ||
      principal.kind !== 'user' ||
      principal.role !== 'admin'
    ) {
      throw new NotFoundException();
    }
    return true;
  }
}
