import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousSession } from '../database/entities/anonymous-session.entity';
import { PasswordCredential } from '../database/entities/password-credential.entity';
import { Principal } from '../database/entities/principal.entity';
import { UserEmail } from '../database/entities/user-email.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { User } from '../database/entities/user.entity';
import { JwtService } from './jwt.service';
import { PasswordHashService } from './password-hash.service';
import { TokenHashService } from './token-hash.service';
import { UserAuthService } from './user-auth.service';

const PRINCIPAL_UUID = '11111111-1111-1111-1111-111111111111';
const USER_UUID = '22222222-2222-2222-2222-222222222222';
const SESSION_UUID = '33333333-3333-3333-3333-333333333333';

type MockRepository = Record<string, ReturnType<typeof vi.fn>>;

const makeRequest = (
  options: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    ip?: string;
  } = {},
) =>
  ({
    cookies: options.cookies ?? {},
    ip: options.ip ?? '198.51.100.25',
    socket: { remoteAddress: '198.51.100.26' },
    header: vi.fn((name: string) => options.headers?.[name.toLowerCase()]),
  }) as any;

const makeResponse = () =>
  ({
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  }) as any;

describe('UserAuthService', () => {
  let principalRepository: MockRepository;
  let userRepository: MockRepository;
  let userEmailRepository: MockRepository;
  let passwordCredentialRepository: MockRepository;
  let userSessionRepository: MockRepository;
  let entityManager: Record<string, ReturnType<typeof vi.fn>>;
  let configService: ConfigService;
  let jwtService: Record<string, ReturnType<typeof vi.fn>>;
  let tokenHashService: Record<string, ReturnType<typeof vi.fn>>;
  let passwordHashService: Record<string, ReturnType<typeof vi.fn>>;
  let service: UserAuthService;

  beforeEach(() => {
    principalRepository = {
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    userRepository = {
      create: vi.fn((data) => ({ id: 2, uuid: USER_UUID, ...data })),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    userEmailRepository = {
      create: vi.fn((data) => ({ id: 7, ...data })),
      findOne: vi.fn(),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    passwordCredentialRepository = {
      create: vi.fn((data) => ({ id: 8, ...data })),
      findOne: vi.fn(),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    userSessionRepository = {
      create: vi.fn((data) => ({ id: 9, sessionUuid: SESSION_UUID, ...data })),
      findOne: vi.fn(),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    entityManager = {
      transaction: vi.fn((callback) => callback(makeTransactionManager())),
    };
    configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          'cookies.accessName': 'scoutlgs_access',
          'cookies.refreshName': 'scoutlgs_refresh',
          'cookies.anonymousName': 'scoutlgs_anon_session',
          'cookies.secure': true,
          'cookies.domain': 'scoutlgs.ca',
          'jwt.accessTtlSeconds': 900,
          'userSession.refreshTtlDays': 30,
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    jwtService = {
      signAccessToken: vi.fn().mockResolvedValue('signed-access-token'),
    };
    tokenHashService = {
      hash: vi.fn((value: string) => `hash:${value}`),
    };
    passwordHashService = {
      hash: vi.fn().mockResolvedValue('bcrypt-hash'),
      verify: vi.fn().mockResolvedValue(true),
    };

    service = new UserAuthService(
      principalRepository as any,
      userRepository as any,
      userEmailRepository as any,
      passwordCredentialRepository as any,
      userSessionRepository as any,
      entityManager as unknown as EntityManager,
      configService,
      jwtService as unknown as JwtService,
      tokenHashService as unknown as TokenHashService,
      passwordHashService as unknown as PasswordHashService,
    );
  });

  it('upgrades an anonymous principal in place during signup and defaults role to user', async () => {
    const res = makeResponse();

    const result = await service.signup(
      {
        email: ' New.User@Example.Test ',
        password: 'CorrectHorseBatteryStaple!23',
        displayName: ' New User ',
      },
      makeRequest({
        cookies: { scoutlgs_anon_session: 'anonymous-token' },
        headers: { 'user-agent': 'Vitest' },
      }),
      res,
    );

    expect(passwordHashService.hash).toHaveBeenCalledWith(
      'CorrectHorseBatteryStaple!23',
    );
    expect(jwtService.signAccessToken).toHaveBeenCalledWith({
      principalUuid: PRINCIPAL_UUID,
      principalKind: 'user',
      userUuid: USER_UUID,
      sessionUuid: expect.any(String),
      role: 'user',
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'scoutlgs_access',
      'signed-access-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'scoutlgs_refresh',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: '/auth' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'scoutlgs_anon_session',
      expect.objectContaining({ path: '/auth' }),
    );
    expect(result).toEqual({
      authenticated: true,
      principal: { uuid: PRINCIPAL_UUID, kind: 'user' },
      user: {
        uuid: USER_UUID,
        displayName: 'New User',
        email: 'New.User@Example.Test',
        role: 'user',
      },
    });
  });

  it('rejects signup when the email is already registered', async () => {
    userEmailRepository.findOne.mockResolvedValue({ id: 1 });

    await expect(
      service.signup(
        {
          email: 'existing@example.test',
          password: 'CorrectHorseBatteryStaple!23',
        },
        makeRequest(),
        makeResponse(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a user session during password login and respects the stored role', async () => {
    const principal = {
      id: 1,
      uuid: PRINCIPAL_UUID,
      kind: 'user',
    };
    const user = {
      id: 2,
      uuid: USER_UUID,
      displayName: 'Login User',
      disabledAt: null,
      role: 'admin',
      primaryEmailId: 7,
      principal,
      emails: [{ id: 7, email: 'login@example.test' }],
    };
    userEmailRepository.findOne.mockResolvedValue({
      id: 7,
      userId: user.id,
      user,
    });
    passwordCredentialRepository.findOne.mockResolvedValue({
      userId: user.id,
      passwordHash: 'bcrypt-hash',
    });
    const res = makeResponse();

    const result = await service.login(
      { email: 'login@example.test', password: 'CorrectHorseBatteryStaple!23' },
      makeRequest(),
      res,
    );

    expect(passwordHashService.verify).toHaveBeenCalledWith(
      'bcrypt-hash',
      'CorrectHorseBatteryStaple!23',
    );
    expect(userSessionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        refreshTokenHash: expect.stringMatching(/^hash:/),
      }),
    );
    expect(jwtService.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
    );
    expect(result).toEqual({
      authenticated: true,
      principal: { uuid: PRINCIPAL_UUID, kind: 'user' },
      user: {
        uuid: USER_UUID,
        displayName: 'Login User',
        email: 'login@example.test',
        role: 'admin',
      },
    });
  });

  it('uses a generic login error for bad credentials', async () => {
    userEmailRepository.findOne.mockResolvedValue(null);

    await expect(
      service.login(
        { email: 'missing@example.test', password: 'wrong' },
        makeRequest(),
        makeResponse(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the refresh session and clears cookies on logout', async () => {
    const session = { id: 9, revokedAt: null };
    userSessionRepository.findOne.mockResolvedValue(session);
    const res = makeResponse();

    await service.logout(
      makeRequest({ cookies: { scoutlgs_refresh: 'refresh-token' } }),
      res,
    );

    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(userSessionRepository.save).toHaveBeenCalledWith(session);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'scoutlgs_access',
      expect.objectContaining({ path: '/' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'scoutlgs_refresh',
      expect.objectContaining({ path: '/auth' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'scoutlgs_anon_session',
      expect.objectContaining({ path: '/auth' }),
    );
  });
});

const makeTransactionManager = () => {
  const anonymousPrincipal = {
    id: 1,
    uuid: PRINCIPAL_UUID,
    kind: 'anonymous',
    expiresAt: new Date('2026-06-01T00:00:00.000Z'),
  };
  const anonymousSessionRepository = {
    findOne: vi.fn().mockResolvedValue({
      id: 3,
      principal: anonymousPrincipal,
      revokedAt: null,
    }),
    save: vi.fn((entity) => Promise.resolve(entity)),
  };
  const principalRepository = {
    create: vi.fn((data) => ({ id: 1, uuid: PRINCIPAL_UUID, ...data })),
    save: vi.fn((entity) => Promise.resolve(entity)),
  };
  const userRepository = {
    create: vi.fn((data) => ({
      id: 2,
      uuid: USER_UUID,
      role: 'user',
      ...data,
    })),
    save: vi.fn((entity) => Promise.resolve(entity)),
  };
  const userEmailRepository = {
    create: vi.fn((data) => ({ id: 7, ...data })),
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn((entity) => Promise.resolve(entity)),
  };
  const passwordCredentialRepository = {
    create: vi.fn((data) => ({ id: 8, ...data })),
    save: vi.fn((entity) => Promise.resolve(entity)),
  };
  const userSessionRepository = {
    create: vi.fn((data) => ({ id: 9, sessionUuid: SESSION_UUID, ...data })),
    save: vi.fn((entity) => Promise.resolve(entity)),
  };

  return {
    getRepository: vi.fn((entity) => {
      if (entity === AnonymousSession) return anonymousSessionRepository;
      if (entity === Principal) return principalRepository;
      if (entity === User) return userRepository;
      if (entity === UserEmail) return userEmailRepository;
      if (entity === PasswordCredential) return passwordCredentialRepository;
      if (entity === UserSession) return userSessionRepository;
      throw new Error('Unexpected repository');
    }),
  };
};
