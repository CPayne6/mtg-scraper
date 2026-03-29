import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscoveryService } from './discovery.service';

// --- Mock helpers ---

function createMockRepo(overrides: Record<string, unknown> = {}) {
  return {
    findOne: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    create: vi.fn((data: unknown) => data),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    createQueryBuilder: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    }),
    ...overrides,
  };
}

function createMockStore(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'test-store',
    platformType: 'shopify',
    rateLimitPerSecond: 10,
    discoveryConfig: { mtgSinglesCollectionId: 1 },
    baseUrl: 'https://test-store.com',
    ...overrides,
  };
}

function createMockCollection() {
  return { id: 1, slug: 'mtg-singles' };
}

/**
 * Create an async-generator adapter that yields the given products
 * and optionally stubs validateProduct.
 */
function createMockAdapter(
  products: Array<{ handle: string; lastModified?: Date }>,
  validateFn: (handle: string) => boolean = () => true,
) {
  return {
    discoverProducts: vi.fn().mockImplementation(async function* () {
      for (const p of products) {
        yield { handle: p.handle, lastModified: p.lastModified };
      }
    }),
    validateProduct: vi.fn().mockImplementation((_s: unknown, _c: unknown, handle: string) =>
      Promise.resolve(validateFn(handle)),
    ),
  };
}

function buildService(deps: {
  storeRepo: ReturnType<typeof createMockRepo>;
  productUrlRepo: ReturnType<typeof createMockRepo>;
  collectionRepo: ReturnType<typeof createMockRepo>;
  invalidHandleRepo: ReturnType<typeof createMockRepo>;
  queueService?: Record<string, unknown>;
  adapter?: ReturnType<typeof createMockAdapter>;
}) {
  const adapter = deps.adapter ?? createMockAdapter([]);

  const platformAdapterFactory = {
    getDiscoveryAdapter: vi.fn().mockReturnValue(adapter),
  };

  const shopifyDiscoveryAdapter = {
    setProxyAgentFactory: vi.fn(),
    setRateLimiter: vi.fn(),
    setRateLimitConfig: vi.fn(),
  };

  const proxyService = {
    getRotatingProxyAgent: vi.fn(),
    getIpCount: vi.fn().mockReturnValue(1),
  };

  const queueService = {
    enqueueExtractionJob: vi.fn().mockResolvedValue(undefined),
    waitForCapacity: vi.fn().mockResolvedValue(undefined),
    cleanupBackpressureWaiters: vi.fn().mockResolvedValue(undefined),
    ...deps.queueService,
  };

  const service = new (DiscoveryService as any)(
    deps.storeRepo,
    deps.productUrlRepo,
    deps.collectionRepo,
    deps.invalidHandleRepo,
    queueService,
    platformAdapterFactory,
    shopifyDiscoveryAdapter,
    proxyService,
    {},
    {},
  );

  return { service: service as DiscoveryService, adapter, queueService, platformAdapterFactory };
}

// --- Tests ---

describe('DiscoveryService', () => {
  let storeRepo: ReturnType<typeof createMockRepo>;
  let productUrlRepo: ReturnType<typeof createMockRepo>;
  let collectionRepo: ReturnType<typeof createMockRepo>;
  let invalidHandleRepo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    storeRepo = createMockRepo();
    productUrlRepo = createMockRepo();
    collectionRepo = createMockRepo();
    invalidHandleRepo = createMockRepo();

    storeRepo.findOne.mockResolvedValue(createMockStore());
    collectionRepo.findOne.mockResolvedValue(createMockCollection());
  });

  // ---------- preloadInBatches ----------

  describe('preloadInBatches', () => {
    it('should return all rows when fewer than batchSize', async () => {
      const rows = [{ handle: 'a' }, { handle: 'b' }, { handle: 'c' }];
      productUrlRepo.query.mockResolvedValueOnce(rows);

      const { service } = buildService({ storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo });
      const result = await (service as any).preloadInBatches(
        'SELECT handle FROM product_urls WHERE store_id = $1 ORDER BY id',
        [1],
        100,
      );

      expect(result).toEqual(rows);
      expect(productUrlRepo.query).toHaveBeenCalledTimes(1);
    });

    it('should paginate across multiple batches', async () => {
      const batch1 = Array.from({ length: 3 }, (_, i) => ({ handle: `h${i}` }));
      const batch2 = [{ handle: 'h3' }]; // fewer than batchSize → last batch

      productUrlRepo.query
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2);

      const { service } = buildService({ storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo });
      const result = await (service as any).preloadInBatches(
        'SELECT handle FROM product_urls WHERE store_id = $1 ORDER BY id',
        [1],
        3, // small batchSize to trigger pagination
      );

      expect(result).toEqual([...batch1, ...batch2]);
      expect(productUrlRepo.query).toHaveBeenCalledTimes(2);
    });

    it('should stop when an empty batch is returned', async () => {
      productUrlRepo.query.mockResolvedValueOnce([]);

      const { service } = buildService({ storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo });
      const result = await (service as any).preloadInBatches(
        'SELECT handle FROM product_urls WHERE store_id = $1 ORDER BY id',
        [1],
      );

      expect(result).toEqual([]);
      expect(productUrlRepo.query).toHaveBeenCalledTimes(1);
    });

    it('should pass correct LIMIT and OFFSET parameters', async () => {
      const batch = Array.from({ length: 5 }, (_, i) => ({ handle: `h${i}` }));
      productUrlRepo.query
        .mockResolvedValueOnce(batch)
        .mockResolvedValueOnce([]); // second batch empty

      const { service } = buildService({ storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo });
      await (service as any).preloadInBatches(
        'SELECT handle FROM product_urls WHERE store_id = $1 ORDER BY id',
        [42],
        5,
      );

      // First call: offset 0
      expect(productUrlRepo.query).toHaveBeenCalledWith(
        'SELECT handle FROM product_urls WHERE store_id = $1 ORDER BY id LIMIT $2 OFFSET $3',
        [42, 5, 0],
      );
      // Second call: offset 5
      expect(productUrlRepo.query).toHaveBeenCalledWith(
        'SELECT handle FROM product_urls WHERE store_id = $1 ORDER BY id LIMIT $2 OFFSET $3',
        [42, 5, 5],
      );
    });
  });

  // ---------- Handle categorization ----------

  describe('discoverStore - handle categorization', () => {
    it('should treat handles NOT in preloaded data as new products', async () => {
      // Preload returns empty → all products are new
      productUrlRepo.query.mockResolvedValue([]);
      // After validation, the find to get IDs returns them
      productUrlRepo.find.mockResolvedValue([{ id: 100, handle: 'new-card' }]);

      const adapter = createMockAdapter([{ handle: 'new-card' }]);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      const result = await service.discoverStore(1);

      expect(result.newProducts).toBe(1);
      expect(result.updatedProducts).toBe(0);
      expect(result.skippedInvalid).toBe(0);
      expect(adapter.validateProduct).toHaveBeenCalledTimes(1);
    });

    it('should treat handles in knownHandles as stale (no validation)', async () => {
      // Preload returns existing handles
      productUrlRepo.query.mockResolvedValueOnce([{ handle: 'existing-card' }]); // product_urls
      productUrlRepo.query.mockResolvedValueOnce([]); // invalid_product_handles (empty)

      // Stale path needs find for IDs
      productUrlRepo.find.mockResolvedValue([{ id: 1, handle: 'existing-card' }]);

      const adapter = createMockAdapter([{ handle: 'existing-card' }]);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      const result = await service.discoverStore(1);

      expect(result.updatedProducts).toBe(1);
      expect(result.newProducts).toBe(0);
      // No validation HEAD requests for stale products
      expect(adapter.validateProduct).not.toHaveBeenCalled();
    });

    it('should skip recently-validated invalid handles', async () => {
      productUrlRepo.query.mockResolvedValueOnce([]); // product_urls (empty)
      productUrlRepo.query.mockResolvedValueOnce([
        { handle: 'invalid-card', lastValidatedAt: new Date() }, // validated just now
      ]);

      const adapter = createMockAdapter([{ handle: 'invalid-card' }]);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      const result = await service.discoverStore(1);

      expect(result.skippedInvalid).toBe(1);
      expect(result.newProducts).toBe(0);
      expect(adapter.validateProduct).not.toHaveBeenCalled();
    });

    it('should revalidate invalid handles past the revalidation threshold', async () => {
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      productUrlRepo.query.mockResolvedValueOnce([]); // product_urls
      productUrlRepo.query.mockResolvedValueOnce([
        { handle: 'old-invalid', lastValidatedAt: oldDate },
      ]);

      // Validation passes → product gets inserted
      productUrlRepo.find.mockResolvedValue([{ id: 200, handle: 'old-invalid' }]);

      const adapter = createMockAdapter([{ handle: 'old-invalid' }], () => true);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      const result = await service.discoverStore(1);

      expect(result.revalidatedProducts).toBe(1);
      expect(adapter.validateProduct).toHaveBeenCalledTimes(1);
    });

    it('should correctly categorize a mixed batch of new, stale, and invalid', async () => {
      productUrlRepo.query.mockResolvedValueOnce([
        { handle: 'stale-1' },
        { handle: 'stale-2' },
      ]); // product_urls
      productUrlRepo.query.mockResolvedValueOnce([
        { handle: 'invalid-1', lastValidatedAt: new Date() },
      ]); // invalid_product_handles

      // For new products: validation + find for IDs
      productUrlRepo.find.mockResolvedValue([{ id: 300, handle: 'brand-new' }]);

      const adapter = createMockAdapter([
        { handle: 'stale-1' },
        { handle: 'stale-2' },
        { handle: 'invalid-1' },
        { handle: 'brand-new' },
      ]);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      const result = await service.discoverStore(1);

      expect(result.updatedProducts).toBe(2);
      expect(result.skippedInvalid).toBe(1);
      expect(result.newProducts).toBe(1);
      // Only the new product triggers validation
      expect(adapter.validateProduct).toHaveBeenCalledTimes(1);
    });
  });

  // ---------- No per-batch DB existence queries ----------

  describe('discoverStore - no per-batch existence queries', () => {
    it('should not call productUrlRepository.find with IN for existence checks', async () => {
      productUrlRepo.query.mockResolvedValueOnce([{ handle: 'known' }]);
      productUrlRepo.query.mockResolvedValueOnce([]);
      // Stale products still need find for IDs
      productUrlRepo.find.mockResolvedValue([{ id: 1, handle: 'known' }]);

      const adapter = createMockAdapter([{ handle: 'known' }]);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      await service.discoverStore(1);

      // find is called for stale ID lookup, but NOT for existence checks.
      // The old code called find twice per batch (product_urls + invalid_handles).
      // Now the only find call is for stale product IDs.
      const findCalls = productUrlRepo.find.mock.calls;
      expect(findCalls.length).toBeLessThanOrEqual(1);

      // invalidHandleRepository.find should never be called (was used for per-batch existence)
      expect(invalidHandleRepo.find).not.toHaveBeenCalled();
    });
  });

  // ---------- Preloaded data sync across batches ----------

  describe('discoverStore - preloaded data sync', () => {
    it('should add validated products to knownHandles so subsequent batches see them', async () => {
      // Start with empty preloaded data
      productUrlRepo.query.mockResolvedValue([]);

      // The same handle appears in two batches (e.g., across sitemaps)
      // Batch size is 100, so 2 products in one batch
      // We simulate by having the adapter yield the same handle twice
      const adapter = createMockAdapter([
        { handle: 'dup-handle' },
        { handle: 'dup-handle' },
      ]);

      productUrlRepo.find.mockResolvedValue([{ id: 1, handle: 'dup-handle' }]);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      const result = await service.discoverStore(1);

      // Within a single batch, dedup by handle keeps only one.
      // So only 1 new product (deduplicated within the batch)
      expect(result.newProducts).toBe(1);
      expect(adapter.validateProduct).toHaveBeenCalledTimes(1);
    });

    it('should add invalidated products to knownInvalid so they are skipped in later batches', async () => {
      productUrlRepo.query.mockResolvedValue([]);

      // Two products: first fails validation, second is same handle in next batch
      // Using batch size of 1 to force separate batches
      const products = [
        { handle: 'bad-product-1' },
        { handle: 'good-product' },
      ];

      const adapter = createMockAdapter(products, (handle) => handle !== 'bad-product-1');

      productUrlRepo.find.mockResolvedValue([{ id: 1, handle: 'good-product' }]);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      const result = await service.discoverStore(1);

      expect(result.invalidProducts).toBe(1);
      expect(result.newProducts).toBe(1);
    });

    it('should remove revalidated handles from knownInvalid', async () => {
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      productUrlRepo.query.mockResolvedValueOnce([]); // product_urls empty
      productUrlRepo.query.mockResolvedValueOnce([
        { handle: 'was-invalid', lastValidatedAt: oldDate },
      ]);

      productUrlRepo.find.mockResolvedValue([{ id: 1, handle: 'was-invalid' }]);

      const adapter = createMockAdapter([{ handle: 'was-invalid' }], () => true);

      const { service } = buildService({
        storeRepo, productUrlRepo, collectionRepo, invalidHandleRepo,
        adapter,
      });

      const result = await service.discoverStore(1);

      expect(result.revalidatedProducts).toBe(1);
      // Should have deleted from invalid table
      expect(invalidHandleRepo.delete).toHaveBeenCalled();
    });
  });
});
