import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CheckoutAuditService } from './checkout-audit.service';

describe('CheckoutAuditService.record', () => {
  let service: CheckoutAuditService;
  let pipeline: {
    lpush: ReturnType<typeof vi.fn>;
    ltrim: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  };
  let redis: { pipeline: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    pipeline = {
      lpush: vi.fn().mockReturnThis(),
      ltrim: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    };
    redis = {
      pipeline: vi.fn(() => pipeline),
    };
    service = new CheckoutAuditService({} as never);
    (service as unknown as { redis: typeof redis }).redis = redis;
  });

  it('writes short-lived audit entries keyed by IP and principal', async () => {
    await service.record({
      principalUuid: '11111111-1111-1111-1111-111111111111',
      principalKind: 'anonymous',
      ipHash: 'iph',
      uaHash: 'uah',
      storeCount: 1,
      totalLines: 2,
      totalSucceededStores: 1,
      totalFailedStores: 0,
      requestDurationMs: 12,
    });

    expect(redis.pipeline).toHaveBeenCalled();
    expect(pipeline.lpush).toHaveBeenCalledTimes(2);
    expect(pipeline.lpush.mock.calls[0][0]).toBe('checkout:audit:ip:iph');
    expect(pipeline.lpush.mock.calls[1][0]).toBe(
      'checkout:audit:principal:11111111-1111-1111-1111-111111111111',
    );

    const entry = JSON.parse(pipeline.lpush.mock.calls[0][1] as string);
    expect(entry).toEqual(
      expect.objectContaining({
        principalUuid: '11111111-1111-1111-1111-111111111111',
        principalKind: 'anonymous',
        ipHash: 'iph',
        uaHash: 'uah',
        storeCount: 1,
        totalLines: 2,
        totalSucceededStores: 1,
        totalFailedStores: 0,
        requestDurationMs: 12,
      }),
    );
    expect(typeof entry.requestedAt).toBe('string');
    expect(pipeline.ltrim).toHaveBeenCalledWith(expect.any(String), 0, 99);
    expect(pipeline.expire).toHaveBeenCalledWith(expect.any(String), 86400);
    expect(pipeline.exec).toHaveBeenCalled();
  });
});
