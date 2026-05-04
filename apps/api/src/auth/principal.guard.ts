import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrincipalJwtService } from './principal-jwt.service';
import type { PrincipalContext } from './principal.types';

type PrincipalRequest = Request & { principal?: PrincipalContext };

@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(private readonly principalJwtService: PrincipalJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    try {
      request.principal = await this.principalJwtService.verifyRequest(request);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
