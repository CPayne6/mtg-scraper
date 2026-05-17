import { PopularCardsScheduler } from '@/popular-cards/popular-cards.scheduler';
import { DiscoveryScheduler } from '@/discovery/discovery.scheduler';
import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CacheService, QueueService, ProductUrl, UnmatchedCard, DiscoveryRun, Store, ShopifyProduct } from '@scoutlgs/core';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ManualService {
  private readonly logger = new Logger(ManualService.name);

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
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly dataSource: DataSource,
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

  // ---------------------------------------------------------------------------
  // Storefront extraction
  // ---------------------------------------------------------------------------

  /**
   * Trigger storefront extraction for one or all stores.
   * Routes based on store.platformType — currently only 'shopify_storefront'.
   */
  async triggerStorefrontExtraction(opts: { storeId?: number }) {
    if (!opts.storeId) {
      throw new BadRequestException('storeId is required. Use trigger-all for all stores.');
    }

    const store = await this.storeRepository.findOne({ where: { id: opts.storeId } });
    if (!store) {
      throw new NotFoundException(`Store ${opts.storeId} not found`);
    }

    if (store.platformType !== 'shopify_storefront') {
      throw new BadRequestException(
        `Store ${store.name} has platform type '${store.platformType}', expected 'shopify_storefront'`,
      );
    }

    const scope = store.scraperConfig?.storefrontScope;
    if (!scope) {
      throw new BadRequestException(
        `Store ${store.name} is missing scraperConfig.storefrontScope`,
      );
    }

    await this.queueService.enqueueStorefrontExtractionJob(store.id);

    this.logger.log(`Triggered storefront extraction for ${store.name}`);

    return {
      message: `Extraction triggered for ${store.name}`,
      storeId: store.id,
      platformType: store.platformType,
      scope,
    };
  }

  /**
   * Trigger storefront extraction for all active stores.
   */
  async triggerAllStorefrontExtractions() {
    const stores = await this.storeRepository.find({
      where: { isActive: true, platformType: 'shopify_storefront' as any },
    });

    const results: { store: string; error?: string }[] = [];

    for (const store of stores) {
      const scope = store.scraperConfig?.storefrontScope;
      if (!scope) {
        results.push({ store: store.name, error: 'Missing storefrontScope' });
        continue;
      }

      await this.queueService.enqueueStorefrontExtractionJob(store.id);
      results.push({ store: store.name });
    }

    this.logger.log(
      `Triggered storefront extraction for ${results.filter((r) => !r.error).length}/${stores.length} stores`,
    );

    return {
      triggered: results.filter((r) => !r.error).length,
      total: stores.length,
      results,
    };
  }

  /**
   * Get storefront extraction status across all stores.
   */
  async getStorefrontExtractionStatus() {
    return this.dataSource.query(`
      SELECT s.name, s.platform_type,
        (SELECT COUNT(*) FROM product_urls pu WHERE pu.store_id = s.id) as product_urls,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.store_id = s.id) as shopify_products,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.store_id = s.id AND sp.match_status = 'matched') as matched,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.store_id = s.id AND sp.match_status = 'unmatched') as unmatched,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.store_id = s.id AND sp.match_status = 'token') as tokens,
        (SELECT COUNT(*) FROM card_listings cl WHERE cl.store_id = s.id) as listings,
        (SELECT COUNT(*) FROM unmatched_cards uc WHERE uc.store_id = s.id) as unmatched_cards
      FROM stores s
      WHERE s.is_active = true
      ORDER BY s.id
    `);
  }
}
