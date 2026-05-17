import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoveryService } from './discovery.service';

function createStore(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'test-store',
    isActive: true,
    platformType: 'shopify_storefront',
    discoveryConfig: {
      discoveryEnabled: true,
      mtgSinglesCollectionId: 1,
    },
    ...overrides,
  };
}

describe('Scheduler DiscoveryService', () => {
  let storeRepository: { find: ReturnType<typeof vi.fn> };
  let discoveryRunRepository: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let queueService: {
    enqueueStorefrontExtractionJob: ReturnType<typeof vi.fn>;
  };
  let service: DiscoveryService;

  beforeEach(() => {
    storeRepository = {
      find: vi.fn(),
    };
    discoveryRunRepository = {
      create: vi.fn((data) => data),
      save: vi.fn(async (data) => ({ id: 42, ...data })),
    };
    queueService = {
      enqueueStorefrontExtractionJob: vi.fn().mockResolvedValue(undefined),
    };

    service = new DiscoveryService(
      storeRepository as any,
      discoveryRunRepository as any,
      queueService as any,
    );
  });

  it('routes shopify_storefront stores to the Storefront extraction queue', async () => {
    storeRepository.find.mockResolvedValue([
      createStore({
        id: 2,
        name: 'storefront-store',
        platformType: 'shopify_storefront',
      }),
    ]);

    const result = await service.discoverAllStores(7, { trigger: 'manual' });

    expect(result.storesQueued).toBe(1);
    expect(discoveryRunRepository.create).toHaveBeenCalledWith({
      status: 'running',
      trigger: 'manual',
      skipExtraction: false,
      storesTotal: 1,
    });
    expect(queueService.enqueueStorefrontExtractionJob).toHaveBeenCalledWith(
      2,
      7,
      42,
    );
  });

  it('does not queue any stores when skipExtraction is requested', async () => {
    storeRepository.find.mockResolvedValue([
      createStore({
        id: 2,
        name: 'storefront-store',
        platformType: 'shopify_storefront',
      }),
    ]);

    const result = await service.discoverAllStores(1, {
      skipExtraction: true,
      trigger: 'manual',
    });

    expect(result.storesQueued).toBe(0);
    expect(discoveryRunRepository.create).toHaveBeenCalledWith({
      status: 'running',
      trigger: 'manual',
      skipExtraction: true,
      storesTotal: 0,
    });
    expect(queueService.enqueueStorefrontExtractionJob).not.toHaveBeenCalled();
  });

  it('ignores non-storefront stores', async () => {
    storeRepository.find.mockResolvedValue([
      createStore({ id: 1, name: 'shopify-store', platformType: 'shopify' }),
      createStore({
        id: 2,
        name: 'storefront-store',
        platformType: 'shopify_storefront',
      }),
    ]);

    const result = await service.discoverAllStores(5, { trigger: 'cron' });

    expect(result.storesQueued).toBe(1);
    expect(result.storeNames).toEqual(['storefront-store']);
    expect(queueService.enqueueStorefrontExtractionJob).toHaveBeenCalledTimes(1);
  });
});
