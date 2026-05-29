import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { TokenHashService } from './token-hash.service';

const configService = (secret?: string): ConfigService =>
  ({
    get: vi.fn((key: string) =>
      key === 'security.tokenHashSecret' ? secret : undefined,
    ),
  }) as unknown as ConfigService;

describe('TokenHashService', () => {
  it('hashes tokens deterministically with the configured secret', () => {
    const service = new TokenHashService(configService('test-secret'));

    const first = service.hash('opaque-token');
    const second = service.hash('opaque-token');

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).not.toBe('opaque-token');
  });

  it('uses the secret as part of the hash', () => {
    const first = new TokenHashService(configService('first-secret'));
    const second = new TokenHashService(configService('second-secret'));

    expect(first.hash('opaque-token')).not.toBe(second.hash('opaque-token'));
  });

  it('requires a token hash secret', () => {
    const service = new TokenHashService(configService());

    expect(() => service.hash('opaque-token')).toThrow(
      'AUTH_TOKEN_HASH_SECRET is required',
    );
  });
});
