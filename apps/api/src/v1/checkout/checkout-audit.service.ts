import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface CheckoutAuditEntry {
  principalUuid: string;
  principalKind: 'anonymous' | 'user';
  ipHash: string;
  uaHash?: string;
  requestedAt: string;
  storeCount: number;
  totalLines: number;
  totalSucceededStores: number;
  totalFailedStores: number;
  requestDurationMs: number;
  errorClass?: string;
}

export type CheckoutAuditInput = Omit<CheckoutAuditEntry, 'requestedAt'>;

const AUDIT_TTL_SEC = 24 * 60 * 60;
const MAX_EVENTS_PER_KEY = 100;

@Injectable()
export class CheckoutAuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutAuditService.name);
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
      this.logger.error(`Redis error in checkout audit cache: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }
  }

  async record(input: CheckoutAuditInput): Promise<void> {
    const entry: CheckoutAuditEntry = {
      ...input,
      requestedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(entry);
    const keys = [
      `checkout:audit:ip:${input.ipHash}`,
      `checkout:audit:principal:${input.principalUuid}`,
    ];

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.lpush(key, serialized);
      pipeline.ltrim(key, 0, MAX_EVENTS_PER_KEY - 1);
      pipeline.expire(key, AUDIT_TTL_SEC);
    }
    await pipeline.exec();
  }
}
