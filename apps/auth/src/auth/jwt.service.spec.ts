import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from './jwt.service';

const PRINCIPAL_UUID = '11111111-1111-1111-1111-111111111111';
const USER_UUID = '22222222-2222-2222-2222-222222222222';
const SESSION_UUID = '33333333-3333-3333-3333-333333333333';

const configService = (
  overrides: Record<string, unknown> = {},
): ConfigService => {
  const values: Record<string, unknown> = {
    NODE_ENV: 'development',
    'jwt.keyId': 'test-key',
    'jwt.issuer': 'scoutlgs-auth',
    'jwt.audience': 'scoutlgs-api',
    'jwt.accessTtlSeconds': 900,
    ...overrides,
  };

  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
};

describe('JwtService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs and verifies EdDSA access tokens with principal claims', async () => {
    const service = new JwtService(configService());

    const token = await service.signAccessToken({
      principalUuid: PRINCIPAL_UUID,
      principalKind: 'user',
      userUuid: USER_UUID,
      sessionUuid: SESSION_UUID,
    });

    const claims = await service.verifyAccessToken(token);

    expect(claims.sub).toBe(PRINCIPAL_UUID);
    expect(claims.principal_kind).toBe('user');
    expect(claims.user_uuid).toBe(USER_UUID);
    expect(claims.sid).toBe(SESSION_UUID);
    expect(claims.iss).toBe('scoutlgs-auth');
    expect(claims.aud).toBe('scoutlgs-api');
  });

  it('publishes a public JWKS with the active key id', async () => {
    const service = new JwtService(configService({ 'jwt.keyId': 'primary-1' }));

    const jwks = await service.getJwks();

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({
      kid: 'primary-1',
      alg: 'EdDSA',
      use: 'sig',
      kty: 'OKP',
      crv: 'Ed25519',
    });
    expect(jwks.keys[0]).not.toHaveProperty('d');
  });

  it('can load a base64-encoded PEM private key from a secret file', async () => {
    const directory = mkdtempSync(join(process.cwd(), '.tmp-auth-jwt-'));
    const privateKeyFile = join(directory, 'jwt-private-key');

    try {
      const { privateKey } = generateKeyPairSync('ed25519');
      const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
      writeFileSync(privateKeyFile, Buffer.from(pem).toString('base64'));

      const service = new JwtService(
        configService({
          NODE_ENV: 'production',
          'jwt.privateKeyFile': privateKeyFile,
        }),
      );

      const token = await service.signAccessToken({
        principalUuid: PRINCIPAL_UUID,
        principalKind: 'anonymous',
      });
      const claims = await service.verifyAccessToken(token);

      expect(claims.sub).toBe(PRINCIPAL_UUID);
      expect(claims.principal_kind).toBe('anonymous');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('requires a private key file in production', async () => {
    const service = new JwtService(configService({ NODE_ENV: 'production' }));

    await expect(
      service.signAccessToken({
        principalUuid: PRINCIPAL_UUID,
        principalKind: 'anonymous',
      }),
    ).rejects.toThrow('AUTH_JWT_PRIVATE_KEY_FILE is required in production');
  });
});
