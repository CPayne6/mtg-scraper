import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Request } from 'express';
import type {
  PrincipalContext,
  PrincipalKind,
  UserRole,
} from './principal.types';

interface PrincipalJwtPayload extends JWTPayload {
  principal_kind?: PrincipalKind;
  user_uuid?: string;
  sid?: string;
  role?: UserRole;
}

@Injectable()
export class PrincipalJwtService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly configService: ConfigService) {
    const jwksUrl = this.configService.get<string>('auth.jwksUrl');
    if (!jwksUrl) {
      throw new Error('AUTH_JWKS_URL is required');
    }
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verifyRequest(request: Request): Promise<PrincipalContext> {
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.configService.get<string>('auth.issuer'),
      audience: this.configService.get<string>('auth.audience'),
      algorithms: ['EdDSA'],
    });

    return this.toPrincipalContext(payload as PrincipalJwtPayload);
  }

  private extractToken(request: Request): string | undefined {
    const cookieName =
      this.configService.get<string>('auth.accessCookieName') ??
      'scoutlgs_access';
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[cookieName];
  }

  private toPrincipalContext(payload: PrincipalJwtPayload): PrincipalContext {
    if (!payload.sub || !payload.principal_kind) {
      throw new UnauthorizedException('Invalid access token');
    }

    return {
      principalUuid: payload.sub,
      kind: payload.principal_kind,
      userUuid: payload.user_uuid,
      sessionUuid: payload.sid,
      role: payload.role,
    };
  }
}
