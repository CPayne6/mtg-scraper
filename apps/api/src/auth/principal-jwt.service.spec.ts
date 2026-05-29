import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrincipalJwtService } from './principal-jwt.service';

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
    jwtVerify: vi.fn(),
  };
});

const configService = {
  get: vi.fn((key: string) => {
    const values: Record<string, string> = {
      'auth.jwksUrl': 'http://auth:5002/auth/internal/.well-known/jwks.json',
      'auth.issuer': 'scoutlgs-auth',
      'auth.audience': 'scoutlgs-api',
      'auth.accessCookieName': 'scoutlgs_access',
    };
    return values[key];
  }),
} as unknown as ConfigService;

const makeRequest = (
  cookies: Record<string, string | undefined> = {},
  authorization?: string,
) =>
  ({
    cookies,
    header: vi.fn((name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
    ),
  }) as any;

describe('PrincipalJwtService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies the access JWT from the configured cookie only', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: {
        sub: '11111111-1111-1111-1111-111111111111',
        principal_kind: 'anonymous',
      },
      protectedHeader: { alg: 'EdDSA' },
    } as any);
    const service = new PrincipalJwtService(configService);

    const principal = await service.verifyRequest(
      makeRequest({ scoutlgs_access: 'cookie-jwt' }),
    );

    expect(jwtVerify).toHaveBeenCalledWith(
      'cookie-jwt',
      'mock-jwks',
      expect.objectContaining({
        issuer: 'scoutlgs-auth',
        audience: 'scoutlgs-api',
        algorithms: ['EdDSA'],
      }),
    );
    expect(principal).toEqual({
      principalUuid: '11111111-1111-1111-1111-111111111111',
      kind: 'anonymous',
      userUuid: undefined,
      sessionUuid: undefined,
    });
  });

  it('does not accept Authorization bearer tokens', async () => {
    const service = new PrincipalJwtService(configService);

    await expect(
      service.verifyRequest(makeRequest({}, 'Bearer bearer-jwt')),
    ).rejects.toThrow(UnauthorizedException);

    expect(jwtVerify).not.toHaveBeenCalled();
  });
});
