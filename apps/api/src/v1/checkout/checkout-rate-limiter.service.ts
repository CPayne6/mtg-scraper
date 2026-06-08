import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

// Fixed-window counter via Redis INCR + EXPIRE-on-first-hit. The
// non-atomicity gap (between INCR and EXPIRE) can leak a key without a TTL if
// the process crashes between calls -- acceptable: at worst a handful of keys
// linger, and the next request on the same key restarts the window. Sliding-
// window precision isn't worth a Lua script for an abuse-control limiter.
@Injectable()
export class CheckoutRateLimiterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutRateLimiterService.name);
  private redis!: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      lazyConnect: false,
      maxRetriesPerRequest: 2,
    });
    this.redis.on('error', (err) => {
      this.logger.error(`Redis error in rate limiter: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }
  }

  async check(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitDecision> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      // First hit in this window -- set the TTL. If two callers race the
      // INCR, only one sees count===1, so EXPIRE runs at most once per window.
      await this.redis.expire(key, windowSeconds);
    }

    if (count > limit) {
      const ttl = await this.redis.ttl(key);
      return {
        allowed: false,
        retryAfterSec: ttl > 0 ? ttl : windowSeconds,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, limit - count),
    };
  }
}
