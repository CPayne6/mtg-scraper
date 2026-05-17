import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

@Injectable()
export class RateLimiterService {
  private static readonly MAX_HOPS = 10;

  private readonly logger = new Logger(RateLimiterService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Rate limiter Redis error: ${err}`);
    });

    this.redis.connect().catch((err) => {
      this.logger.error(`Rate limiter Redis connect error: ${err}`);
    });
  }

  /**
   * Try to acquire a permit for a request to a store from a specific proxy IP.
   * Uses a sliding window counter per second.
   */
  async acquirePermit(
    storeName: string,
    proxyNumber: number,
    maxPerSecond: number,
  ): Promise<RateLimitResult> {
    try {
      const epochSecond = Math.floor(Date.now() / 1000);
      const key = `rl:${storeName}:${proxyNumber}:${epochSecond}`;

      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, 2);
      }

      if (count <= maxPerSecond) {
        return { allowed: true };
      }

      // Over limit — return time until next second window
      const retryAfterMs = 1000 - (Date.now() % 1000);
      return { allowed: false, retryAfterMs };
    } catch (error) {
      // Fail open — allow the request if Redis is down
      this.logger.warn(`Rate limiter error (failing open): ${error}`);
      return { allowed: true };
    }
  }

  /**
   * Acquire a rate limit permit, rotating to the next proxy IP on rejection.
   * Calls getNextProxyNumber on each attempt to get a fresh IP from the per-store round-robin.
   * Always returns a proxy number (fail-open on exhaustion).
   */
  async acquireWithRotation(
    storeName: string,
    maxPerSecond: number,
    getNextProxyNumber: () => Promise<number>,
    maxHops: number = RateLimiterService.MAX_HOPS,
  ): Promise<{ proxyNumber: number }> {
    for (let hop = 0; hop < maxHops; hop++) {
      const proxyNumber = await getNextProxyNumber();
      const result = await this.acquirePermit(storeName, proxyNumber, maxPerSecond);

      if (result.allowed) {
        return { proxyNumber };
      }
    }

    // Fail open — exhausting all hops means extreme contention, let it through
    const proxyNumber = await getNextProxyNumber();
    this.logger.warn(
      `Rate limit: ${storeName} exhausted ${maxHops} IP hops, proceeding on proxy ${proxyNumber}`,
    );
    return { proxyNumber };
  }
}
