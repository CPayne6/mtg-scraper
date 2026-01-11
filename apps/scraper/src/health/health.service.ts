import { Injectable, Logger } from '@nestjs/common';
import { StoreService, CacheService } from '@scoutlgs/core';

export interface HealthStatus {
  status: 'ok' | 'error';
  info: Record<string, { status: string; message?: string; [key: string]: unknown }>;
  error: Record<string, { status: string; message?: string }>;
  details: Record<string, { status: string; message?: string; [key: string]: unknown }>;
}

interface CachedHealth {
  result: HealthStatus;
  timestamp: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private cache: CachedHealth | null = null;

  // Cache health check results for 1 hour to reduce DB/Redis load
  private readonly CACHE_TTL_MS = 60 * 60 * 1000;

  constructor(
    private storeService: StoreService,
    private cacheService: CacheService,
  ) {}

  async check(): Promise<HealthStatus> {
    // Return cached result if available
    const cached = this.getCached();
    if (cached) {
      this.logger.debug('Returning cached health check result');
      return cached;
    }

    // Perform health checks
    const [dbHealth, redisHealth] = await Promise.all([
      this.storeService.checkHealth(),
      this.cacheService.checkHealth(),
    ]);

    const info: HealthStatus['info'] = {};
    const error: HealthStatus['error'] = {};

    // Process database health
    if (dbHealth.status === 'up') {
      info.database = {
        status: 'up',
        storeCount: dbHealth.storeCount,
      };
    } else {
      error.database = {
        status: 'down',
        message: dbHealth.message,
      };
    }

    // Process Redis health
    if (redisHealth.status === 'up') {
      info.redis = { status: 'up' };
    } else {
      error.redis = {
        status: 'down',
        message: redisHealth.message,
      };
    }

    // Process stores ready status
    if (this.storeService.ready()) {
      info.stores = { status: 'up', message: 'Stores loaded and ready' };
    } else {
      error.stores = {
        status: 'down',
        message: 'Stores not yet loaded from database',
      };
    }

    const result: HealthStatus = {
      status: Object.keys(error).length === 0 ? 'ok' : 'error',
      info,
      error,
      details: { ...info, ...error },
    };

    // Cache successful results (or cache failures to avoid hammering unhealthy services)
    this.setCache(result);

    return result;
  }

  private getCached(): HealthStatus | null {
    if (!this.cache) {
      return null;
    }

    // Check if cache has expired
    if (Date.now() - this.cache.timestamp > this.CACHE_TTL_MS) {
      this.cache = null;
      return null;
    }

    return this.cache.result;
  }

  private setCache(result: HealthStatus): void {
    this.cache = {
      result,
      timestamp: Date.now(),
    };
  }
}
