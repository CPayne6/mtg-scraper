import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private scrapeQueue: Queue;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisHost = this.configService.get<string>('redis.host');
    const redisPort = this.configService.get<number>('redis.port');

    this.scrapeQueue = new Queue('card-scrape', {
      connection: {
        host: redisHost,
        port: redisPort,
      },
    });

    this.logger.log(`Connected to Redis queue at ${redisHost}:${redisPort}`);
  }

  /**
   * Enqueue a scrape job for a card
   *
   * @param cardName - Name of the card to scrape
   * @param priority - Job priority (higher = more important). User requests: 10, Scheduled: 1
   * @param requestId - Optional request ID for user-initiated requests
   */
  async enqueueScrapeJob(
    cardName: string,
    priority: number = 1,
    requestId?: string,
  ): Promise<void> {
    await this.scrapeQueue.add(
      'scrape-card',
      {
        cardName,
        requestId,
        source: requestId ? 'user' : 'scheduler',
        enqueuedAt: new Date().toISOString(),
      },
      {
        priority,
        // Remove job from queue after 7 days
        removeOnComplete: {
          age: 7 * 24 * 60 * 60, // 7 days in seconds
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
        },
      }
    );

    this.logger.debug(
      `Enqueued scrape job for "${cardName}" with priority ${priority}`
    );
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.scrapeQueue.getWaitingCount(),
      this.scrapeQueue.getActiveCount(),
      this.scrapeQueue.getCompletedCount(),
      this.scrapeQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }

  async onModuleDestroy() {
    await this.scrapeQueue.close();
    this.logger.log('Queue connection closed');
  }
}
