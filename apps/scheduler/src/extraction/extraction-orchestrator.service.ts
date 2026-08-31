import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Store, QueueService, ExtractionRun, StoreSyncState } from '@scoutlgs/core';
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
    @InjectRepository(StoreSyncState)
    private readonly storeSyncStateRepository: Repository<StoreSyncState>,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Dispatch only stores whose individual 24-hour window is due. Initial
   * windows are deterministically spread across the day, and the conditional
   * update is the cross-replica claim that prevents duplicate plan jobs.
   */
  async queueDueStorefrontStores(maxConcurrentStores = 4): Promise<number> {
    const stores = (await this.storeRepository.find({ where: { isActive: true } }))
      .filter((store) => store.platformType === 'shopify_storefront' && store.discoveryConfig?.discoveryEnabled);
    const now = new Date();
    const activeStoreIds = await this.queueService.getActiveStorefrontCrawlStoreIds();
    let queued = 0;

    for (const store of stores) {
      if (activeStoreIds.size >= maxConcurrentStores) break;
      if (activeStoreIds.has(store.id)) continue;
      let state = await this.storeSyncStateRepository.findOne({ where: { storeId: store.id } });
      if (!state) {
        const slotMs = (store.id * 1_103_515_245) % (24 * 60 * 60 * 1000);
        state = await this.storeSyncStateRepository.save(this.storeSyncStateRepository.create({
          storeId: store.id,
          nextSyncAt: new Date(now.getTime() + slotMs),
          lastEnqueuedAt: null,
          lastSuccessfulAt: null,
          lastError: null,
        }));
      }
      if (state.nextSyncAt > now) continue;
      const claimed = await this.storeSyncStateRepository.update(
        { storeId: store.id, nextSyncAt: LessThanOrEqual(now) },
        { nextSyncAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), lastEnqueuedAt: now, lastError: null },
      );
      if (!claimed.affected) continue;
      if (await this.queueService.enqueueStorefrontPlanJob(store.id)) {
        activeStoreIds.add(store.id);
        queued++;
      }
    }
    return queued;
  }

  /**
   * Queue storefront extraction jobs for all active opted-in stores.
   * Creates an `extraction_runs` row to track the wave, then enqueues
 * one job per store with the run ID attached. Shopify `updatedAt` is never
 * used as a cursor: every run uses the exhaustive created_at bucket flow.
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

    // Storefront updatedAt is diagnostic only; complete created_at traversal
    // is the correctness path and must never be replaced by a delta cursor.
    const updatedSince = null;

    this.logger.log(
      `Found ${targetStores.length} storefront stores to queue out of ${enabledStores.length} opted-in stores` +
        (options?.skipExtraction ? ' (extraction skipped)' : '') +
        (options?.incremental ? ' (incremental request treated as a full traversal)' : ''),
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
      // Enqueue a per-store plan job. It probes the created_at range and
      // fans out one cursor-paginated bucket job per year.
      await this.queueService.enqueueStorefrontPlanJob(store.id, {
        discoveryRunId: savedRun.id,
      });
      this.logger.log(
        `Enqueued storefront plan for store: ${store.name} (ID: ${store.id})`,
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

}
