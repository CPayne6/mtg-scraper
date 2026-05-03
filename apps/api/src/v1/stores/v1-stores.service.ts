import { Injectable, NotFoundException } from '@nestjs/common';
import { Store, StoreService } from '@scoutlgs/core';

export interface V1StoreResponse {
  uuid: string;
  name: string;
  slug: string;
  displayName: string;
  baseUrl: string;
  logoUrl: string | null;
  platformType: NonNullable<Store['platformType']> | null;
  scraperType: Store['scraperType'];
  isActive: boolean;
  rateLimitPerSecond: number;
  discoveryEnabled: boolean | null;
}

export interface V1StoreListResponse {
  stores: V1StoreResponse[];
}

@Injectable()
export class V1StoresService {
  constructor(private readonly storeService: StoreService) {}

  async listStores(): Promise<V1StoreListResponse> {
    const stores = await this.storeService.findAll();
    return { stores: stores.map((store) => this.mapStore(store)) };
  }

  async getStoreBySlug(slug: string): Promise<V1StoreResponse> {
    const store = await this.storeService.findByName(slug);

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return this.mapStore(store);
  }

  private mapStore(store: Store): V1StoreResponse {
    return {
      uuid: store.uuid,
      name: store.name,
      slug: store.name,
      displayName: store.displayName,
      baseUrl: store.baseUrl,
      logoUrl: store.logoUrl ?? null,
      platformType: store.platformType ?? null,
      scraperType: store.scraperType,
      isActive: store.isActive,
      rateLimitPerSecond: store.rateLimitPerSecond,
      discoveryEnabled: store.discoveryConfig?.discoveryEnabled ?? null,
    };
  }
}
