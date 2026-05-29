import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { AnonymousSession } from '../database/entities/anonymous-session.entity';
import { OAuthAccount } from '../database/entities/oauth-account.entity';
import { Principal } from '../database/entities/principal.entity';
import { UserEmail } from '../database/entities/user-email.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { User } from '../database/entities/user.entity';
import type { SessionResponse } from './auth-session.service';
import { normalizeEmail } from './email.utils';
import type { GoogleProfile } from './google-oauth.service';
import { JwtService } from './jwt.service';
import { TokenHashService } from './token-hash.service';

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

@Injectable()
export class OAuthSignInService {
  constructor(
    @InjectRepository(AnonymousSession)
    private readonly anonymousSessionRepository: Repository<AnonymousSession>,
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    private readonly entityManager: EntityManager,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tokenHashService: TokenHashService,
  ) {}

  async signInWithGoogle(
    profile: GoogleProfile,
    req: RequestWithCookies,
    res: Response,
  ): Promise<SessionResponse> {
    if (profile.email && !profile.emailVerified) {
      throw new UnauthorizedException(
        'Google has not verified this email. Please verify the email on your Google account and try again.',
      );
    }

    const rawRefreshToken = this.newOpaqueToken();
    const refreshTokenHash = this.tokenHashService.hash(rawRefreshToken);
    const now = new Date();
    const refreshExpiresAt = this.addDays(
      now,
      this.configService.get<number>('userSession.refreshTtlDays') ?? 30,
    );

    const { principal, user, session } = await this.entityManager.transaction(
      async (manager) => {
        const principalRepository = manager.getRepository(Principal);
        const userRepository = manager.getRepository(User);
        const userEmailRepository = manager.getRepository(UserEmail);
        const oauthAccountRepository = manager.getRepository(OAuthAccount);
        const userSessionRepository = manager.getRepository(UserSession);

        let oauthAccount = await oauthAccountRepository.findOne({
          where: { provider: 'google', providerSubject: profile.sub },
          relations: ['user', 'user.principal', 'user.emails'],
        });

        let user: User;
        let principal: Principal;

        if (oauthAccount) {
          user = oauthAccount.user;
          principal = oauthAccount.user.principal;
        } else if (profile.email) {
          const normalized = normalizeEmail(profile.email);
          const existingEmail = await userEmailRepository.findOne({
            where: { normalizedEmail: normalized },
            relations: ['user', 'user.principal', 'user.emails'],
          });

          if (existingEmail) {
            user = existingEmail.user;
            principal = existingEmail.user.principal;
          } else {
            ({ user, principal } = await this.createUserFromGoogle(
              manager,
              req,
              profile,
              now,
            ));
          }
        } else {
          ({ user, principal } = await this.createUserFromGoogle(
            manager,
            req,
            profile,
            now,
          ));
        }

        if (!oauthAccount) {
          oauthAccount = oauthAccountRepository.create({
            userId: user.id,
            provider: 'google',
            providerSubject: profile.sub,
            providerEmail: profile.email ?? null,
            providerEmailVerified: profile.emailVerified,
            displayName: profile.name ?? null,
            avatarUrl: profile.picture ?? null,
          });
        } else {
          oauthAccount.providerEmail = profile.email ?? oauthAccount.providerEmail;
          oauthAccount.providerEmailVerified = profile.emailVerified;
          oauthAccount.displayName = profile.name ?? oauthAccount.displayName;
          oauthAccount.avatarUrl = profile.picture ?? oauthAccount.avatarUrl;
        }
        await oauthAccountRepository.save(oauthAccount);

        if (!user.displayName && profile.name) {
          user.displayName = profile.name;
          await userRepository.save(user);
        }

        if (user.disabledAt) {
          throw new UnauthorizedException('Account is disabled');
        }

        principal.lastSeenAt = now;
        principal.kind = 'user';
        principal.expiresAt = null;
        await principalRepository.save(principal);

        const session = userSessionRepository.create({
          userId: user.id,
          sessionUuid: randomUUID(),
          refreshTokenHash,
          ipHash: this.hashIp(req),
          userAgentHash: this.hashUserAgent(req),
          expiresAt: refreshExpiresAt,
          lastSeenAt: now,
        });
        await userSessionRepository.save(session);

        return { principal, user, session };
      },
    );

    await this.setUserSessionCookies(
      res,
      principal,
      user,
      session,
      rawRefreshToken,
    );
    this.clearCookie(res, this.anonymousCookieName, '/auth');

    return this.toSessionResponse(principal, user);
  }

  private async createUserFromGoogle(
    manager: EntityManager,
    req: RequestWithCookies,
    profile: GoogleProfile,
    now: Date,
  ): Promise<{ user: User; principal: Principal }> {
    const principalRepository = manager.getRepository(Principal);
    const userRepository = manager.getRepository(User);
    const userEmailRepository = manager.getRepository(UserEmail);

    const anonymousSession = await this.getExistingAnonymousSession(
      manager,
      req,
    );

    let principal: Principal;
    if (anonymousSession) {
      principal = anonymousSession.principal;
      principal.kind = 'user';
      principal.expiresAt = null;
      principal.lastSeenAt = now;
      await principalRepository.save(principal);

      anonymousSession.revokedAt = now;
      await manager.getRepository(AnonymousSession).save(anonymousSession);
    } else {
      principal = principalRepository.create({
        kind: 'user',
        lastSeenAt: now,
        expiresAt: null,
      });
      await principalRepository.save(principal);
    }

    const user = userRepository.create({
      principalId: principal.id,
      displayName: profile.name ?? null,
    });
    await userRepository.save(user);

    if (profile.email) {
      const userEmail = userEmailRepository.create({
        userId: user.id,
        email: profile.email,
        normalizedEmail: normalizeEmail(profile.email),
        source: 'google',
        verifiedAt: profile.emailVerified ? now : null,
      });
      await userEmailRepository.save(userEmail);

      user.primaryEmailId = userEmail.id;
      user.emails = [userEmail];
      await userRepository.save(user);
    } else {
      user.emails = [];
    }

    user.principal = principal;

    return { user, principal };
  }

  private async getExistingAnonymousSession(
    manager: EntityManager,
    req: RequestWithCookies,
  ): Promise<AnonymousSession | null> {
    const rawToken = req.cookies?.[this.anonymousCookieName];
    if (!rawToken) {
      return null;
    }

    return manager.getRepository(AnonymousSession).findOne({
      where: {
        tokenHash: this.tokenHashService.hash(rawToken),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['principal'],
    });
  }

  private async setUserSessionCookies(
    res: Response,
    principal: Principal,
    user: User,
    session: UserSession,
    rawRefreshToken: string,
  ): Promise<void> {
    const accessToken = await this.jwtService.signAccessToken({
      principalUuid: principal.uuid,
      principalKind: 'user',
      userUuid: user.uuid,
      sessionUuid: session.sessionUuid,
      role: user.role,
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

    res.cookie(this.refreshCookieName, rawRefreshToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      domain: this.cookieDomain,
      path: '/auth',
      expires: session.expiresAt,
    });
  }

  private toSessionResponse(principal: Principal, user: User): SessionResponse {
    const primaryEmail =
      user.emails?.find((email) => email.id === user.primaryEmailId) ??
      user.emails?.[0];

    return {
      authenticated: true,
      principal: {
        uuid: principal.uuid,
        kind: 'user',
      },
      user: {
        uuid: user.uuid,
        displayName: user.displayName ?? null,
        email: primaryEmail?.email ?? null,
        role: user.role,
      },
    };
  }

  private clearCookie(res: Response, name: string, path: string): void {
    res.clearCookie(name, {
      secure: this.cookieSecure,
      sameSite: 'lax',
      domain: this.cookieDomain,
      path,
    });
  }

  private hashIp(req: Request): string {
    return this.tokenHashService.hash(this.extractIp(req));
  }

  private hashUserAgent(req: Request): string | null {
    const userAgent = req.header('user-agent');
    return userAgent ? this.tokenHashService.hash(userAgent) : null;
  }

  private extractIp(req: Request): string {
    const cfConnectingIp = req.header('cf-connecting-ip');
    if (cfConnectingIp) {
      return cfConnectingIp;
    }
    const forwardedFor = req.header('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
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
