import { PopularCardsScheduler } from '@/popular-cards/popular-cards.scheduler';
import { DiscoveryScheduler } from '@/discovery/discovery.scheduler';
import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService, QueueService, ProductUrl, UnmatchedCard, DiscoveryRun } from '@scoutlgs/core';
import { ConfigService } from '@nestjs/config';
const EXTRACTION_QUEUE_NAME = 'product-extraction';
const EXTRACTION_TRIGGER_BATCH_SIZE = 500;
const EXTRACTION_BACKPRESSURE = { maxDepth: 5_000 };
const BACKPRESSURE_CHECK_INTERVAL = 50;

@Injectable()
export class ManualService {
  private readonly logger = new Logger(ManualService.name);
  private retryStatus: { status: 'running' | 'completed' | 'failed'; enqueued: number; total: number; startedAt: number; finishedAt?: number; error?: string } | null = null;
  private extractionTriggerStatus: {
    status: 'running' | 'completed' | 'failed';
    enqueued: number;
    total: number;
    discoveryRunId: number;
    startedAt: number;
    finishedAt?: number;
    error?: string;
  } | null = null;

  constructor(
    private readonly popularCardsScheduler: PopularCardsScheduler,
    private readonly discoveryScheduler: DiscoveryScheduler,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(UnmatchedCard)
    private readonly unmatchedCardRepository: Repository<UnmatchedCard>,
    @InjectRepository(DiscoveryRun)
    private readonly discoveryRunRepository: Repository<DiscoveryRun>,
  ) { }

  async triggerScrape(
    limit: number = this.configService.get<number>('popularCards.limit') ?? 1000,
  ) {
    this.logger.log('Manual trigger initiated for popular cards scrape');

    const jobStatus = await this.cacheService.schedulerJobStatus();
    this.logger.log(`Current scheduler job status: ${JSON.stringify(jobStatus)}`);

    if (jobStatus && jobStatus.status === 'running') {
      this.logger.warn('Job is currently running, trigger aborted');
      throw new ConflictException('A popular cards scrape job is already in progress');
    }

    const enabled = this.configService.get<boolean>('schedule.enabled') ?? true;
    const maxQueueDepth = this.configService.get<number>('popularCards.maxQueueDepth') ?? 1000;
    const refillBatchSize = this.configService.get<number>('popularCards.refillBatchSize') ?? 100;

    // Fire and forget - don't await so the HTTP request returns immediately
    this.popularCardsScheduler
      .scrapePopularCards({
        enabled,
        limit,
        maxQueueDepth,
        refillBatchSize,
      })
      .catch(error => this.logger.error('Scrape failed', error));

    return { message: 'Scrape triggered successfully' };
  }

  getStatus() {
    this.logger.log('Fetching status of last popular cards scrape')
    return this.cacheService.schedulerJobStatus();
  }

  // Discovery V2 methods

  async triggerDiscovery(options?: { skipExtraction?: boolean }) {
    this.logger.log(
      `Manual trigger initiated for product discovery` +
        (options?.skipExtraction ? ' (extraction skipped)' : ''),
    );

    const jobStatus = await this.discoveryScheduler.getJobStatus();

    if (jobStatus && jobStatus.status === 'running') {
      this.logger.warn('Discovery job is currently running, trigger aborted');
      throw new ConflictException('A discovery job is already in progress');
    }

    return this.discoveryScheduler.triggerDiscovery({ ...options, trigger: 'manual' });
  }

  async getDiscoveryStatus() {
    this.logger.log('Fetching status of discovery job');
    return this.discoveryScheduler.getJobStatus();
  }

  async getDiscoveryRuns(limit: number = 20) {
    return this.discoveryRunRepository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async getDiscoveryRun(id: number) {
    return this.discoveryRunRepository.findOne({ where: { id } });
  }

  // Extraction error retry

  async retryErroredUrls(batchSize: number = 500): Promise<{ message: string }> {
    if (this.retryStatus?.status === 'running') {
      throw new ConflictException('A retry job is already in progress');
    }

    const total = await this.productUrlRepository.count({
      where: { extractionStatus: 'error' as const },
    });

    if (total === 0) {
      return { message: 'No errored product URLs to retry' };
    }

    this.retryStatus = { status: 'running', enqueued: 0, total, startedAt: Date.now() };

    this.runRetry(batchSize).catch((error) => {
      this.logger.error('Retry job failed:', error);
      if (this.retryStatus) {
        this.retryStatus.status = 'failed';
        this.retryStatus.finishedAt = Date.now();
        this.retryStatus.error = error.message;
      }
    });

    return { message: `Retry triggered for ${total} errored product URLs` };
  }

  private async runRetry(batchSize: number): Promise<void> {
    let lastId = 0;

    while (this.retryStatus?.status === 'running') {
      const errorUrls = await this.productUrlRepository
        .createQueryBuilder('pu')
        .select(['pu.id', 'pu.storeId', 'pu.handle'])
        .where('pu.extractionStatus = :status', { status: 'error' })
        .andWhere('pu.id > :lastId', { lastId })
        .orderBy('pu.id', 'ASC')
        .limit(batchSize)
        .getMany();

      if (errorUrls.length === 0) break;

      // Reset status to pending before enqueuing
      const ids = errorUrls.map((u) => u.id);
      await this.productUrlRepository
        .createQueryBuilder()
        .update(ProductUrl)
        .set({ extractionStatus: 'pending' as const, extractionError: undefined })
        .whereInIds(ids)
        .execute();

      // Enqueue extraction jobs
      const jobs = errorUrls.map((u) => ({
        productUrlId: u.id,
        storeId: u.storeId,
        handle: u.handle,
      }));
      await this.queueService.enqueueExtractionJobsBulk(jobs);

      lastId = errorUrls[errorUrls.length - 1].id;
      this.retryStatus.enqueued += errorUrls.length;

      this.logger.log(`Retry: enqueued ${this.retryStatus.enqueued}/${this.retryStatus.total}`);

      await new Promise((r) => setTimeout(r, 200));
    }

    if (this.retryStatus) {
      this.retryStatus.status = 'completed';
      this.retryStatus.finishedAt = Date.now();
    }

    this.logger.log(`Retry completed: enqueued ${this.retryStatus?.enqueued} URLs`);
  }

  getRetryStatus() {
    return this.retryStatus;
  }

  // Re-extract unmatched cards

  private reextractStatus: { status: 'running' | 'completed' | 'failed'; enqueued: number; total: number; deleted: number; startedAt: number; finishedAt?: number; error?: string } | null = null;

  async reextractUnmatched(batchSize: number = 500): Promise<{ message: string }> {
    if (this.reextractStatus?.status === 'running') {
      throw new ConflictException('A re-extract job is already in progress');
    }

    const total = await this.unmatchedCardRepository
      .createQueryBuilder('uc')
      .select('COUNT(DISTINCT uc.productUrlId)', 'count')
      .getRawOne()
      .then((r) => parseInt(r.count, 10));

    if (total === 0) {
      return { message: 'No unmatched cards to re-extract' };
    }

    this.reextractStatus = { status: 'running', enqueued: 0, total, deleted: 0, startedAt: Date.now() };

    this.runReextract(batchSize).catch((error) => {
      this.logger.error('Re-extract job failed:', error);
      if (this.reextractStatus) {
        this.reextractStatus.status = 'failed';
        this.reextractStatus.finishedAt = Date.now();
        this.reextractStatus.error = error.message;
      }
    });

    return { message: `Re-extract triggered for ${total} product URLs with unmatched cards` };
  }

  private async runReextract(batchSize: number): Promise<void> {
    let lastId = 0;

    while (this.reextractStatus?.status === 'running') {
      // Find distinct product URL IDs from unmatched_cards
      const rows: { product_url_id: number }[] = await this.unmatchedCardRepository
        .createQueryBuilder('uc')
        .select('DISTINCT uc.product_url_id', 'product_url_id')
        .where('uc.product_url_id > :lastId', { lastId })
        .orderBy('uc.product_url_id', 'ASC')
        .limit(batchSize)
        .getRawMany();

      if (rows.length === 0) break;

      const productUrlIds = rows.map((r) => r.product_url_id);

      // Delete unmatched_cards for these product URLs
      await this.unmatchedCardRepository
        .createQueryBuilder()
        .delete()
        .where('productUrlId IN (:...ids)', { ids: productUrlIds })
        .execute();

      this.reextractStatus.deleted += productUrlIds.length;

      // Reset product URLs to pending
      await this.productUrlRepository
        .createQueryBuilder()
        .update(ProductUrl)
        .set({ extractionStatus: 'pending' as const, extractionError: undefined, lastExtractedAt: undefined })
        .whereInIds(productUrlIds)
        .execute();

      // Get store and handle info for enqueuing
      const urls = await this.productUrlRepository
        .createQueryBuilder('pu')
        .select(['pu.id', 'pu.storeId', 'pu.handle'])
        .whereInIds(productUrlIds)
        .getMany();

      const jobs = urls.map((u) => ({
        productUrlId: u.id,
        storeId: u.storeId,
        handle: u.handle,
      }));
      await this.queueService.enqueueExtractionJobsBulk(jobs);

      lastId = productUrlIds[productUrlIds.length - 1];
      this.reextractStatus.enqueued += urls.length;

      this.logger.log(`Re-extract: enqueued ${this.reextractStatus.enqueued}/${this.reextractStatus.total}`);

      await new Promise((r) => setTimeout(r, 200));
    }

    if (this.reextractStatus) {
      this.reextractStatus.status = 'completed';
      this.reextractStatus.finishedAt = Date.now();
    }

    this.logger.log(`Re-extract completed: enqueued ${this.reextractStatus?.enqueued} URLs, deleted ${this.reextractStatus?.deleted} unmatched entries`);
  }

  getReextractStatus() {
    return this.reextractStatus;
  }

  // Extraction trigger (re-extract all product URLs)

  async triggerExtraction(options?: { storeId?: number }): Promise<{ message: string }> {
    if (this.extractionTriggerStatus?.status === 'running') {
      throw new ConflictException('An extraction trigger job is already in progress');
    }

    const where: Record<string, unknown> = {};
    if (options?.storeId) {
      where.storeId = options.storeId;
    }

    const total = await this.productUrlRepository.count({ where });

    if (total === 0) {
      return { message: 'No product URLs to extract' };
    }

    const discoveryRun = this.discoveryRunRepository.create({
      trigger: 'manual',
      skipExtraction: false,
      status: 'running',
    });
    await this.discoveryRunRepository.save(discoveryRun);

    this.extractionTriggerStatus = {
      status: 'running',
      enqueued: 0,
      total,
      discoveryRunId: discoveryRun.id,
      startedAt: Date.now(),
    };

    this.runExtractionTrigger(discoveryRun.id, options?.storeId).catch((error) => {
      this.logger.error('Extraction trigger job failed:', error);
      if (this.extractionTriggerStatus) {
        this.extractionTriggerStatus.status = 'failed';
        this.extractionTriggerStatus.finishedAt = Date.now();
        this.extractionTriggerStatus.error = error.message;
      }
      this.discoveryRunRepository.update(discoveryRun.id, {
        status: 'failed',
        completedAt: new Date(),
      });
    });

    return { message: `Extraction triggered for ${total} product URLs (run #${discoveryRun.id})` };
  }

  private async runExtractionTrigger(discoveryRunId: number, storeId?: number): Promise<void> {
    let lastId = 0;
    const storeMap = new Map<number, Array<{ id: number; storeId: number; handle: string }>>();

    // Phase 1: Load all product URLs in batched cursor pages, resetting status as we go
    while (true) {
      const qb = this.productUrlRepository
        .createQueryBuilder('pu')
        .select(['pu.id', 'pu.storeId', 'pu.handle'])
        .where('pu.id > :lastId', { lastId })
        .orderBy('pu.id', 'ASC')
        .limit(EXTRACTION_TRIGGER_BATCH_SIZE);

      if (storeId) {
        qb.andWhere('pu.storeId = :storeId', { storeId });
      }

      const batch = await qb.getMany();
      if (batch.length === 0) break;

      const ids = batch.map((u) => u.id);

      // Reset extraction status to pending
      await this.productUrlRepository
        .createQueryBuilder()
        .update(ProductUrl)
        .set({ extractionStatus: 'pending' as const, extractionError: undefined })
        .whereInIds(ids)
        .execute();

      // Add to per-store buckets
      for (const url of batch) {
        let bucket = storeMap.get(url.storeId);
        if (!bucket) {
          bucket = [];
          storeMap.set(url.storeId, bucket);
        }
        bucket.push({ id: url.id, storeId: url.storeId, handle: url.handle });
      }

      lastId = batch[batch.length - 1].id;
    }

    // Phase 2: Build round-robin interleaved array
    const interleaved: Array<{ id: number; storeId: number; handle: string }> = [];
    const iterators = [...storeMap.values()].map((bucket) => ({ bucket, index: 0 }));

    let remaining = iterators.length;
    while (remaining > 0) {
      for (const iter of iterators) {
        if (iter.index < iter.bucket.length) {
          interleaved.push(iter.bucket[iter.index]);
          iter.index++;
          if (iter.index >= iter.bucket.length) {
            remaining--;
          }
        }
      }
    }

    // Phase 3: Enqueue jobs one at a time with backpressure
    for (let i = 0; i < interleaved.length; i++) {
      const url = interleaved[i];

      if (i > 0 && i % BACKPRESSURE_CHECK_INTERVAL === 0) {
        await this.queueService.waitForCapacity(
          EXTRACTION_QUEUE_NAME,
          1,
          `extraction-trigger-${discoveryRunId}`,
          EXTRACTION_BACKPRESSURE,
        );
      }

      await this.queueService.enqueueExtractionJob(
        url.id,
        url.storeId,
        url.handle,
        1,
        discoveryRunId,
      );

      this.extractionTriggerStatus!.enqueued = i + 1;

      if ((i + 1) % 1000 === 0) {
        this.logger.log(`Extraction trigger: enqueued ${i + 1}/${interleaved.length}`);
      }
    }

    // Phase 4: Finalize
    await this.discoveryRunRepository.update(discoveryRunId, {
      totalExtractionJobsQueued: interleaved.length,
      completedAt: new Date(),
    });

    if (this.extractionTriggerStatus) {
      this.extractionTriggerStatus.status = 'completed';
      this.extractionTriggerStatus.finishedAt = Date.now();
    }

    this.logger.log(`Extraction trigger completed: enqueued ${interleaved.length} URLs (run #${discoveryRunId})`);
  }

  getExtractionTriggerStatus() {
    return this.extractionTriggerStatus;
  }
}