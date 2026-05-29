import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store, QueueService, ExtractionRun } from '@scoutlgs/core';
import type { ExtractionRunTrigger } from '@scoutlgs/core';

export interface ExtractionRunResult {
  extractionRunId: number;
  storesQueued: number;
  storeNames: string[];
  /** ISO timestamp passed to each job's updatedSince, or null for full crawl. */
  updatedSince: string | null;
}

/**
 * Orchestrates batch storefront extraction runs.
 *
 * Picks the active stores opted in via `discoveryConfig.discoveryEnabled`,
 * stamps an `extraction_runs` row to track the wave, and enqueues one
 * `storefront-extraction` job per store. Also owns the incremental cutoff
 * lookup — when called with `incremental: true`, embeds the most recent
 * run's `startedAt` on each job so the Storefront query filters to
 * products modified since then.
 *
 * NOTE: The `ExtractionRun` entity still maps to the `discovery_runs` table
 * (and the FK column on `product_urls` is still `discovery_run_id`) — those
 * names are kept until a follow-up migration renames them.
 */
@Injectable()
export class ExtractionOrchestrator {
  private readonly logger = new Logger(ExtractionOrchestrator.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ExtractionRun)
    private readonly extractionRunRepository: Repository<ExtractionRun>,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Queue storefront extraction jobs for all active opted-in stores.
   * Creates an `extraction_runs` row to track the wave, then enqueues
   * one job per store with the run ID attached.
   *
   * When `incremental` is true, looks up the most recent prior run's
   * `startedAt` and embeds it as `updatedSince` on each enqueued job so
   * the Storefront query filters to products modified after the previous
   * run. Falls through to a full crawl when no prior run exists.
   */
  async queueExtractionForAllStores(
    priority: number = 1,
    options?: {
      skipExtraction?: boolean;
      trigger?: ExtractionRunTrigger;
      incremental?: boolean;
    },
  ): Promise<ExtractionRunResult> {
    const stores = await this.storeRepository.find({
      where: { isActive: true },
    });

    const enabledStores = stores.filter(
      (s) => s.platformType && s.discoveryConfig?.discoveryEnabled,
    );

    const storefrontStores = enabledStores.filter(
      (s) => s.platformType === 'shopify_storefront',
    );

    const targetStores = options?.skipExtraction ? [] : storefrontStores;

    const updatedSince = options?.incremental
      ? await this.resolveIncrementalCutoff()
      : null;

    this.logger.log(
      `Found ${targetStores.length} storefront stores to queue out of ${enabledStores.length} opted-in stores` +
        (options?.skipExtraction ? ' (extraction skipped)' : '') +
        (options?.incremental
          ? updatedSince
            ? ` (incremental since ${updatedSince})`
            : ' (incremental requested but no prior run found; full crawl)'
          : ''),
    );

    const run = this.extractionRunRepository.create({
      status: 'running',
      trigger: options?.trigger ?? 'cron',
      skipExtraction: options?.skipExtraction ?? false,
      storesTotal: targetStores.length,
    });
    const savedRun = await this.extractionRunRepository.save(run);
    this.logger.log(`Created extraction run #${savedRun.id} (trigger: ${savedRun.trigger})`);

    for (const store of targetStores) {
      // V2: enqueue a per-store plan job. The plan probes the store's
      // created_at range and fans out one bucket job per year. This replaces
      // the legacy single-chain id-pagination model which silently lost
      // products due to Shopify's undocumented `id:>X` filter behaviour.
      await this.queueService.enqueueStorefrontPlanJob(store.id, {
        discoveryRunId: savedRun.id,
      });
      this.logger.log(
        `Enqueued storefront plan for store: ${store.name} (ID: ${store.id})`,
      );
    }

    if (updatedSince) {
      this.logger.warn(
        `Incremental mode requested (updatedSince=${updatedSince}) but the bucket flow currently runs full extraction per bucket; incremental filtering is a follow-up.`,
      );
    }

    // Mark the run completed once all jobs are on the queue. "Completed" here
    // means "we successfully kicked off the wave" — individual job results
    // are tracked separately on extractionsSucceeded. This gives us a stable
    // anchor for the incremental cutoff and a non-running status for UI/health.
    await this.extractionRunRepository.update(savedRun.id, {
      status: 'completed',
      completedAt: new Date(),
    });

    return {
      extractionRunId: savedRun.id,
      storesQueued: targetStores.length,
      storeNames: targetStores.map((s) => s.name),
      updatedSince,
    };
  }

  /**
   * Resolve the cutoff for incremental mode: the `startedAt` of the most
   * recent prior run (any status, as long as it ran the full pipeline).
   *
   * We deliberately ignore `status` because Shopify's `updated_at` is
   * monotonic — even if the previous run crashed mid-flight, anything
   * modified since its startedAt is still what we need to re-fetch.
   * Products unchanged at that point are already in our DB from earlier
   * runs and don't need re-fetching.
   *
   * Returns null when no prior run exists (first-ever run falls through
   * to a full crawl).
   */
  async resolveIncrementalCutoff(): Promise<string | null> {
    const previousRun = await this.extractionRunRepository.findOne({
      where: { skipExtraction: false },
      order: { startedAt: 'DESC' },
    });

    return previousRun ? previousRun.startedAt.toISOString() : null;
  }
}
