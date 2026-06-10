import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { AnonymousSession } from '../database/entities/anonymous-session.entity';
import { Principal } from '../database/entities/principal.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { UserRole } from '../database/entities/user.entity';
import { JwtService } from './jwt.service';
import { TokenHashService } from './token-hash.service';
import { extractClientIp } from './client-ip.util';

export interface SessionResponse {
  authenticated: boolean;
  principal: null | {
    uuid: string;
    kind: 'anonymous' | 'user';
  };
  user: null | {
    uuid: string;
    displayName: string | null;
    email: string | null;
    role: UserRole;
  };
}

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    @InjectRepository(Principal)
    private readonly principalRepository: Repository<Principal>,
    @InjectRepository(AnonymousSession)
    private readonly anonymousSessionRepository: Repository<AnonymousSession>,
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    private readonly entityManager: EntityManager,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tokenHashService: TokenHashService,
  ) {}

  async getSession(
    req: RequestWithCookies,
    res: Response,
  ): Promise<SessionResponse> {
    const accessToken = req.cookies?.[this.accessCookieName];
    if (accessToken) {
      const principal = await this.getPrincipalFromAccessToken(accessToken);
      if (principal) {
        return this.toSessionResponse(principal);
      }
    }

    const userSession = await this.refreshUserSession(req, res);
    if (userSession) {
      return this.toSessionResponse(
        userSession.user.principal,
        userSession.user,
      );
    }

    const session = await this.getExistingAnonymousSession(req);
    if (session) {
      await this.refreshAnonymousSession(session, req, res);
      return this.toSessionResponse(session.principal);
    }

    return { authenticated: false, principal: null, user: null };
  }

  async createAnonymousSession(
    req: RequestWithCookies,
    res: Response,
  ): Promise<SessionResponse> {
    const existingSession = await this.getSession(req, res);
    if (existingSession.principal) {
      return existingSession;
    }

    const principal = await this.createAnonymousPrincipal(req, res);
    return this.toSessionResponse(principal);
  }

  private async getPrincipalFromAccessToken(
    accessToken: string,
  ): Promise<Principal | null> {
    try {
      const claims = await this.jwtService.verifyAccessToken(accessToken);
      if (!claims.sub || !claims.principal_kind) {
        return null;
      }

      return this.principalRepository.findOne({
        where: {
          uuid: claims.sub,
          kind: claims.principal_kind,
        },
        relations:
          claims.principal_kind === 'user' ? ['user', 'user.emails'] : [],
      });
    } catch {
      return null;
    }
  }

  private async refreshUserSession(
    req: RequestWithCookies,
    res: Response,
  ): Promise<UserSession | null> {
    const rawRefreshToken = req.cookies?.[this.refreshCookieName];
    if (!rawRefreshToken) {
      return null;
    }

    const session = await this.userSessionRepository.findOne({
      where: {
        refreshTokenHash: this.tokenHashService.hash(rawRefreshToken),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['user', 'user.principal', 'user.emails'],
    });

    if (!session) {
      return null;
    }

    const now = new Date();
    if (session.user.disabledAt) {
      session.revokedAt = now;
      await this.userSessionRepository.save(session);
      return null;
    }

    session.lastSeenAt = now;
    session.ipHash = this.hashIp(req);
    session.userAgentHash = this.hashUserAgent(req);
    session.user.principal.lastSeenAt = now;
    await this.userSessionRepository.save(session);
    await this.principalRepository.save(session.user.principal);
    await this.setAccessCookie(
      res,
      session.user.principal,
      session.user.uuid,
      session.sessionUuid,
      session.user.role,
    );

    return session;
  }

  private async getExistingAnonymousSession(
    req: RequestWithCookies,
  ): Promise<AnonymousSession | null> {
    const rawToken = req.cookies?.[this.anonymousCookieName];
    if (!rawToken) {
      return null;
    }

    const tokenHash = this.tokenHashService.hash(rawToken);
    return this.anonymousSessionRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['principal'],
    });
  }

  private async createAnonymousPrincipal(
    req: RequestWithCookies,
    res: Response,
  ): Promise<Principal> {
    const ipHash = this.hashIp(req);
    const userAgentHash = this.hashUserAgent(req);
    const now = new Date();
    const expiresAt = this.addDays(
      now,
      this.configService.get<number>('anonymous.sessionTtlDays') ?? 90,
    );
    const rawSessionToken = this.newOpaqueToken();
    const tokenHash = this.tokenHashService.hash(rawSessionToken);

    const principal = await this.entityManager.transaction(async (manager) => {
      await this.consumeAnonymousCreationQuota(manager, ipHash);

      const principalRepository = manager.getRepository(Principal);
      const anonymousSessionRepository =
        manager.getRepository(AnonymousSession);

      const createdPrincipal = principalRepository.create({
        kind: 'anonymous',
        lastSeenAt: now,
        expiresAt,
      });
      await principalRepository.save(createdPrincipal);

      const session = anonymousSessionRepository.create({
        principalId: createdPrincipal.id,
        tokenHash,
        ipHash,
        userAgentHash,
        lastSeenAt: now,
        expiresAt,
      });
      await anonymousSessionRepository.save(session);

      return createdPrincipal;
    });

    await this.setSessionCookies(res, principal, rawSessionToken, expiresAt);
    return principal;
  }

  private async refreshAnonymousSession(
    session: AnonymousSession,
    req: RequestWithCookies,
    res: Response,
  ): Promise<void> {
    const now = new Date();
    session.lastSeenAt = now;
    session.ipHash = this.hashIp(req);
    session.userAgentHash = this.hashUserAgent(req);
    session.principal.lastSeenAt = now;
    await this.anonymousSessionRepository.save(session);
    await this.principalRepository.save(session.principal);

    const rawSessionToken = req.cookies?.[this.anonymousCookieName];
    if (!rawSessionToken) {
      throw new UnauthorizedException('Missing anonymous session');
    }

    await this.setSessionCookies(
      res,
      session.principal,
      rawSessionToken,
      session.expiresAt,
    );
  }

  private async consumeAnonymousCreationQuota(
    manager: EntityManager,
    ipHash: string,
  ): Promise<void> {
    const maxPerDay =
      this.configService.get<number>('anonymous.creationLimitPerIpDay') ?? 20;

    const rows = await manager.query(
      `
      INSERT INTO anonymous_creation_quotas ("ip_hash", "window_start", "created_count")
      VALUES ($1, CURRENT_DATE, 1)
      ON CONFLICT ("ip_hash", "window_start")
      DO UPDATE SET
        "created_count" = anonymous_creation_quotas."created_count" + 1,
        "updated_at" = now()
      RETURNING "created_count"
      `,
      [ipHash],
    );

    const createdCount = Number(rows[0]?.created_count ?? 0);
    if (createdCount > maxPerDay) {
      this.logger.warn(
        `Anonymous principal creation limit exceeded for IP hash ${ipHash}`,
      );
      throw new HttpException(
        'Too many anonymous sessions created from this network today',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async setSessionCookies(
    res: Response,
    principal: Principal,
    rawSessionToken: string,
    anonymousExpiresAt: Date,
  ): Promise<void> {
    await this.setAccessCookie(res, principal);

    res.cookie(this.anonymousCookieName, rawSessionToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      domain: this.cookieDomain,
      path: '/auth',
      expires: anonymousExpiresAt,
    });
  }

  private async setAccessCookie(
    res: Response,
    principal: Principal,
    userUuid?: string,
    sessionUuid?: string,
    role?: UserRole,
  ): Promise<void> {
    const accessToken = await this.jwtService.signAccessToken({
      principalUuid: principal.uuid,
      principalKind: principal.kind,
      userUuid,
      sessionUuid,
      role,
    });

    res.cookie(this.accessCookieName, accessToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      domain: this.cookieDomain,
      path: '/',
      maxAge:
        (this.configService.get<number>('jwt.accessTtlSeconds') ?? 900) * 1000,
    });
  }

  private toSessionResponse(
    principal: Principal,
    user = principal.user,
  ): SessionResponse {
    const primaryEmail =
      user?.emails?.find((email) => email.id === user.primaryEmailId) ??
      user?.emails?.[0];

    return {
      authenticated: principal.kind === 'user',
      principal: {
        uuid: principal.uuid,
        kind: principal.kind,
      },
      user:
        principal.kind === 'user' && user
          ? {
              uuid: user.uuid,
              displayName: user.displayName ?? null,
              email: primaryEmail?.email ?? null,
              role: user.role,
            }
          : null,
    };
  }

  private hashIp(req: Request): string {
    return this.tokenHashService.hash(extractClientIp(req));
  }

  private hashUserAgent(req: Request): string | null {
    const userAgent = req.header('user-agent');
    return userAgent ? this.tokenHashService.hash(userAgent) : null;
  }

  private newOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private get accessCookieName(): string {
    return (
      this.configService.get<string>('cookies.accessName') ?? 'scoutlgs_access'
    );
  }

  private get refreshCookieName(): string {
    return (
      this.configService.get<string>('cookies.refreshName') ??
      'scoutlgs_refresh'
    );
  }

  private get anonymousCookieName(): string {
    return (
      this.configService.get<string>('cookies.anonymousName') ??
      'scoutlgs_anon_session'
    );
  }

  private get cookieSecure(): boolean {
    return this.configService.get<boolean>('cookies.secure') ?? true;
  }

  private get cookieDomain(): string | undefined {
    return this.configService.get<string>('cookies.domain');
  }
}
