import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, ScrapeCardJobResult } from '@mtg-scraper/shared';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export type CardWithStore = ScrapeCardJobResult['results'][0];

interface PendingSubscription {
  callbacks: Set<(data: CardWithStore[] | null) => void>;
  keyspaceChannel: string;
  cardName: string;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly CACHE_KEY_PREFIX = 'card:';
  private readonly SCRAPING_KEY_PREFIX = 'scraping:';
  private readonly SCRAPING_TTL = 300; // 5 minutes in seconds
  private cardSubscriber: Redis;

  // Map of keyspaceChannel -> pending subscription info
  private pendingSubscriptions = new Map<string, PendingSubscription>();

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

      // Resubscribe to all active channels after reconnection
      const channels = Array.from(this.pendingSubscriptions.keys());
      if (channels.length > 0) {
        try {
          await this.cardSubscriber.subscribe(...channels);
          this.logger.log(`Resubscribed to ${channels.length} active channel(s) after reconnection`);
        } catch (err) {
          this.logger.error('Failed to resubscribe to channels:', err);
          this.failAllPendingRequests('Failed to resubscribe after reconnection');
        }
      }
    });

    // Handle notification for all subscriptions
    this.cardSubscriber.on('message', async (channel: string, operation: string) => {
      // print debug message
      this.logger.debug(`Received keyspace notification on pattern ${channel}: ${operation}`);
      const pending = this.pendingSubscriptions.get(channel);
      this.logger.debug(`Pending suscription: ${!!pending}`)
      if (pending && (operation === 'set' || operation === 'setex')) {
        // Fetch the data once
        const cards = await this.getCard(pending.cardName);

        this.logger.debug(`Notifying ${pending.callbacks.size} waiting requests for: ${pending.cardName}`);
        pending.callbacks.forEach(cb => cb(cards));

        // Clean up the subscription
        await this.cleanupSubscription(pending.keyspaceChannel);
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

  async getCard(cardName: string): Promise<CardWithStore[] | null> {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${cardName.toLowerCase()}`;
      const redis = await this.queue.client;
      const cached = await redis.get(cacheKey);

      if (!cached) {
        this.logger.debug(`Cache miss for: ${cardName}`);
        return null;
      }

      const result: ScrapeCardJobResult = JSON.parse(cached);

      if (!result.success) {
        this.logger.debug(`Cached failed result for: ${cardName}`);
        return null;
      }

      this.logger.debug(`Cache hit for: ${cardName}`);
      return result.results;
    } catch (error) {
      this.logger.error(`Error reading from cache for ${cardName}:`, error);
      return null;
    }
  }

  async isBeingScraped(cardName: string): Promise<boolean> {
    try {
      const scrapingKey = `${this.SCRAPING_KEY_PREFIX}${cardName.toLowerCase()}`;
      const redis = await this.queue.client;
      const exists = await redis.exists(scrapingKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Error checking scraping status for ${cardName}:`, error);
      return false;
    }
  }

  async markAsBeingScraped(cardName: string, requestId: string): Promise<boolean> {
    try {
      const scrapingKey = `${this.SCRAPING_KEY_PREFIX}${cardName.toLowerCase()}`;
      const redis = await this.queue.client;

      // Use SET NX (set if not exists) to prevent race conditions
      const result = await redis.set(scrapingKey, requestId, 'EX', this.SCRAPING_TTL, 'NX');

      // result will be 'OK' if set successfully, null if key already exists
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Error marking ${cardName} as being scraped:`, error);
      return false;
    }
  }

  async waitForScrapeCompletion(cardName: string, timeoutMs: number = 60000): Promise<CardWithStore[] | null> {
    const normalizedName = cardName.toLowerCase();
    const cacheKey = `${this.CACHE_KEY_PREFIX}${normalizedName}`;
    const keyspaceChannel = `__keyspace@0__:${cacheKey}`;

    return new Promise((resolve) => {
      let timeoutHandle: NodeJS.Timeout;
      let resolved = false;

      // Callback for when notification arrives
      const callback = (cards: CardWithStore[] | null) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutHandle);
          resolve(cards);
        }
      };

      // Check if there's already a pending subscription for this card
      let pending = this.pendingSubscriptions.get(keyspaceChannel);

      if (!pending) {
        pending = {
          callbacks: new Set(),
          keyspaceChannel,
          cardName
        };

        this.pendingSubscriptions.set(keyspaceChannel, pending);

        // Subscribe to this specific card's keyspace notification
        this.cardSubscriber.subscribe(keyspaceChannel, (err) => {
          if (err) {
            this.logger.error(`Failed to subscribe to ${keyspaceChannel}:`, err);
            this.cleanupSubscription(keyspaceChannel);
          } else {
            this.logger.debug(`Subscribed to keyspace notifications for: ${cardName} on channel: ${keyspaceChannel}`);
          }
        });
      }

      // Add this request's callback to the pending subscription
      pending.callbacks.add(callback);

      // Set up timeout
      timeoutHandle = setTimeout(async () => {
        if (!resolved) {
          resolved = true;

          // Remove this callback
          const currentPending = this.pendingSubscriptions.get(keyspaceChannel);
          if (currentPending) {
            currentPending.callbacks.delete(callback);

            // If no more callbacks waiting, clean up the subscription
            if (currentPending.callbacks.size === 0) {
              await this.cleanupSubscription(keyspaceChannel);
            }
          }

          this.logger.error(`Timeout waiting for scrape completion: ${cardName}`);
          resolve(null);
        }
      }, timeoutMs);

      this.logger.debug(`Waiting for scrape completion: ${cardName} (${pending.callbacks.size} total waiting)`);
    });
  }

  private async cleanupSubscription(keyspaceChannel: string) {
    const pending = this.pendingSubscriptions.get(keyspaceChannel);
    if (pending) {
      await this.cardSubscriber.unsubscribe(pending.keyspaceChannel);
      this.pendingSubscriptions.delete(keyspaceChannel);
      this.logger.debug(`Cleaned up subscription for: ${keyspaceChannel}`);
    }
  }

  private failAllPendingRequests(reason: string) {
    if (this.pendingSubscriptions.size === 0) {
      return;
    }

    this.logger.error(`Failing ${this.pendingSubscriptions.size} pending request(s): ${reason}`);

    // Notify all callbacks with null (failure)
    for (const pending of this.pendingSubscriptions.values()) {
      this.logger.debug(`Failing ${pending.callbacks.size} callback(s) for: ${pending.cardName}`);
      pending.callbacks.forEach(cb => cb(null));
    }

    // Clear all pending subscriptions
    this.pendingSubscriptions.clear();
  }

  async setCard(cardName: string, cards: CardWithStore[]): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${cardName.toLowerCase()}`;
      const redis = await this.queue.client;

      const result: ScrapeCardJobResult = {
        cardName,
        results: cards,
        timestamp: Date.now(),
        success: true,
      };

      // Cache for 24 hours
      await redis.setex(cacheKey, 86400, JSON.stringify(result));
      this.logger.debug(`Cached ${cards.length} results for: ${cardName}`);
    } catch (error) {
      this.logger.error(`Error caching results for ${cardName}:`, error);
      throw error;
    }
  }

  async markScrapeComplete(cardName: string): Promise<void> {
    try {
      const scrapingKey = `${this.SCRAPING_KEY_PREFIX}${cardName.toLowerCase()}`;
      const redis = await this.queue.client;

      // Remove the scraping marker
      await redis.del(scrapingKey);
      this.logger.debug(`Marked scrape complete for: ${cardName}`);
    } catch (error) {
      this.logger.error(`Error marking scrape complete for ${cardName}:`, error);
      throw error;
    }
  }
}
