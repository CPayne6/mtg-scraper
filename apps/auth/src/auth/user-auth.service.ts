import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { AnonymousSession } from '../database/entities/anonymous-session.entity';
import { PasswordCredential } from '../database/entities/password-credential.entity';
import { Principal } from '../database/entities/principal.entity';
import { UserEmail } from '../database/entities/user-email.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { User } from '../database/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { normalizeEmail } from './email.utils';
import type { SessionResponse } from './auth-session.service';
import { extractClientIp } from './client-ip.util';
import { JwtService } from './jwt.service';
import { PasswordHashService } from './password-hash.service';
import { TokenHashService } from './token-hash.service';

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

@Injectable()
export class UserAuthService {
  constructor(
    @InjectRepository(Principal)
    private readonly principalRepository: Repository<Principal>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(PasswordCredential)
    private readonly passwordCredentialRepository: Repository<PasswordCredential>,
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    private readonly entityManager: EntityManager,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tokenHashService: TokenHashService,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  async signup(
    dto: SignupDto,
    req: RequestWithCookies,
    res: Response,
  ): Promise<SessionResponse> {
    const email = dto.email.trim();
    const normalizedEmail = normalizeEmail(email);
    const displayName = dto.displayName?.trim() || null;

    const existingEmail = await this.userEmailRepository.findOne({
      where: { normalizedEmail },
    });
    if (existingEmail) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwordHashService.hash(dto.password);
    const rawRefreshToken = this.newOpaqueToken();
    const refreshTokenHash = this.tokenHashService.hash(rawRefreshToken);
    const now = new Date();
    const refreshExpiresAt = this.addDays(
      now,
      this.configService.get<number>('userSession.refreshTtlDays') ?? 30,
    );

    const { principal, user, session } = await this.entityManager.transaction(
      async (manager) => {
        const userEmailRepository = manager.getRepository(UserEmail);
        const duplicateEmail = await userEmailRepository.findOne({
          where: { normalizedEmail },
        });
        if (duplicateEmail) {
          throw new ConflictException('Email is already registered');
        }

        const principalRepository = manager.getRepository(Principal);
        const userRepository = manager.getRepository(User);
        const passwordCredentialRepository =
          manager.getRepository(PasswordCredential);
        const userSessionRepository = manager.getRepository(UserSession);

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
          displayName,
        });
        await userRepository.save(user);

        const userEmail = userEmailRepository.create({
          userId: user.id,
          email,
          normalizedEmail,
          source: 'password',
          verifiedAt: null,
        });
        await userEmailRepository.save(userEmail);

        user.primaryEmailId = userEmail.id;
        user.emails = [userEmail];
        user.principal = principal;
        await userRepository.save(user);

        const passwordCredential = passwordCredentialRepository.create({
          userId: user.id,
          passwordHash,
          passwordUpdatedAt: now,
        });
        await passwordCredentialRepository.save(passwordCredential);

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

    await this.setUserSessionCookies(res, principal, user, session, rawRefreshToken);
    this.clearCookie(res, this.anonymousCookieName, '/auth');
    return this.toSessionResponse(principal, user);
  }

  async login(
    dto: LoginDto,
    req: RequestWithCookies,
    res: Response,
  ): Promise<SessionResponse> {
    const normalizedEmail = normalizeEmail(dto.email);
    const userEmail = await this.userEmailRepository.findOne({
      where: { normalizedEmail },
      relations: ['user', 'user.principal', 'user.emails'],
    });
    const passwordCredential = userEmail
      ? await this.passwordCredentialRepository.findOne({
          where: { userId: userEmail.userId },
        })
      : null;

    if (!userEmail || !passwordCredential) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (userEmail.user.disabledAt) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const validPassword = await this.passwordHashService.verify(
      passwordCredential.passwordHash,
      dto.password,
    );
    if (!validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const rawRefreshToken = this.newOpaqueToken();
    const now = new Date();
    const session = this.userSessionRepository.create({
      userId: userEmail.userId,
      sessionUuid: randomUUID(),
      refreshTokenHash: this.tokenHashService.hash(rawRefreshToken),
      ipHash: this.hashIp(req),
      userAgentHash: this.hashUserAgent(req),
      expiresAt: this.addDays(
        now,
        this.configService.get<number>('userSession.refreshTtlDays') ?? 30,
      ),
      lastSeenAt: now,
    });
    await this.userSessionRepository.save(session);

    userEmail.user.principal.lastSeenAt = now;
    await this.principalRepository.save(userEmail.user.principal);

    await this.setUserSessionCookies(
      res,
      userEmail.user.principal,
      userEmail.user,
      session,
      rawRefreshToken,
    );
    this.clearCookie(res, this.anonymousCookieName, '/auth');

    return this.toSessionResponse(userEmail.user.principal, userEmail.user);
  }

  async logout(
    req: RequestWithCookies,
    res: Response,
  ): Promise<{ success: true }> {
    const refreshToken = req.cookies?.[this.refreshCookieName];
    if (refreshToken) {
      const session = await this.userSessionRepository.findOne({
        where: {
          refreshTokenHash: this.tokenHashService.hash(refreshToken),
          revokedAt: IsNull(),
        },
      });
      if (session) {
        session.revokedAt = new Date();
        await this.userSessionRepository.save(session);
      }
    }

    this.clearCookie(res, this.accessCookieName, '/');
    this.clearCookie(res, this.refreshCookieName, '/auth');
    this.clearCookie(res, this.anonymousCookieName, '/auth');

    return { success: true };
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
