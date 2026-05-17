import { ExtractionScheduler } from '@/extraction/extraction.scheduler';
import { ExtractionOrchestrator } from '@/extraction/extraction-orchestrator.service';
import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { QueueService, ProductUrl, UnmatchedCard, ExtractionRun, Store, ShopifyProduct } from '@scoutlgs/core';

@Injectable()
export class ManualService {
  private readonly logger = new Logger(ManualService.name);

  constructor(
    private readonly extractionScheduler: ExtractionScheduler,
    private readonly extractionOrchestrator: ExtractionOrchestrator,
    private readonly queueService: QueueService,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(UnmatchedCard)
    private readonly unmatchedCardRepository: Repository<UnmatchedCard>,
    @InjectRepository(ExtractionRun)
    private readonly extractionRunRepository: Repository<ExtractionRun>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly dataSource: DataSource,
  ) { }

  // Batch extraction-run endpoints

  async triggerExtractionRun(options?: { skipExtraction?: boolean; incremental?: boolean }) {
    this.logger.log(
      `Manual extraction-run triggered` +
        (options?.skipExtraction ? ' (extraction skipped)' : '') +
        (options?.incremental ? ' (incremental)' : ''),
    );

    const jobStatus = await this.extractionScheduler.getJobStatus();

    if (jobStatus && jobStatus.status === 'running') {
      this.logger.warn('Extraction run already in progress, trigger aborted');
      throw new ConflictException('An extraction run is already in progress');
    }

    return this.extractionScheduler.triggerExtractionRun({ ...options, trigger: 'manual' });
  }

  async getExtractionRunStatus() {
    this.logger.log('Fetching latest extraction-run status');
    return this.extractionScheduler.getJobStatus();
  }

  async getExtractionRuns(limit: number = 20) {
    return this.extractionRunRepository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async getExtractionRun(id: number) {
    return this.extractionRunRepository.findOne({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Storefront extraction
  // ---------------------------------------------------------------------------

  /**
   * Trigger storefront extraction for one or all stores.
   * Routes based on store.platformType — currently only 'shopify_storefront'.
   *
   * @param opts.splitRanges  If > 1, enqueues a bootstrap job that splits the
   *                          store's ID range into N parallel extraction jobs.
   *                          Omit (or pass 1) for the default sequential paging.
   */
  async triggerStorefrontExtraction(opts: {
    storeId?: number;
    splitRanges?: number;
    incremental?: boolean;
  }) {
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

    const updatedSince = opts.incremental
      ? (await this.extractionOrchestrator.resolveIncrementalCutoff()) ?? undefined
      : undefined;

    const splitRanges = opts.splitRanges && opts.splitRanges > 1 ? opts.splitRanges : 0;
    if (splitRanges > 0) {
      await this.queueService.enqueueStorefrontBootstrapJob(store.id, splitRanges, {
        updatedSince,
      });
    } else {
      await this.queueService.enqueueStorefrontExtractionJob(
        store.id,
        1,
        undefined,
        updatedSince,
      );
    }

    this.logger.log(
      `Triggered storefront extraction for ${store.name}` +
        (splitRanges > 0 ? ` (splitRanges=${splitRanges})` : ' (sequential)') +
        (updatedSince ? ` (incremental since ${updatedSince})` : ''),
    );

    return {
      message: `Extraction triggered for ${store.name}`,
      storeId: store.id,
      platformType: store.platformType,
      scope,
      mode: splitRanges > 0 ? `parallel-${splitRanges}` : 'sequential',
      updatedSince: updatedSince ?? null,
    };
  }

  /**
   * Trigger storefront extraction for all active stores.
   *
   * @param opts.splitRanges  Same as triggerStorefrontExtraction; applied to
   *                          every store that's enqueued.
   */
  async triggerAllStorefrontExtractions(
    opts: { splitRanges?: number; incremental?: boolean } = {},
  ) {
    const stores = await this.storeRepository.find({
      where: { isActive: true, platformType: 'shopify_storefront' as any },
    });

    const splitRanges = opts.splitRanges && opts.splitRanges > 1 ? opts.splitRanges : 0;
    const updatedSince = opts.incremental
      ? (await this.extractionOrchestrator.resolveIncrementalCutoff()) ?? undefined
      : undefined;
    const results: { store: string; error?: string }[] = [];

    for (const store of stores) {
      const scope = store.scraperConfig?.storefrontScope;
      if (!scope) {
        results.push({ store: store.name, error: 'Missing storefrontScope' });
        continue;
      }

      if (splitRanges > 0) {
        await this.queueService.enqueueStorefrontBootstrapJob(store.id, splitRanges, {
          updatedSince,
        });
      } else {
        await this.queueService.enqueueStorefrontExtractionJob(
          store.id,
          1,
          undefined,
          updatedSince,
        );
      }
      results.push({ store: store.name });
    }

    this.logger.log(
      `Triggered storefront extraction for ${results.filter((r) => !r.error).length}/${stores.length} stores` +
        (splitRanges > 0 ? ` (splitRanges=${splitRanges})` : ' (sequential)') +
        (updatedSince ? ` (incremental since ${updatedSince})` : ''),
    );

    return {
      triggered: results.filter((r) => !r.error).length,
      total: stores.length,
      mode: splitRanges > 0 ? `parallel-${splitRanges}` : 'sequential',
      updatedSince: updatedSince ?? null,
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

  // ---------------------------------------------------------------------------
  // Generic extraction operations (platform-agnostic)
  // ---------------------------------------------------------------------------

  /**
   * Enqueue a re-extract-unmatched job. The scraper re-fetches each
   * unmatched product from Shopify and runs the latest extraction
   * pipeline against it. Use this to apply extractor fixes without
   * re-fetching the full catalog.
   */
  async reextractUnmatched(opts: { storeId: number; limit?: number }) {
    const store = await this.storeRepository.findOne({ where: { id: opts.storeId } });
    if (!store) {
      throw new NotFoundException(`Store ${opts.storeId} not found`);
    }
    if (store.platformType !== 'shopify_storefront') {
      throw new BadRequestException(
        `Re-extract requires shopify_storefront platform (got '${store.platformType}')`,
      );
    }

    await this.queueService.enqueueReextractUnmatchedJob({
      storeId: opts.storeId,
      limit: opts.limit,
    });

    return {
      message: 'Reextract-unmatched job enqueued',
      storeId: opts.storeId,
      storeName: store.name,
      limit: opts.limit ?? 5000,
    };
  }

  /**
   * Per-store breakdown of unmatched_cards. Useful for picking targets
   * to retry or to inspect for matching improvements.
   */
  async getUnmatchedStats() {
    return this.dataSource.query(`
      SELECT s.name AS store_name, s.id AS store_id,
        COUNT(DISTINCT uc.product_url_id) AS unmatched_products,
        COUNT(*) AS unmatched_variants,
        COUNT(*) FILTER (WHERE cn.id IS NOT NULL) AS has_card_name,
        COUNT(*) FILTER (WHERE cn.id IS NULL) AS no_card_name,
        COUNT(*) FILTER (WHERE uc.retry_count > 0) AS already_retried
      FROM unmatched_cards uc
      JOIN stores s ON s.id = uc.store_id
      LEFT JOIN card_names cn ON cn.normalized_name = uc.normalized_name
      GROUP BY s.id, s.name
      ORDER BY unmatched_products DESC
    `);
  }
}
