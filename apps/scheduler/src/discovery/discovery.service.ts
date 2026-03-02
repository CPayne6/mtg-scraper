import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store, QueueService, DiscoveryRun } from '@scoutlgs/core';
import type { DiscoveryRunTrigger } from '@scoutlgs/core';

export interface DiscoveryResult {
  discoveryRunId: number;
  storesQueued: number;
  storeNames: string[];
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(DiscoveryRun)
    private readonly discoveryRunRepository: Repository<DiscoveryRun>,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Queue discovery jobs for all active stores with discovery enabled.
   * Creates a discovery_runs row to track progress, then enqueues jobs
   * with the run ID attached.
   */
  async discoverAllStores(
    priority: number = 1,
    options?: { skipExtraction?: boolean; trigger?: DiscoveryRunTrigger },
  ): Promise<DiscoveryResult> {
    const stores = await this.storeRepository.find({
      where: { isActive: true },
    });

    const discoveryStores = stores.filter(
      (s) => s.platformType && s.discoveryConfig?.discoveryEnabled,
    );

    this.logger.log(
      `Found ${discoveryStores.length} stores with discovery enabled out of ${stores.length} active stores` +
        (options?.skipExtraction ? ' (extraction skipped)' : ''),
    );

    // Create discovery run record
    const run = this.discoveryRunRepository.create({
      status: 'running',
      trigger: options?.trigger ?? 'cron',
      skipExtraction: options?.skipExtraction ?? false,
      storesTotal: discoveryStores.length,
    });
    const savedRun = await this.discoveryRunRepository.save(run);
    this.logger.log(`Created discovery run #${savedRun.id} (trigger: ${savedRun.trigger})`);

    for (const store of discoveryStores) {
      await this.queueService.enqueueDiscoveryJob(store.id, priority, {
        skipExtraction: options?.skipExtraction,
        discoveryRunId: savedRun.id,
      });
      this.logger.log(`Enqueued discovery job for store: ${store.name} (ID: ${store.id})`);
    }

    return {
      discoveryRunId: savedRun.id,
      storesQueued: discoveryStores.length,
      storeNames: discoveryStores.map((s) => s.name),
    };
  }
}
