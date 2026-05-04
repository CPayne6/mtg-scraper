import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousSession } from '../database/entities/anonymous-session.entity';
import { Principal } from '../database/entities/principal.entity';
import { AuthSessionService } from './auth-session.service';
import { JwtService } from './jwt.service';
import { TokenHashService } from './token-hash.service';

const PRINCIPAL_UUID = '11111111-1111-1111-1111-111111111111';
const USER_PRINCIPAL_UUID = '22222222-2222-2222-2222-222222222222';

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
  }) as any;

describe('AuthSessionService', () => {
  let principalRepository: MockRepository;
  let anonymousSessionRepository: MockRepository;
  let entityManager: Record<string, ReturnType<typeof vi.fn>>;
  let configService: ConfigService;
  let jwtService: Record<string, ReturnType<typeof vi.fn>>;
  let tokenHashService: Record<string, ReturnType<typeof vi.fn>>;
  let service: AuthSessionService;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    principalRepository = {
      findOne: vi.fn(),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    anonymousSessionRepository = {
      findOne: vi.fn(),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    entityManager = {
      transaction: vi.fn(),
    };
    configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          'cookies.accessName': 'scoutlgs_access',
          'cookies.anonymousName': 'scoutlgs_anon_session',
          'cookies.secure': true,
          'cookies.domain': 'scoutlgs.ca',
          'anonymous.sessionTtlDays': 90,
          'anonymous.creationLimitPerIpDay': 20,
          'jwt.accessTtlSeconds': 900,
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    jwtService = {
      verifyAccessToken: vi.fn(),
      signAccessToken: vi.fn().mockResolvedValue('signed-access-token'),
    };
    tokenHashService = {
      hash: vi.fn((value: string) => `hash:${value}`),
    };

    service = new AuthSessionService(
      principalRepository as any,
      anonymousSessionRepository as any,
      entityManager as unknown as EntityManager,
      configService,
      jwtService as unknown as JwtService,
      tokenHashService as unknown as TokenHashService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not create an anonymous principal during a read-only session check', async () => {
    const res = makeResponse();

    const result = await service.getSession(makeRequest(), res);

    expect(result).toEqual({ authenticated: false, principal: null });
    expect(entityManager.transaction).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('returns the user principal from a valid access token', async () => {
    jwtService.verifyAccessToken.mockResolvedValue({
      sub: USER_PRINCIPAL_UUID,
      principal_kind: 'user',
    });
    principalRepository.findOne.mockResolvedValue({
      id: 2,
      uuid: USER_PRINCIPAL_UUID,
      kind: 'user',
    });

    const result = await service.getSession(
      makeRequest({ cookies: { scoutlgs_access: 'access-token' } }),
      makeResponse(),
    );

    expect(jwtService.verifyAccessToken).toHaveBeenCalledWith('access-token');
    expect(principalRepository.findOne).toHaveBeenCalledWith({
      where: { uuid: USER_PRINCIPAL_UUID, kind: 'user' },
    });
    expect(result).toEqual({
      authenticated: true,
      principal: { uuid: USER_PRINCIPAL_UUID, kind: 'user' },
    });
  });

  it('refreshes an existing anonymous session without creating a new principal', async () => {
    const expiresAt = new Date('2026-04-01T00:00:00.000Z');
    const principal = {
      id: 1,
      uuid: PRINCIPAL_UUID,
      kind: 'anonymous',
    } as Principal;
    const session = {
      id: 10,
      principal,
      principalId: principal.id,
      tokenHash: 'hash:anonymous-token',
      expiresAt,
    } as AnonymousSession;
    anonymousSessionRepository.findOne.mockResolvedValue(session);
    const res = makeResponse();

    const result = await service.createAnonymousSession(
      makeRequest({
        cookies: { scoutlgs_anon_session: 'anonymous-token' },
        headers: {
          'x-forwarded-for': '203.0.113.10, 203.0.113.11',
          'user-agent': 'Vitest',
        },
      }),
      res,
    );

    expect(entityManager.transaction).not.toHaveBeenCalled();
    expect(anonymousSessionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ipHash: 'hash:203.0.113.10',
        userAgentHash: 'hash:Vitest',
      }),
    );
    expect(principalRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: PRINCIPAL_UUID }),
    );
    expect(jwtService.signAccessToken).toHaveBeenCalledWith({
      principalUuid: PRINCIPAL_UUID,
      principalKind: 'anonymous',
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'scoutlgs_access',
      'signed-access-token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        domain: 'scoutlgs.ca',
        path: '/',
        maxAge: 900000,
      }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'scoutlgs_anon_session',
      'anonymous-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/auth',
        expires: expiresAt,
      }),
    );
    expect(result).toEqual({
      authenticated: false,
      principal: { uuid: PRINCIPAL_UUID, kind: 'anonymous' },
    });
  });

  it('creates an anonymous principal through the explicit anonymous-session endpoint', async () => {
    const transactionContext = makeTransactionContext([{ created_count: 1 }]);
    entityManager.transaction.mockImplementation((callback) =>
      callback(transactionContext.manager),
    );
    const res = makeResponse();

    const result = await service.createAnonymousSession(
      makeRequest({
        headers: {
          'cf-connecting-ip': '203.0.113.20',
          'user-agent': 'Vitest',
        },
      }),
      res,
    );

    expect(transactionContext.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO anonymous_creation_quotas'),
      ['hash:203.0.113.20'],
    );
    expect(transactionContext.principalRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'anonymous',
        lastSeenAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    );
    expect(transactionContext.anonymousSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        principalId: 1,
        tokenHash: expect.stringMatching(/^hash:/),
        ipHash: 'hash:203.0.113.20',
        userAgentHash: 'hash:Vitest',
      }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'scoutlgs_access',
      'signed-access-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'scoutlgs_anon_session',
      expect.any(String),
      expect.objectContaining({ path: '/auth' }),
    );
    expect(result).toEqual({
      authenticated: false,
      principal: { uuid: PRINCIPAL_UUID, kind: 'anonymous' },
    });
  });

  it('blocks anonymous principal creation when the IP quota is exceeded', async () => {
    const transactionContext = makeTransactionContext([{ created_count: 21 }]);
    entityManager.transaction.mockImplementation((callback) =>
      callback(transactionContext.manager),
    );
    const res = makeResponse();

    try {
      await service.createAnonymousSession(
        makeRequest({ headers: { 'cf-connecting-ip': '203.0.113.30' } }),
        res,
      );
      throw new Error('Expected quota exception');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    expect(transactionContext.principalRepository.save).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });
});

const makeTransactionContext = (quotaRows: Array<{ created_count: number }>) => {
  const principalRepository = {
    create: vi.fn((data) => ({ id: 1, uuid: PRINCIPAL_UUID, ...data })),
    save: vi.fn((entity) => Promise.resolve(entity)),
  };
  const anonymousSessionRepository = {
    create: vi.fn((data) => ({ id: 10, ...data })),
    save: vi.fn((entity) => Promise.resolve(entity)),
  };
  const manager = {
    query: vi.fn().mockResolvedValue(quotaRows),
    getRepository: vi.fn((entity) => {
      if (entity === Principal) {
        return principalRepository;
      }
      if (entity === AnonymousSession) {
        return anonymousSessionRepository;
      }
      throw new Error('Unexpected repository');
    }),
  };

  return { manager, principalRepository, anonymousSessionRepository };
};
