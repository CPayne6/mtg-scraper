import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, StoreCardCacheEntry, CardWithStore } from '@scoutlgs/shared';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export type { CardWithStore };

/**
 * Pending pattern subscription for waiting on multiple store-card combinations.
 * Uses PSUBSCRIBE for pattern matching.
 */
interface PendingPatternSubscription {
  pattern: string;
  cardName: string;
  pendingStores: Set<string>;
  results: Map<string, StoreCardCacheEntry | null>;
  callbacks: Set<(results: Map<string, StoreCardCacheEntry | null>) => void>;
}

export interface SchedulerJobStatus {
  initiatedAt: number;
  finishedAt?: number;
  status: 'running' | 'completed' | 'failed';
  details: {
    currentScrapeCount: number;
    totalScrapeCount: number;
  }
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly STORE_CACHE_KEY_PREFIX = 'card:';
  private readonly STORE_KEY_SEPARATOR = ':store:';
  private readonly SCRAPING_KEY_PREFIX = 'scraping:';
  private readonly SCHEDULER_KEY = 'scheduler:job-status';
  private readonly SCRAPING_TTL = 300; // 5 minutes in seconds
  private readonly CACHE_TTL = 86400; // 24 hours in seconds
  private cardSubscriber: Redis;

  // Map of pattern -> pending pattern subscription info (for PSUBSCRIBE)
  private pendingPatternSubscriptions = new Map<string, PendingPatternSubscription>();

  constructor(
    @InjectQueue(QUEUE_NAMES.CARD_SCRAPE) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing card subscriber...');

    // Create Redis subscriber instance
    this.cardSubscriber = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Reconnecting card subscriber (attempt ${times}), delay: ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: null,
    });

    // Set up error handlers
    this.cardSubscriber.on('error', (err) => {
      this.logger.error('Card subscriber error:', err);
    });

    this.cardSubscriber.on('close', () => {
      this.logger.warn('Card subscriber connection closed');
    });

    this.cardSubscriber.on('reconnecting', (delay) => {
      this.logger.log(`Card subscriber reconnecting in ${delay}ms...`);
    });

    this.cardSubscriber.on('end', () => {
      this.logger.error('Card subscriber connection ended - failing all pending requests');
      this.failAllPendingRequests('Redis connection ended');
    });

    // Handle successful reconnection
    this.cardSubscriber.on('ready', async () => {
      this.logger.log('Card subscriber ready');

      // Resubscribe to all active patterns after reconnection
      const patterns = Array.from(this.pendingPatternSubscriptions.keys());
      if (patterns.length > 0) {
        try {
          await this.cardSubscriber.psubscribe(...patterns);
          this.logger.log(`Resubscribed to ${patterns.length} active pattern(s) after reconnection`);
        } catch (err) {
          this.logger.error('Failed to resubscribe to patterns:', err);
          this.failAllPendingRequests('Failed to resubscribe after reconnection');
        }
      }
    });

    // Handle pattern notification for store-card subscriptions (PSUBSCRIBE)
    this.cardSubscriber.on('pmessage', async (pattern: string, channel: string, operation: string) => {
      this.logger.debug(`Received keyspace notification on pattern ${pattern}, channel ${channel}: ${operation}`);

      const pending = this.pendingPatternSubscriptions.get(pattern);
      if (!pending) return;

      if (operation === 'set' || operation === 'setex') {
        // Extract store name from channel: __keyspace@0__:card:{cardname}:store:{storename}
        const storeMatch = channel.match(/:store:([^:]+)$/);
        if (!storeMatch) return;

        const storeName = storeMatch[1];

        if (pending.pendingStores.has(storeName)) {
          // Fetch the result for this store
          const result = await this.getStoreCard(pending.cardName, storeName);
          pending.results.set(storeName, result);
          pending.pendingStores.delete(storeName);

          this.logger.debug(`Store ${storeName} completed for ${pending.cardName}. ${pending.pendingStores.size} stores remaining.`);

          // Check if all stores have completed
          if (pending.pendingStores.size === 0) {
            this.logger.debug(`All stores completed for ${pending.cardName}. Notifying ${pending.callbacks.size} callback(s).`);
            pending.callbacks.forEach(cb => cb(pending.results));
            await this.cleanupPatternSubscription(pattern);
          }
        }
      }
    });

    // Wait for subscriber to be ready
    if (this.cardSubscriber.status !== 'ready') {
      await new Promise<void>((resolve) => {
        this.cardSubscriber.once('ready', () => resolve());
      });
    }

    this.logger.log('Card subscriber initialized successfully');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down cache service...');

    // Fail all pending requests before shutdown
    this.failAllPendingRequests('Service shutting down');

    // Disconnect subscriber
    if (this.cardSubscriber) {
      await this.cardSubscriber.quit();
    }

    this.logger.log('Cache service shutdown complete');
  }

  // =====================================
  // Per-Store-Card Cache Methods
  // =====================================

  /**
   * Build the cache key for a store-card combination.
   * Format: card:{cardname}:store:{storename}
   */
  private buildStoreCardKey(cardName: string, storeName: string): string {
    return `${this.STORE_CACHE_KEY_PREFIX}${cardName.toLowerCase()}${this.STORE_KEY_SEPARATOR}${storeName.toLowerCase()}`;
  }

  /**
   * Build the scraping lock key for a store-card combination.
   * Format: scraping:{cardname}:store:{storename}
   */
  private buildScrapingKey(cardName: string, storeName: string): string {
    return `${this.SCRAPING_KEY_PREFIX}${cardName.toLowerCase()}${this.STORE_KEY_SEPARATOR}${storeName.toLowerCase()}`;
  }

  /**
   * Set cached results for a single store-card combination.
   * @param cardName The card name
   * @param storeName The store name slug (e.g., 'f2f', '401')
   * @param results The card results from this store
   * @param error Optional error message if scraping failed
   * @param retryCount Optional retry count
   * @param timestamp Optional timestamp (defaults to now)
   */
  async setStoreCard(
    cardName: string,
    storeName: string,
    results: CardWithStore[],
    error?: string,
    retryCount?: number,
    timestamp?: number,
  ): Promise<void> {
    try {
      const cacheKey = this.buildStoreCardKey(cardName, storeName);
      const redis = await this.queue.client;

      const entry: StoreCardCacheEntry = {
        storeName,
        results,
        timestamp: timestamp ?? Date.now(),
        error,
        retryCount,
      };

      // Cache for 24 hours
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(entry));
      this.logger.debug(`Cached ${results.length} results for ${cardName} at store ${storeName}${error ? ` (error: ${error})` : ''}`);
    } catch (error) {
      this.logger.error(`Error caching results for ${cardName} at store ${storeName}:`, error);
      throw error;
    }
  }

  /**
   * Get cached results for a single store-card combination.
   * @param cardName The card name
   * @param storeName The store name slug (e.g., 'f2f', '401')
   * @returns The cached entry or null if not found
   */
  async getStoreCard(cardName: string, storeName: string): Promise<StoreCardCacheEntry | null> {
    try {
      const cacheKey = this.buildStoreCardKey(cardName, storeName);
      const redis = await this.queue.client;
      const cached = await redis.get(cacheKey);

      if (!cached) {
        this.logger.debug(`Cache miss for ${cardName} at store ${storeName}`);
        return null;
      }

      const entry: StoreCardCacheEntry = JSON.parse(cached);
      this.logger.debug(`Cache hit for ${cardName} at store ${storeName}`);
      return entry;
    } catch (error) {
      this.logger.error(`Error reading from cache for ${cardName} at store ${storeName}:`, error);
      return null;
    }
  }

  /**
   * Get cached results for multiple stores in a single batch operation.
   * Uses Redis MGET for efficiency.
   * @param cardName The card name
   * @param storeNames Array of store name slugs
   * @returns Map of storeName -> cached entry (or null if not cached)
   */
  async getMultipleStoreCards(
    cardName: string,
    storeNames: string[],
  ): Promise<Map<string, StoreCardCacheEntry | null>> {
    const results = new Map<string, StoreCardCacheEntry | null>();

    if (storeNames.length === 0) {
      return results;
    }

    try {
      const redis = await this.queue.client;
      const keys = storeNames.map(storeName => this.buildStoreCardKey(cardName, storeName));

      const cached = await redis.mget(...keys);

      for (let i = 0; i < storeNames.length; i++) {
        const storeName = storeNames[i];
        const value = cached[i];

        if (value) {
          try {
            results.set(storeName, JSON.parse(value));
          } catch {
            results.set(storeName, null);
          }
        } else {
          results.set(storeName, null);
        }
      }

      const hits = Array.from(results.values()).filter(v => v !== null).length;
      this.logger.debug(`Batch cache check for ${cardName}: ${hits}/${storeNames.length} hits`);

      return results;
    } catch (error) {
      this.logger.error(`Error batch reading from cache for ${cardName}:`, error);
      // Return empty map on error
      for (const storeName of storeNames) {
        results.set(storeName, null);
      }
      return results;
    }
  }

  /**
   * Check if a specific store-card combination is currently being scraped.
   */
  async isStoreBeingScraped(cardName: string, storeName: string): Promise<boolean> {
    try {
      const scrapingKey = this.buildScrapingKey(cardName, storeName);
      const redis = await this.queue.client;
      const exists = await redis.exists(scrapingKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Error checking scraping status for ${cardName} at ${storeName}:`, error);
      return false;
    }
  }

  /**
   * Mark a specific store-card combination as being scraped.
   * Uses SET NX to prevent race conditions.
   * @returns true if successfully marked, false if already being scraped
   */
  async markStoreAsBeingScraped(cardName: string, storeName: string, requestId: string): Promise<boolean> {
    try {
      const scrapingKey = this.buildScrapingKey(cardName, storeName);
      const redis = await this.queue.client;

      // Use SET NX (set if not exists) to prevent race conditions
      const result = await redis.set(scrapingKey, requestId, 'EX', this.SCRAPING_TTL, 'NX');

      return result === 'OK';
    } catch (error) {
      this.logger.error(`Error marking ${cardName} at ${storeName} as being scraped:`, error);
      return false;
    }
  }

  /**
   * Mark a specific store-card scrape as complete by removing the lock.
   */
  async markStoreScrapeComplete(cardName: string, storeName: string): Promise<void> {
    try {
      const scrapingKey = this.buildScrapingKey(cardName, storeName);
      const redis = await this.queue.client;

      await redis.del(scrapingKey);
      this.logger.debug(`Marked scrape complete for ${cardName} at store ${storeName}`);
    } catch (error) {
      this.logger.error(`Error marking scrape complete for ${cardName} at ${storeName}:`, error);
      throw error;
    }
  }

  /**
   * Wait for multiple store-card combinations to complete scraping.
   * Uses PSUBSCRIBE for pattern matching on Redis keyspace notifications.
   * @param cardName The card name
   * @param storeNames Array of store names to wait for
   * @param timeoutMs Timeout in milliseconds (default 60 seconds)
   * @returns Map of storeName -> cached entry when all complete
   */
  async waitForStoresScrapeCompletion(
    cardName: string,
    storeNames: string[],
    timeoutMs: number = 60000,
  ): Promise<Map<string, StoreCardCacheEntry | null>> {
    if (storeNames.length === 0) {
      return new Map();
    }

    const normalizedName = cardName.toLowerCase();
    const pattern = `__keyspace@0__:${this.STORE_CACHE_KEY_PREFIX}${normalizedName}${this.STORE_KEY_SEPARATOR}*`;

    return new Promise((resolve) => {
      let timeoutHandle: NodeJS.Timeout;
      let resolved = false;

      const callback = (results: Map<string, StoreCardCacheEntry | null>) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutHandle);
          resolve(results);
        }
      };

      // Check if there's already a pending subscription for this pattern
      let pending = this.pendingPatternSubscriptions.get(pattern);

      if (!pending) {
        pending = {
          pattern,
          cardName,
          pendingStores: new Set(storeNames.map(s => s.toLowerCase())),
          results: new Map(),
          callbacks: new Set(),
        };

        this.pendingPatternSubscriptions.set(pattern, pending);

        // Subscribe using pattern matching
        this.cardSubscriber.psubscribe(pattern, (err) => {
          if (err) {
            this.logger.error(`Failed to psubscribe to ${pattern}:`, err);
            this.cleanupPatternSubscription(pattern);
          } else {
            this.logger.debug(`Subscribed to pattern notifications for: ${cardName} on pattern: ${pattern}`);
          }
        });
      } else {
        // Add new stores to pending set
        for (const storeName of storeNames) {
          pending.pendingStores.add(storeName.toLowerCase());
        }
      }

      pending.callbacks.add(callback);

      // Set up timeout
      timeoutHandle = setTimeout(async () => {
        if (!resolved) {
          resolved = true;

          const currentPending = this.pendingPatternSubscriptions.get(pattern);
          if (currentPending) {
            currentPending.callbacks.delete(callback);

            // If no more callbacks waiting, clean up
            if (currentPending.callbacks.size === 0) {
              await this.cleanupPatternSubscription(pattern);
            }
          }

          this.logger.warn(`Timeout waiting for stores scrape completion: ${cardName}, pending stores: ${Array.from(pending?.pendingStores ?? []).join(', ')}`);

          // Return whatever results we have
          resolve(pending?.results ?? new Map());
        }
      }, timeoutMs);

      this.logger.debug(`Waiting for ${storeNames.length} store(s) to complete for: ${cardName}`);
    });
  }

  private async cleanupPatternSubscription(pattern: string) {
    const pending = this.pendingPatternSubscriptions.get(pattern);
    if (pending) {
      await this.cardSubscriber.punsubscribe(pattern);
      this.pendingPatternSubscriptions.delete(pattern);
      this.logger.debug(`Cleaned up pattern subscription for: ${pattern}`);
    }
  }

  private failAllPendingRequests(reason: string) {
    if (this.pendingPatternSubscriptions.size === 0) {
      return;
    }

    this.logger.error(`Failing ${this.pendingPatternSubscriptions.size} pending request(s): ${reason}`);

    // Notify all callbacks with empty results
    for (const pending of this.pendingPatternSubscriptions.values()) {
      this.logger.debug(`Failing ${pending.callbacks.size} callback(s) for: ${pending.cardName}`);
      pending.callbacks.forEach(cb => cb(new Map()));
    }

    this.pendingPatternSubscriptions.clear();
  }

  // =====================================
  // Scheduler Status Methods
  // =====================================

  async schedulerJobStatus(): Promise<SchedulerJobStatus | null> {
    try {
      const redis = await this.queue.client;
      const status = await redis.get(this.SCHEDULER_KEY);

      if (!status) {
        this.logger.debug('No scheduler job status found in cache');
        return null;
      }

      const result: SchedulerJobStatus = JSON.parse(status);
      this.logger.debug('Fetched scheduler job status from cache');
      return result;
    } catch (error) {
      this.logger.error('Error reading scheduler job status from cache:', error);
      return null;
    }
  }

  async setSchedulerJobStatus(status: SchedulerJobStatus): Promise<void> {
    try {
      const redis = await this.queue.client;
      await redis.set(this.SCHEDULER_KEY, JSON.stringify(status));
      this.logger.debug('Updated scheduler job status in cache');
    }
    catch (error) {
      this.logger.error('Error setting scheduler job status in cache:', error);
      throw error;
    }
  }

  // =====================================
  // Health Check
  // =====================================

  /**
   * Check Redis health by pinging the connection
   * Returns status object for use in health checks
   */
  async checkHealth(): Promise<{ status: 'up' | 'down'; message?: string }> {
    try {
      const redis = await this.queue.client;
      const pong = await redis.ping();

      if (pong === 'PONG') {
        return { status: 'up' };
      }

      return { status: 'down', message: 'Unexpected ping response' };
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Redis connection failed',
      };
    }
  }
}
