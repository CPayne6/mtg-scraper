import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { extractClientIp } from './client-ip.util';

function request(overrides: Partial<Request> = {}): Request {
  return {
    header: () => undefined,
    ip: '198.51.100.25',
    socket: { remoteAddress: '198.51.100.26' },
    ...overrides,
  } as Request;
}

describe('extractClientIp', () => {
  it('uses Express resolved req.ip', () => {
    expect(extractClientIp(request({ ip: '203.0.113.10' }))).toBe(
      '203.0.113.10',
    );
  });

  it('ignores raw forwarding headers', () => {
    expect(
      extractClientIp(
        request({
          header: (name: string) =>
            name.toLowerCase() === 'cf-connecting-ip' ? '1.2.3.4' : undefined,
        } as Partial<Request>),
      ),
    ).toBe('198.51.100.25');
  });

  it('falls back to the socket address', () => {
    expect(extractClientIp(request({ ip: undefined }))).toBe('198.51.100.26');
  });
});
