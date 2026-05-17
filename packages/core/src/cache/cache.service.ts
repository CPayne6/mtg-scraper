import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StoreCardCacheEntry, CardWithStore } from '@scoutlgs/shared';
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

export interface StoreBackoffState {
  /** Absolute timestamp (ms) when the backoff expires */
  blockedUntil: number;
  /** The error type that triggered the backoff */
  errorType: string;
  /** Number of consecutive failures for this store */
  consecutiveFailures: number;
  /** The current backoff duration in ms */
  currentBackoffMs: number;
}

export interface BackoffCheckResult {
  /** Whether the store is currently blocked */
  blocked: boolean;
  /** Remaining time in ms until backoff expires (min 500ms) */
  remainingMs?: number;
  /** Absolute timestamp when backoff expires */
  blockedUntil?: number;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly STORE_CACHE_KEY_PREFIX = 'card:';
  private readonly STORE_KEY_SEPARATOR = ':store:';
  private readonly SCRAPING_KEY_PREFIX = 'scraping:';
  private readonly RATE_LIMIT_KEY_PREFIX = 'ratelimit:store:';
  private readonly SCHEDULER_KEY = 'scheduler:job-status';
  private readonly SCRAPING_TTL = 300; // 5 minutes in seconds
  private readonly CACHE_TTL = 86400; // 24 hours in seconds
  private readonly BASE_BACKOFF_MS = 5000; // 5 seconds initial backoff
  private readonly MAX_BACKOFF_MS = 60000; // 60 seconds max backoff
  private readonly MIN_DELAY_MS = 500; // Minimum delay when re-queueing
  private redis: Redis;
  private cardSubscriber: Redis;

  // Map of pattern -> pending pattern subscription info (for PSUBSCRIBE)
  private pendingPatternSubscriptions = new Map<string, PendingPatternSubscription>();

  // Store event handler references for cleanup
  private errorHandler: ((err: Error) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private reconnectingHandler: ((delay: number) => void) | null = null;
  private endHandler: (() => void) | null = null;
  private readyHandler: (() => Promise<void>) | null = null;
  private pmessageHandler: ((pattern: string, channel: string, operation: string) => Promise<void>) | null = null;

  constructor(
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing cache service Redis connections...');

    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Redis reconnecting (attempt ${times}), delay: ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: null,
    };

    // Create Redis client for general operations
    this.redis = new Redis(redisConfig);

    this.redis.on('error', (err) => {
      this.logger.error('Redis client error:', err);
    });

    this.redis.on('ready', () => {
      this.logger.log('Redis client ready');
    });

    // Create Redis subscriber instance (separate connection for pub/sub)
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

    // Set up error handlers (store references for cleanup)
    this.errorHandler = (err) => {
      this.logger.error('Card subscriber error:', err);
    };
    this.cardSubscriber.on('error', this.errorHandler);

    this.closeHandler = () => {
      this.logger.warn('Card subscriber connection closed');
    };
    this.cardSubscriber.on('close', this.closeHandler);

    this.reconnectingHandler = (delay) => {
      this.logger.log(`Card subscriber reconnecting in ${delay}ms...`);
    };
    this.cardSubscriber.on('reconnecting', this.reconnectingHandler);

    this.endHandler = () => {
      this.logger.error('Card subscriber connection ended - failing all pending requests');
      this.failAllPendingRequests('Redis connection ended');
    };
    this.cardSubscriber.on('end', this.endHandler);

    // Handle successful reconnection
    this.readyHandler = async () => {
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
    };
    this.cardSubscriber.on('ready', this.readyHandler);

    // Handle pattern notification for store-card subscriptions (PSUBSCRIBE)
    this.pmessageHandler = async (pattern: string, channel: string, operation: string) => {
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
            try {
              await this.cleanupPatternSubscription(pattern);
            } catch (cleanupErr) {
              this.logger.error(`Failed to cleanup pattern subscription: ${pattern}`, cleanupErr);
              // Force remove from map even if punsubscribe failed
              this.pendingPatternSubscriptions.delete(pattern);
            }
          }
        }
      }
    };
    this.cardSubscriber.on('pmessage', this.pmessageHandler);

    // Wait for both connections to be ready
    const waitForReady = (client: Redis, name: string): Promise<void> => {
      if (client.status === 'ready') {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        client.once('ready', () => {
          this.logger.log(`${name} connection ready`);
          resolve();
        });
      });
    };

    await Promise.all([
      waitForReady(this.redis, 'Redis client'),
      waitForReady(this.cardSubscriber, 'Card subscriber'),
    ]);

    this.logger.log('Cache service initialized successfully');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down cache service...');

    // Fail all pending requests before shutdown
    this.failAllPendingRequests('Service shutting down');

    // Remove all event listeners before disconnecting to prevent memory leaks
    if (this.cardSubscriber) {
      if (this.errorHandler) {
        this.cardSubscriber.off('error', this.errorHandler);
      }
      if (this.closeHandler) {
        this.cardSubscriber.off('close', this.closeHandler);
      }
      if (this.reconnectingHandler) {
        this.cardSubscriber.off('reconnecting', this.reconnectingHandler);
      }
      if (this.endHandler) {
        this.cardSubscriber.off('end', this.endHandler);
      }
      if (this.readyHandler) {
        this.cardSubscriber.off('ready', this.readyHandler);
      }
      if (this.pmessageHandler) {
        this.cardSubscriber.off('pmessage', this.pmessageHandler);
      }

      await this.cardSubscriber.quit();
    }

    // Close main Redis client
    if (this.redis) {
      await this.redis.quit();
    }

    // Clear handler references
    this.errorHandler = null;
    this.closeHandler = null;
    this.reconnectingHandler = null;
    this.endHandler = null;
    this.readyHandler = null;
    this.pmessageHandler = null;

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
      const entry: StoreCardCacheEntry = {
        storeName,
        results,
        timestamp: timestamp ?? Date.now(),
        error,
        retryCount,
      };

      // Cache for 24 hours
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(entry));
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
      const cached = await this.redis.get(cacheKey);

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
      const keys = storeNames.map(storeName => this.buildStoreCardKey(cardName, storeName));
      const cached = await this.redis.mget(...keys);

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
      const exists = await this.redis.exists(scrapingKey);
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
      // Use SET NX (set if not exists) to prevent race conditions
      const result = await this.redis.set(scrapingKey, requestId, 'EX', this.SCRAPING_TTL, 'NX');

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
      await this.redis.del(scrapingKey);
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
            this.cleanupPatternSubscription(pattern).catch((cleanupErr) => {
              this.logger.error(`Failed to cleanup after psubscribe error: ${pattern}`, cleanupErr);
              // Force remove from map even if punsubscribe failed
              this.pendingPatternSubscriptions.delete(pattern);
            });
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
              try {
                await this.cleanupPatternSubscription(pattern);
              } catch (cleanupErr) {
                this.logger.error(`Failed to cleanup pattern subscription on timeout: ${pattern}`, cleanupErr);
                // Force remove from map even if punsubscribe failed
                this.pendingPatternSubscriptions.delete(pattern);
              }
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
      const status = await this.redis.get(this.SCHEDULER_KEY);

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
      await this.redis.set(this.SCHEDULER_KEY, JSON.stringify(status));
      this.logger.debug('Updated scheduler job status in cache');
    }
    catch (error) {
      this.logger.error('Error setting scheduler job status in cache:', error);
      throw error;
    }
  }

  // =====================================
  // Rate Limit / Backoff Methods
  // =====================================

  /**
   * Build the rate limit backoff key for a store.
   * Format: ratelimit:store:{storename}:backoff
   */
  private buildBackoffKey(storeName: string): string {
    return `${this.RATE_LIMIT_KEY_PREFIX}${storeName.toLowerCase()}:backoff`;
  }

  /**
   * Check if a store is currently in backoff due to rate limiting.
   * @param storeName The store name slug (e.g., 'f2f', '401')
   * @returns BackoffCheckResult with blocked status and remaining time
   */
  async isStoreRateLimited(storeName: string): Promise<BackoffCheckResult> {
    try {
      const key = this.buildBackoffKey(storeName);
      const data = await this.redis.get(key);

      if (!data) {
        return { blocked: false };
      }

      const state: StoreBackoffState = JSON.parse(data);
      const now = Date.now();

      if (state.blockedUntil > now) {
        // Calculate remaining time with minimum of MIN_DELAY_MS
        const remainingMs = Math.max(state.blockedUntil - now, this.MIN_DELAY_MS);

        this.logger.debug(
          `Store ${storeName} is rate limited for ${remainingMs}ms (until ${new Date(state.blockedUntil).toISOString()})`,
        );

        return {
          blocked: true,
          remainingMs,
          blockedUntil: state.blockedUntil,
        };
      }

      // Backoff has expired
      return { blocked: false };
    } catch (error) {
      this.logger.error(`Error checking rate limit state for ${storeName}:`, error);
      // On error, don't block - let the request proceed
      return { blocked: false };
    }
  }

  /**
   * Record an error for a store, triggering a backoff period.
   * If retryAfterSeconds is provided (from server's retry-after header), use that value.
   * Otherwise, use exponential backoff based on consecutive failures.
   * @param storeName The store name slug
   * @param errorType The error type that triggered the backoff
   * @param retryAfterSeconds Optional server-provided retry-after value in seconds
   * @returns The backoff duration in ms that was applied
   */
  async recordStoreRateLimit(
    storeName: string,
    errorType: string,
    retryAfterSeconds?: number,
  ): Promise<number> {
    try {
      const key = this.buildBackoffKey(storeName);
      // Get current state to track consecutive failures
      const existingData = await this.redis.get(key);
      let consecutiveFailures = 1;

      if (existingData) {
        try {
          const existingState: StoreBackoffState = JSON.parse(existingData);
          consecutiveFailures = (existingState.consecutiveFailures ?? 0) + 1;
        } catch {
          // Ignore parse errors, start fresh
        }
      }

      // Use server-provided retry-after if available, otherwise use exponential backoff
      let backoffMs: number;
      if (retryAfterSeconds && retryAfterSeconds > 0) {
        // Server told us how long to wait - use that (convert to ms)
        // Cap at max backoff to prevent excessive delays
        backoffMs = Math.min(retryAfterSeconds * 1000, this.MAX_BACKOFF_MS);
        this.logger.debug(`Using server retry-after: ${retryAfterSeconds}s (capped to ${backoffMs}ms)`);
      } else {
        // Calculate exponential backoff: base * 2^(failures-1), capped at max
        backoffMs = Math.min(
          this.BASE_BACKOFF_MS * Math.pow(2, consecutiveFailures - 1),
          this.MAX_BACKOFF_MS,
        );
      }

      const state: StoreBackoffState = {
        blockedUntil: Date.now() + backoffMs,
        errorType,
        consecutiveFailures,
        currentBackoffMs: backoffMs,
      };

      // TTL slightly longer than backoff to ensure auto-cleanup
      const ttlSeconds = Math.ceil(backoffMs / 1000) + 30;

      await this.redis.set(key, JSON.stringify(state), 'EX', ttlSeconds);

      this.logger.warn(
        `Backoff recorded for store ${storeName} (${errorType}). ` +
        `Failures: ${consecutiveFailures}, backoff: ${backoffMs}ms, ` +
        `blocked until ${new Date(state.blockedUntil).toISOString()}`,
      );

      return backoffMs;
    } catch (error) {
      this.logger.error(`Error recording backoff for ${storeName}:`, error);
      // Don't throw - rate limiting is best-effort
      return this.BASE_BACKOFF_MS;
    }
  }

  /**
   * Record an error for a shared API endpoint, triggering a backoff period for all stores using that API.
   * This is used when multiple stores share the same backend API (e.g., BinderPOS stores).
   * @param apiEndpoint A unique identifier for the API (e.g., 'binderpos')
   * @param errorType The error type that triggered the backoff
   * @param retryAfterSeconds Optional server-provided retry-after value in seconds
   * @returns The backoff duration in ms that was applied
   */
  async recordApiRateLimit(
    apiEndpoint: string,
    errorType: string,
    retryAfterSeconds?: number,
  ): Promise<number> {
    // Use the same method but with a different key prefix
    return this.recordStoreRateLimit(`api:${apiEndpoint}`, errorType, retryAfterSeconds);
  }

  /**
   * Check if a shared API endpoint is currently in backoff.
   * @param apiEndpoint A unique identifier for the API (e.g., 'binderpos')
   * @returns BackoffCheckResult with blocked status and remaining time
   */
  async isApiRateLimited(apiEndpoint: string): Promise<BackoffCheckResult> {
    return this.isStoreRateLimited(`api:${apiEndpoint}`);
  }

  /**
   * Clear the backoff state for a shared API endpoint.
   * @param apiEndpoint A unique identifier for the API
   */
  async clearApiRateLimit(apiEndpoint: string): Promise<void> {
    return this.clearStoreRateLimit(`api:${apiEndpoint}`);
  }

  /**
   * Clear the backoff state for a store.
   * Can be called when a store successfully responds after being rate limited.
   * @param storeName The store name slug
   */
  async clearStoreRateLimit(storeName: string): Promise<void> {
    try {
      const key = this.buildBackoffKey(storeName);
      await this.redis.del(key);
      this.logger.debug(`Cleared rate limit state for store ${storeName}`);
    } catch (error) {
      this.logger.error(`Error clearing rate limit for ${storeName}:`, error);
    }
  }

  // =====================================
  // Proxy Rotation
  // =====================================

  /**
   * Get the next proxy number for a scraper type.
   * Uses atomic INCR with modulo to rotate through 1-maxProxies.
   * @param scraperType The scraper type (e.g., 'f2f', 'binderpos')
   * @param maxProxies Maximum number of proxies (from WEBSHARE_IP_COUNT)
   * @returns Proxy number between 1 and maxProxies
   */
  async getNextProxyNumber(scraperType: string, maxProxies: number): Promise<number> {
    try {
      const key = `proxy:counter:${scraperType}`;
      // INCR is atomic - no race conditions across multiple scraper instances
      const value = await this.redis.incr(key);

      // Use modulo to wrap around: converts any value to 1-maxProxies range
      const proxyNumber = ((value - 1) % maxProxies) + 1;

      this.logger.debug(`Proxy rotation for ${scraperType}: using proxy ${proxyNumber}/${maxProxies}`);
      return proxyNumber;
    } catch (error) {
      this.logger.error(`Error getting next proxy number for ${scraperType}:`, error);
      // Fallback to proxy 1 on error
      return 1;
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
      const pong = await this.redis.ping();

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
