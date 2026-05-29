import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { AnonymousSession } from '../database/entities/anonymous-session.entity';
import { OAuthAccount } from '../database/entities/oauth-account.entity';
import { Principal } from '../database/entities/principal.entity';
import { UserEmail } from '../database/entities/user-email.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { User } from '../database/entities/user.entity';
import { JwtService } from './jwt.service';
import { EmailNotAuthoritativeError } from './oauth-errors';
import { OAuthSignInService } from './oauth-sign-in.service';
import { TokenHashService } from './token-hash.service';

const makeResponse = () =>
  ({
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  }) as any;

const makeRequest = () =>
  ({
    cookies: {},
    header: vi.fn(),
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  }) as any;

const setup = (options: { emailAuthoritative: boolean }) => {
  const principal = {
    id: 10,
    uuid: 'principal-uuid',
    kind: 'user',
    expiresAt: null,
    lastSeenAt: null,
  };
  const userEmail = {
    id: 20,
    userId: 30,
    email: 'user@example.com',
    normalizedEmail: 'user@example.com',
  };
  const user = {
    id: 30,
    uuid: 'user-uuid',
    principal,
    principalId: principal.id,
    primaryEmailId: userEmail.id,
    displayName: null,
    disabledAt: null,
    role: 'user',
    emails: [userEmail],
  };
  const existingEmail = { ...userEmail, user };

  const repositories = {
    principal: {
      save: vi.fn(async (entity) => entity),
    },
    user: {
      save: vi.fn(async (entity) => entity),
    },
    userEmail: {
      findOne: vi.fn().mockResolvedValue(existingEmail),
      create: vi.fn((input) => input),
      save: vi.fn(async (entity) => entity),
    },
    oauthAccount: {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((input) => input),
      save: vi.fn(async (entity) => entity),
    },
    userSession: {
      create: vi.fn((input) => ({
        id: 40,
        ...input,
      })),
      save: vi.fn(async (entity) => entity),
    },
    anonymousSession: {
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn(async (entity) => entity),
    },
  };

  const manager = {
    getRepository: vi.fn((entity) => {
      if (entity === Principal) return repositories.principal;
      if (entity === User) return repositories.user;
      if (entity === UserEmail) return repositories.userEmail;
      if (entity === OAuthAccount) return repositories.oauthAccount;
      if (entity === UserSession) return repositories.userSession;
      if (entity === AnonymousSession) return repositories.anonymousSession;
      throw new Error('Unexpected repository');
    }),
  };

  const entityManager = {
    transaction: vi.fn((callback) => callback(manager)),
  } as any;

  const configService = {
    get: vi.fn((key: string) => {
      const values: Record<string, unknown> = {
        'userSession.refreshTtlDays': 30,
        'jwt.accessTtlSeconds': 900,
        'cookies.accessName': 'scoutlgs_access',
        'cookies.refreshName': 'scoutlgs_refresh',
        'cookies.anonymousName': 'scoutlgs_anon_session',
        'cookies.secure': true,
        'cookies.domain': 'scoutlgs.ca',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  const jwtService = {
    signAccessToken: vi.fn().mockResolvedValue('access-token'),
  } as unknown as JwtService;

  const tokenHashService = {
    hash: vi.fn((value: string) => `hash:${value}`),
  } as unknown as TokenHashService;

  const service = new OAuthSignInService(
    {} as any,
    {} as any,
    entityManager,
    configService,
    jwtService,
    tokenHashService,
  );

  return {
    profile: {
      sub: 'google-sub',
      email: 'user@example.com',
      emailVerified: true,
      emailAuthoritative: options.emailAuthoritative,
      name: 'User Name',
    },
    repositories,
    service,
  };
};

describe('OAuthSignInService', () => {
  it('does not auto-link an existing email when Google is not authoritative', async () => {
    const { profile, repositories, service } = setup({
      emailAuthoritative: false,
    });

    await expect(
      service.signInWithGoogle(profile, makeRequest(), makeResponse()),
    ).rejects.toThrow(EmailNotAuthoritativeError);

    expect(repositories.oauthAccount.save).not.toHaveBeenCalled();
    expect(repositories.userSession.save).not.toHaveBeenCalled();
  });

  it('auto-links an existing email when Google is authoritative for it', async () => {
    const { profile, repositories, service } = setup({
      emailAuthoritative: true,
    });
    const res = makeResponse();

    await service.signInWithGoogle(profile, makeRequest(), res);

    expect(repositories.oauthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 30,
        provider: 'google',
        providerSubject: 'google-sub',
        providerEmail: 'user@example.com',
      }),
    );
    expect(repositories.oauthAccount.save).toHaveBeenCalled();
    expect(repositories.userSession.save).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(
      'scoutlgs_access',
      'access-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });
});
