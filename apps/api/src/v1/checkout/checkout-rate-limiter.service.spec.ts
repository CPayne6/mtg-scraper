import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CheckoutRateLimiterService } from './checkout-rate-limiter.service';

describe('CheckoutRateLimiterService.check', () => {
  let service: CheckoutRateLimiterService;
  let redis: {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    ttl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    redis = {
      incr: vi.fn(),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn(),
    };
    service = new CheckoutRateLimiterService({} as never);
    (service as unknown as { redis: typeof redis }).redis = redis;
  });

  it('allows the first hit and sets the TTL', async () => {
    redis.incr.mockResolvedValue(1);
    const decision = await service.check('k', 5, 300);
    expect(decision).toEqual({ allowed: true, retryAfterSec: 0, remaining: 4 });
    expect(redis.expire).toHaveBeenCalledWith('k', 300);
  });

  it('does not reset the TTL on subsequent hits', async () => {
    redis.incr.mockResolvedValue(3);
    await service.check('k', 5, 300);
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('reports remaining as limit - count when within budget', async () => {
    redis.incr.mockResolvedValue(4);
    const decision = await service.check('k', 5, 300);
    expect(decision).toEqual({ allowed: true, retryAfterSec: 0, remaining: 1 });
  });

  it('blocks when count exceeds limit and surfaces retry-after from TTL', async () => {
    redis.incr.mockResolvedValue(6);
    redis.ttl.mockResolvedValue(120);
    const decision = await service.check('k', 5, 300);
    expect(decision).toEqual({ allowed: false, retryAfterSec: 120, remaining: 0 });
  });

  it('falls back to window length when TTL lookup returns -1', async () => {
    redis.incr.mockResolvedValue(10);
    redis.ttl.mockResolvedValue(-1);
    const decision = await service.check('k', 5, 300);
    expect(decision).toEqual({ allowed: false, retryAfterSec: 300, remaining: 0 });
  });
});
