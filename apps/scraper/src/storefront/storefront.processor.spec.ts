import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Job } from 'bullmq';
import { StorefrontProcessor } from './storefront.processor';
import { ExtractionService } from '../extraction/extraction.service';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  CardName,
  PlatformAdapterFactory,
} from '@scoutlgs/core';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  type StorefrontPlanJobData,
  type StorefrontPrefixJobData,
} from '@scoutlgs/shared';
import type { ExtractedCardVariant } from '@scoutlgs/core';

// --- Mock helpers ---

function createMockStore(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'test-store',
    platformType: 'shopify_storefront',
    baseUrl: 'https://test-store.com',
    discoveryConfig: { mtgSinglesCollectionId: 10 },
    scraperConfig: { storefrontScope: 'product_type:"MTG Single"' },
    ...overrides,
  };
}

function createMockCollection(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 10,
    slug: 'mtg-singles',
    ...overrides,
  };
}

function createMockVariant(
  overrides: Partial<ExtractedCardVariant> = {},
): ExtractedCardVariant {
  return {
    cardName: 'Lightning Bolt',
    setName: 'Magic 2010',
    condition: 'NM' as any,
    foil: false,
    price: 1.99,
    currency: 'CAD',
    inStock: true,
    quantity: 4,
    imageUrl: 'https://example.com/img.jpg',
    productUrl: 'https://test-store.com/products/lightning-bolt',
    sku: 'MTG-LB-001',
    platformVariantId: '12345',
    ...overrides,
  };
}

function createMockProduct(handle: string, variants?: ExtractedCardVariant[]) {
  return {
    handle,
    updatedAt: new Date('2025-01-01'),
    variants: variants ?? [
      createMockVariant({
        productUrl: `https://test-store.com/products/${handle}`,
      }),
    ],
  };
}

function createMockProductUrl(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 100,
    storeId: 1,
    handle: 'test-product',
    sitemapLastmod: new Date('2025-01-01'),
    lastExtractedAt: null as Date | null,
    extractionStatus: 'pending',
    ...overrides,
  };
}

function createPlanJob(data: StorefrontPlanJobData): Job<StorefrontPlanJobData> {
  return {
    id: 'plan-1',
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<StorefrontPlanJobData>;
}

function createPrefixJob(
  data: StorefrontPrefixJobData,
): Job<StorefrontPrefixJobData> {
  return {
    id: 'prefix-1',
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<StorefrontPrefixJobData>;
}

/**
 * Create a mock StorefrontExtractionAdapter with an extractByProductsQuery
 * async generator that yields the given products.
 */
function createMockAdapter(
  products: Array<{
    handle: string;
    updatedAt: Date;
    variants: ExtractedCardVariant[];
  }>,
) {
  return {
    extractByProductsQuery: vi.fn().mockImplementation(async function* () {
      for (const product of products) {
        yield product;
      }
    }),
  };
}

/**
 * Create a mock adapter whose generator throws after yielding some products.
 */
function createMockAdapterWithError(
  productsBefore: Array<{
    handle: string;
    updatedAt: Date;
    variants: ExtractedCardVariant[];
  }>,
  error: Error,
) {
  return {
    extractByProductsQuery: vi.fn().mockImplementation(async function* () {
      for (const product of productsBefore) {
        yield product;
      }
      throw error;
    }),
  };
}

// --- Tests ---

describe('StorefrontProcessor', () => {
  let processor: StorefrontProcessor;
  let storeRepository: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let productUrlRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let collectionRepository: { findOne: ReturnType<typeof vi.fn> };
  let cardNameRepository: {
    find: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let storefrontQueue: { addBulk: ReturnType<typeof vi.fn> };
  let platformAdapterFactory: {
    getExtractionAdapter: ReturnType<typeof vi.fn>;
  };
  let extractionService: {
    processExtractedVariants: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    storeRepository = { findOne: vi.fn() };
    productUrlRepository = {
      findOne: vi.fn(),
      create: vi.fn((data: unknown) => data),
      save: vi
        .fn()
        .mockImplementation((entity: unknown) =>
          Promise.resolve({ id: 100, ...(entity as object) }),
        ),
    };
    collectionRepository = { findOne: vi.fn() };
    cardNameRepository = {
      find: vi.fn(),
      query: vi.fn(),
    };
    storefrontQueue = { addBulk: vi.fn().mockResolvedValue(undefined) };
    platformAdapterFactory = { getExtractionAdapter: vi.fn() };
    extractionService = { processExtractedVariants: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontProcessor,
        { provide: getRepositoryToken(Store), useValue: storeRepository },
        {
          provide: getRepositoryToken(ProductUrl),
          useValue: productUrlRepository,
        },
        {
          provide: getRepositoryToken(MtgSinglesCollection),
          useValue: collectionRepository,
        },
        {
          provide: getRepositoryToken(CardName),
          useValue: cardNameRepository,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.STOREFRONT_EXTRACTION),
          useValue: storefrontQueue,
        },
        {
          provide: PlatformAdapterFactory,
          useValue: platformAdapterFactory,
        },
        { provide: ExtractionService, useValue: extractionService },
      ],
    }).compile();

    processor = module.get<StorefrontProcessor>(StorefrontProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // processPlan
  // -------------------------------------------------------------------------
  describe('processPlan', () => {
    it('should throw when store is not found', async () => {
      storeRepository.findOne.mockResolvedValue(null);
      const job = createPlanJob({ storeId: 999 });
      await expect(processor.processPlan(job)).rejects.toThrow(
        'Store 999 not found',
      );
    });

    it('should throw when storefrontScope is missing', async () => {
      storeRepository.findOne.mockResolvedValue(
        createMockStore({ scraperConfig: {} }),
      );
      const job = createPlanJob({ storeId: 1 });
      await expect(processor.processPlan(job)).rejects.toThrow(
        'missing scraperConfig.storefrontScope',
      );
    });

    it('should enqueue one prefix job per alpha letter', async () => {
      storeRepository.findOne.mockResolvedValue(createMockStore());
      cardNameRepository.query.mockResolvedValue([
        { prefix: 'a' },
        { prefix: 'b' },
        { prefix: 'c' },
      ]);

      const job = createPlanJob({
        storeId: 1,
        discoveryRunId: 42,
        maxCardsAdded: 500,
      });
      await processor.processPlan(job);

      expect(storefrontQueue.addBulk).toHaveBeenCalledTimes(1);
      const bulkJobs = storefrontQueue.addBulk.mock.calls[0][0];
      expect(bulkJobs).toHaveLength(3);

      for (let i = 0; i < 3; i++) {
        expect(bulkJobs[i].name).toBe(JOB_NAMES.STOREFRONT_PREFIX);
        expect(bulkJobs[i].data.storeId).toBe(1);
        expect(bulkJobs[i].data.scope).toBe('product_type:"MTG Single"');
        expect(bulkJobs[i].data.depth).toBe(1);
        expect(bulkJobs[i].data.discoveryRunId).toBe(42);
        expect(bulkJobs[i].data.maxCardsAdded).toBe(500);
      }
      expect(bulkJobs[0].data.prefix).toBe('a');
      expect(bulkJobs[1].data.prefix).toBe('b');
      expect(bulkJobs[2].data.prefix).toBe('c');
    });

    it('should enqueue a single non-alpha job when non-alpha prefixes exist', async () => {
      storeRepository.findOne.mockResolvedValue(createMockStore());
      cardNameRepository.query.mockResolvedValue([
        { prefix: '1' },
        { prefix: 'a' },
        { prefix: 'b' },
      ]);

      const job = createPlanJob({ storeId: 1 });
      await processor.processPlan(job);

      const bulkJobs = storefrontQueue.addBulk.mock.calls[0][0];
      // 2 alpha + 1 non-alpha
      expect(bulkJobs).toHaveLength(3);
      expect(bulkJobs[0].data.prefix).toBe('a');
      expect(bulkJobs[1].data.prefix).toBe('b');
      expect(bulkJobs[2].data.prefix).toBe('__nonalpha__');
    });

    it('should not call addBulk when no prefixes exist', async () => {
      storeRepository.findOne.mockResolvedValue(createMockStore());
      cardNameRepository.query.mockResolvedValue([]);

      const job = createPlanJob({ storeId: 1 });
      await processor.processPlan(job);

      expect(storefrontQueue.addBulk).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processPrefix
  // -------------------------------------------------------------------------
  describe('processPrefix', () => {
    const defaultPrefixData: StorefrontPrefixJobData = {
      storeId: 1,
      prefix: 'a',
      scope: 'product_type:"MTG Single"',
      depth: 1,
      discoveryRunId: 42,
    };

    it('should throw when store is not found', async () => {
      storeRepository.findOne.mockResolvedValue(null);
      const job = createPrefixJob({ ...defaultPrefixData, storeId: 999 });
      await expect(processor.processPrefix(job)).rejects.toThrow(
        'Store 999 not found',
      );
    });

    it('should process all products yielded by the adapter', async () => {
      const store = createMockStore();
      const collection = createMockCollection();
      const products = [
        createMockProduct('product-a'),
        createMockProduct('product-b'),
        createMockProduct('product-c'),
      ];
      const adapter = createMockAdapter(products);

      storeRepository.findOne.mockResolvedValue(store);
      collectionRepository.findOne.mockResolvedValue(collection);
      platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);
      productUrlRepository.findOne.mockResolvedValue(null);
      extractionService.processExtractedVariants.mockResolvedValue({
        variantsExtracted: 1,
        cardsUpserted: 1,
        success: true,
      });

      const job = createPrefixJob(defaultPrefixData);
      const result = await processor.processPrefix(job);

      expect(result.success).toBe(true);
      expect(result.prefix).toBe('a');
      expect(result.productsProcessed).toBe(3);
      expect(result.cardsAdded).toBe(3);
      expect(result.errors).toBe(0);
      expect(result.wasSplit).toBe(false);
      expect(extractionService.processExtractedVariants).toHaveBeenCalledTimes(
        3,
      );

      // Verify query passed to adapter
      expect(adapter.extractByProductsQuery).toHaveBeenCalledWith(
        store,
        'product_type:"MTG Single" title:a*',
      );
    });

    it('should build correct query for non-alpha prefix', async () => {
      const store = createMockStore();
      const collection = createMockCollection();
      const adapter = createMockAdapter([]);

      storeRepository.findOne.mockResolvedValue(store);
      collectionRepository.findOne.mockResolvedValue(collection);
      platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);

      // Mock the buildQuery DB call for non-alpha names
      cardNameRepository.query.mockResolvedValue([
        { name: '1996 World Champion' },
        { name: '+2 Mace' },
      ]);

      const job = createPrefixJob({
        ...defaultPrefixData,
        prefix: '__nonalpha__',
      });
      const result = await processor.processPrefix(job);

      expect(adapter.extractByProductsQuery).toHaveBeenCalledWith(
        store,
        'product_type:"MTG Single" title:"1996 World Champion" OR title:"+2 Mace"',
      );
      expect(result.success).toBe(true);
    });

    it('should continue processing when individual products fail', async () => {
      const store = createMockStore();
      const collection = createMockCollection();
      const products = [
        createMockProduct('product-1'),
        createMockProduct('product-2-fails'),
        createMockProduct('product-3'),
      ];
      const adapter = createMockAdapter(products);

      storeRepository.findOne.mockResolvedValue(store);
      collectionRepository.findOne.mockResolvedValue(collection);
      platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);
      productUrlRepository.findOne.mockResolvedValue(null);

      extractionService.processExtractedVariants
        .mockResolvedValueOnce({
          variantsExtracted: 1,
          cardsUpserted: 1,
          success: true,
        })
        .mockRejectedValueOnce(new Error('Extraction failed'))
        .mockResolvedValueOnce({
          variantsExtracted: 1,
          cardsUpserted: 1,
          success: true,
        });

      const job = createPrefixJob(defaultPrefixData);
      const result = await processor.processPrefix(job);

      expect(result.success).toBe(true);
      expect(result.productsProcessed).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.cardsAdded).toBe(2);
    });

    describe('25K pagination limit splitting', () => {
      it('should split into sub-prefix jobs when 25K limit is hit', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const productsBeforeError = [
          createMockProduct('product-before-error'),
        ];
        const adapter = createMockAdapterWithError(
          productsBeforeError,
          new Error(
            'GraphQL errors from test-store: Platform limit for pagination reached',
          ),
        );

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);
        productUrlRepository.findOne.mockResolvedValue(null);
        extractionService.processExtractedVariants.mockResolvedValue({
          variantsExtracted: 1,
          cardsUpserted: 1,
          success: true,
        });

        // Mock sub-prefix query
        cardNameRepository.query.mockResolvedValue([
          { prefix: 'ab' },
          { prefix: 'ac' },
          { prefix: 'ad' },
        ]);

        const job = createPrefixJob(defaultPrefixData);
        const result = await processor.processPrefix(job);

        expect(result.wasSplit).toBe(true);
        expect(result.productsProcessed).toBe(1); // partial results before error

        // Should have enqueued sub-prefix jobs
        expect(storefrontQueue.addBulk).toHaveBeenCalledTimes(1);
        const bulkJobs = storefrontQueue.addBulk.mock.calls[0][0];
        expect(bulkJobs).toHaveLength(3);
        expect(bulkJobs[0].data.prefix).toBe('ab');
        expect(bulkJobs[0].data.depth).toBe(2);
        expect(bulkJobs[1].data.prefix).toBe('ac');
        expect(bulkJobs[2].data.prefix).toBe('ad');
      });

      it('should stop splitting at max depth 3', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const adapter = createMockAdapterWithError(
          [],
          new Error(
            'GraphQL errors from test-store: Platform limit for pagination reached',
          ),
        );

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);

        const job = createPrefixJob({
          ...defaultPrefixData,
          prefix: 'abc',
          depth: 3,
        });
        const result = await processor.processPrefix(job);

        // Should NOT have enqueued sub-prefix jobs
        expect(storefrontQueue.addBulk).not.toHaveBeenCalled();
        expect(result.wasSplit).toBe(false);
        expect(result.error).toContain('25K pagination limit at max depth 3');
      });

      it('should rethrow non-pagination errors', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const adapter = createMockAdapterWithError(
          [],
          new Error('Network timeout'),
        );

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);

        const job = createPrefixJob(defaultPrefixData);

        await expect(processor.processPrefix(job)).rejects.toThrow(
          'Network timeout',
        );
      });
    });

    describe('upsertProductUrl', () => {
      it('should create a new product URL when one does not exist', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const products = [createMockProduct('new-product')];
        const adapter = createMockAdapter(products);

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);
        productUrlRepository.findOne.mockResolvedValue(null);
        extractionService.processExtractedVariants.mockResolvedValue({
          variantsExtracted: 1,
          cardsUpserted: 1,
          success: true,
        });

        const job = createPrefixJob(defaultPrefixData);
        await processor.processPrefix(job);

        expect(productUrlRepository.create).toHaveBeenCalledWith({
          storeId: 1,
          handle: 'new-product',
          mtgSinglesCollectionId: 10,
          sitemapLastmod: new Date('2025-01-01'),
          extractionStatus: 'pending',
        });
        expect(productUrlRepository.save).toHaveBeenCalled();
      });

      it('should update sitemapLastmod when product URL already exists', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const products = [createMockProduct('existing-product')];
        const adapter = createMockAdapter(products);

        const existingProductUrl = createMockProductUrl({
          handle: 'existing-product',
          sitemapLastmod: new Date('2024-01-01'),
        });

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);
        productUrlRepository.findOne.mockResolvedValue(existingProductUrl);
        extractionService.processExtractedVariants.mockResolvedValue({
          variantsExtracted: 1,
          cardsUpserted: 1,
          success: true,
        });

        const job = createPrefixJob(defaultPrefixData);
        await processor.processPrefix(job);

        expect(existingProductUrl.sitemapLastmod).toEqual(
          new Date('2025-01-01'),
        );
        expect(productUrlRepository.save).toHaveBeenCalledWith(
          existingProductUrl,
        );
        expect(productUrlRepository.create).not.toHaveBeenCalled();
      });
    });

    describe('result shape', () => {
      it('should return correct result structure on success', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const products = [createMockProduct('product-a')];
        const adapter = createMockAdapter(products);

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);
        productUrlRepository.findOne.mockResolvedValue(null);
        extractionService.processExtractedVariants.mockResolvedValue({
          variantsExtracted: 5,
          cardsUpserted: 2,
          success: true,
        });

        const job = createPrefixJob(defaultPrefixData);
        const result = await processor.processPrefix(job);

        expect(result).toEqual({
          storeId: 1,
          prefix: 'a',
          productsProcessed: 1,
          cardsAdded: 2,
          errors: 0,
          wasSplit: false,
          success: true,
        });
      });

      it('should return zero counts when no products match the prefix', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const adapter = createMockAdapter([]);

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);

        const job = createPrefixJob(defaultPrefixData);
        const result = await processor.processPrefix(job);

        expect(result).toEqual({
          storeId: 1,
          prefix: 'a',
          productsProcessed: 0,
          cardsAdded: 0,
          errors: 0,
          wasSplit: false,
          success: true,
        });
        expect(
          extractionService.processExtractedVariants,
        ).not.toHaveBeenCalled();
      });
    });
  });
});
