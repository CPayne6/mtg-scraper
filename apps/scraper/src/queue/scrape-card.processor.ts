import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, ScrapeCardJobData, ScrapeCardJobResult } from '@mtg-scraper/shared';
import { ScraperService } from '../scraper/scraper.service';

@Processor(QUEUE_NAMES.CARD_SCRAPE)
export class ScrapeCardProcessor {
  private readonly logger = new Logger(ScrapeCardProcessor.name);
  private readonly CACHE_KEY_PREFIX = 'card:';
  private readonly CACHE_TTL = 86400; // 24 hours in seconds

  constructor(
    private readonly scraperService: ScraperService,
    @InjectQueue(QUEUE_NAMES.CARD_SCRAPE) private readonly queue: Queue,
  ) {}

  @Process(JOB_NAMES.SCRAPE_CARD)
  async process(job: Job<ScrapeCardJobData>): Promise<ScrapeCardJobResult> {
    const { cardName, requestId } = job.data;

    this.logger.log(`Processing scrape job for card: ${cardName} (Request ID: ${requestId || 'N/A'})`);

    try {
      const results = await this.scraperService.searchCard(cardName);

      const result: ScrapeCardJobResult = {
        cardName,
        results,
        timestamp: Date.now(),
        success: true,
      };

      // Store results in Redis cache
      // Keyspace notifications will automatically notify listeners when this key is set
      const cacheKey = `${this.CACHE_KEY_PREFIX}${cardName.toLowerCase()}`;
      const redis = await this.queue.client;
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

      this.logger.log(`Successfully scraped ${results.length} results for: ${cardName}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to scrape card: ${cardName}`, error);

      const result: ScrapeCardJobResult = {
        cardName,
        results: [],
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      // Don't throw - return failed result instead
      return result;
    }
  }
}
