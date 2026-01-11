import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from '../database/store.entity';

@Injectable()
export class StoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StoreService.name);
  private cachedStores: Store[] = [];
  private cacheTimestamp: number = 0;
  private readonly cacheTTL = 3600000; // 1 hour in milliseconds
  private refreshInterval: NodeJS.Timeout | null = null;
  private isReady = false;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  async onModuleInit() {
    // Pre-load stores on module initialization with retry logic
    await this.loadStoresWithRetry();

    // Set up automatic cache refresh before expiration (refresh at 50 minutes)
    const refreshIntervalMs = this.cacheTTL * 0.833; // 50 minutes
    this.refreshInterval = setInterval(async () => {
      this.logger.debug('Auto-refreshing store cache');
      await this.refreshCache();
    }, refreshIntervalMs);
  }

  private async loadStoresWithRetry(): Promise<void> {
    const maxRetries = 3;
    const retryDelayMs = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.refreshCache();

        if (this.cachedStores.length === 0) {
          if (attempt < maxRetries) {
            this.logger.warn(
              `Attempt ${attempt}/${maxRetries}: No stores found in database, retrying in ${retryDelayMs}ms...`
            );
            await this.delay(retryDelayMs);
            continue;
          }
          throw new Error('No stores found in database after all retry attempts');
        }

        this.logger.log(`Pre-loaded ${this.cachedStores.length} stores into cache`);
        this.isReady = true;
        this.resolveReady();
        return;
      } catch (error) {
        if (attempt < maxRetries) {
          this.logger.warn(
            `Attempt ${attempt}/${maxRetries}: Failed to load stores from database, retrying in ${retryDelayMs}ms...`
          );
          await this.delay(retryDelayMs);
        } else {
          this.logger.error('Failed to load stores from database after all retry attempts:', error);
          throw error;
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait until stores have been successfully loaded from the database.
   * Use this to ensure the service is ready before processing requests.
   */
  async waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Check if stores have been successfully loaded.
   */
  ready(): boolean {
    return this.isReady;
  }

  onModuleDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async refreshCache(): Promise<void> {
    try {
      this.cachedStores = await this.storeRepository.find({
        where: { isActive: true },
        order: { displayName: 'ASC' },
      });
      this.cacheTimestamp = Date.now();
      this.logger.debug(`Store cache refreshed with ${this.cachedStores.length} stores`);
    } catch (error) {
      this.logger.error('Failed to refresh store cache:', error);
      throw error;
    }
  }

  private isCacheValid(): boolean {
    return this.cachedStores.length > 0 &&
           Date.now() - this.cacheTimestamp < this.cacheTTL;
  }

  async findAllActive(): Promise<Store[]> {
    if (this.isCacheValid()) {
      this.logger.debug('Serving stores from cache');
      return this.cachedStores;
    }

    this.logger.debug('Cache miss or expired, fetching from database');
    await this.refreshCache();
    return this.cachedStores;
  }

  async findAll(): Promise<Store[]> {
    // This method bypasses cache for admin purposes
    return this.storeRepository.find({
      order: { displayName: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Store | null> {
    // Check cache first
    if (this.isCacheValid()) {
      const store = this.cachedStores.find(s => s.id === id);
      if (store) {
        return store;
      }
    }

    // Fallback to database
    return this.storeRepository.findOneBy({ id });
  }

  async findByName(name: string): Promise<Store | null> {
    // Check cache first
    if (this.isCacheValid()) {
      const store = this.cachedStores.find(s => s.name === name);
      if (store) {
        return store;
      }
    }

    // Fallback to database
    return this.storeRepository.findOneBy({ name });
  }

  // Force cache refresh - useful for when stores are updated
  async invalidateCache(): Promise<void> {
    this.logger.log('Invalidating store cache');
    await this.refreshCache();
  }

  /**
   * Check database health by verifying stores exist
   * Returns status object for use in health checks
   */
  async checkHealth(): Promise<{ status: 'up' | 'down'; message?: string; storeCount?: number }> {
    try {
      // Try to count stores from database (bypasses cache)
      const count = await this.storeRepository.count();

      if (count === 0) {
        return {
          status: 'down',
          message: 'No stores found in database',
          storeCount: 0,
        };
      }

      return {
        status: 'up',
        storeCount: count,
      };
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Database connection failed',
      };
    }
  }
}
