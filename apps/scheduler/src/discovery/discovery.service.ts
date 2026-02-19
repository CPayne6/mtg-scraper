import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store, QueueService } from '@scoutlgs/core';

export interface DiscoveryResult {
  storesQueued: number;
  storeNames: string[];
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Queue discovery jobs for all active stores with discovery enabled.
   * Heavy I/O (sitemap crawl, validation, extraction enqueue) is done
   * by the scraper's discovery processor via the product-discovery queue.
   */
  async discoverAllStores(priority: number = 1): Promise<DiscoveryResult> {
    const stores = await this.storeRepository.find({
      where: { isActive: true },
    });

    const discoveryStores = stores.filter(
      (s) => s.platformType && s.discoveryConfig?.discoveryEnabled,
    );

    this.logger.log(
      `Found ${discoveryStores.length} stores with discovery enabled out of ${stores.length} active stores`,
    );

    for (const store of discoveryStores) {
      await this.queueService.enqueueDiscoveryJob(store.id, priority);
      this.logger.log(`Enqueued discovery job for store: ${store.name} (ID: ${store.id})`);
    }

    return {
      storesQueued: discoveryStores.length,
      storeNames: discoveryStores.map((s) => s.name),
    };
  }
}
