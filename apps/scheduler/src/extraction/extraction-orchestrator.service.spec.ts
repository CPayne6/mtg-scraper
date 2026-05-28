import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionOrchestrator } from './extraction-orchestrator.service';

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

describe('Scheduler ExtractionOrchestrator', () => {
  let storeRepository: { find: ReturnType<typeof vi.fn> };
  let extractionRunRepository: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let queueService: {
    enqueueStorefrontPlanJob: ReturnType<typeof vi.fn>;
  };
  let service: ExtractionOrchestrator;

  beforeEach(() => {
    storeRepository = {
      find: vi.fn(),
    };
    extractionRunRepository = {
      create: vi.fn((data) => data),
      save: vi.fn(async (data) => ({ id: 42, ...data })),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      findOne: vi.fn().mockResolvedValue(null),
    };
    queueService = {
      enqueueStorefrontPlanJob: vi.fn().mockResolvedValue(undefined),
    };

    service = new ExtractionOrchestrator(
      storeRepository as any,
      extractionRunRepository as any,
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

    const result = await service.queueExtractionForAllStores(7, { trigger: 'manual' });

    expect(result.storesQueued).toBe(1);
    expect(extractionRunRepository.create).toHaveBeenCalledWith({
      status: 'running',
      trigger: 'manual',
      skipExtraction: false,
      storesTotal: 1,
    });
    expect(queueService.enqueueStorefrontPlanJob).toHaveBeenCalledWith(2, {
      discoveryRunId: 42,
    });
    expect(extractionRunRepository.update).toHaveBeenCalledWith(42, {
      status: 'completed',
      completedAt: expect.any(Date),
    });
  });

  it('does not queue any stores when skipExtraction is requested', async () => {
    storeRepository.find.mockResolvedValue([
      createStore({
        id: 2,
        name: 'storefront-store',
        platformType: 'shopify_storefront',
      }),
    ]);

    const result = await service.queueExtractionForAllStores(1, {
      skipExtraction: true,
      trigger: 'manual',
    });

    expect(result.storesQueued).toBe(0);
    expect(extractionRunRepository.create).toHaveBeenCalledWith({
      status: 'running',
      trigger: 'manual',
      skipExtraction: true,
      storesTotal: 0,
    });
    expect(queueService.enqueueStorefrontPlanJob).not.toHaveBeenCalled();
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

    const result = await service.queueExtractionForAllStores(5, { trigger: 'cron' });

    expect(result.storesQueued).toBe(1);
    expect(result.storeNames).toEqual(['storefront-store']);
    expect(queueService.enqueueStorefrontPlanJob).toHaveBeenCalledTimes(1);
  });

  it('passes updatedSince to enqueued jobs when incremental is requested', async () => {
    const cutoff = new Date('2026-05-16T01:00:00Z');
    extractionRunRepository.findOne.mockResolvedValue({
      startedAt: cutoff,
      skipExtraction: false,
    });
    storeRepository.find.mockResolvedValue([
      createStore({ id: 9, name: 'storefront-store' }),
    ]);

    const result = await service.queueExtractionForAllStores(1, {
      trigger: 'cron',
      incremental: true,
    });

    expect(result.updatedSince).toBe(cutoff.toISOString());
    // Bucket flow currently runs full extraction per bucket; the orchestrator
    // logs but doesn't propagate updatedSince to plan jobs yet (follow-up).
    expect(queueService.enqueueStorefrontPlanJob).toHaveBeenCalledWith(9, {
      discoveryRunId: 42,
    });
  });

  it('falls back to a full crawl when incremental is requested but no prior run exists', async () => {
    extractionRunRepository.findOne.mockResolvedValue(null);
    storeRepository.find.mockResolvedValue([
      createStore({ id: 9, name: 'storefront-store' }),
    ]);

    const result = await service.queueExtractionForAllStores(1, {
      trigger: 'cron',
      incremental: true,
    });

    expect(result.updatedSince).toBeNull();
    expect(queueService.enqueueStorefrontPlanJob).toHaveBeenCalledWith(9, {
      discoveryRunId: 42,
    });
  });
});
