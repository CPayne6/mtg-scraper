import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { StorefrontProcessor } from './storefront.processor';
import { ExtractionService } from '../extraction/extraction.service';
import { Store, ProductUrl, MtgSinglesCollection, PlatformAdapterFactory } from '@scoutlgs/core';
import type { StorefrontExtractionJobData } from '@scoutlgs/shared';
import type { ExtractedCardVariant } from '@scoutlgs/core';

// --- Mock helpers ---

function createMockStore(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'test-store',
    platformType: 'shopify_storefront',
    baseUrl: 'https://test-store.com',
    ...overrides,
  };
}

function createMockCollection(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    slug: 'mtg-singles',
    ...overrides,
  };
}

function createMockVariant(overrides: Partial<ExtractedCardVariant> = {}): ExtractedCardVariant {
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
    variants: variants ?? [createMockVariant({ productUrl: `https://test-store.com/products/${handle}` })],
  };
}

function createMockProductUrl(overrides: Partial<Record<string, unknown>> = {}) {
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

function createMockJob(data: StorefrontExtractionJobData): Job<StorefrontExtractionJobData> {
  return {
    id: 'job-1',
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<StorefrontExtractionJobData>;
}

/**
 * Create a mock StorefrontExtractionAdapter with an extractCollection
 * async generator that yields the given products.
 */
function createMockAdapter(
  products: Array<{ handle: string; updatedAt: Date; variants: ExtractedCardVariant[] }>,
) {
  return {
    extractCollection: vi.fn().mockImplementation(async function* () {
      for (const product of products) {
        yield product;
      }
    }),
  };
}

// --- Tests ---

describe('StorefrontProcessor', () => {
  let processor: StorefrontProcessor;
  let storeRepository: { findOne: ReturnType<typeof vi.fn> };
  let productUrlRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let collectionRepository: { findOne: ReturnType<typeof vi.fn> };
  let platformAdapterFactory: { getExtractionAdapter: ReturnType<typeof vi.fn> };
  let extractionService: { processExtractedVariants: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    storeRepository = { findOne: vi.fn() };
    productUrlRepository = {
      findOne: vi.fn(),
      create: vi.fn((data: unknown) => data),
      save: vi.fn().mockImplementation((entity: unknown) => Promise.resolve({ id: 100, ...entity as object })),
    };
    collectionRepository = { findOne: vi.fn() };
    platformAdapterFactory = { getExtractionAdapter: vi.fn() };
    extractionService = { processExtractedVariants: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontProcessor,
        { provide: getRepositoryToken(Store), useValue: storeRepository },
        { provide: getRepositoryToken(ProductUrl), useValue: productUrlRepository },
        { provide: getRepositoryToken(MtgSinglesCollection), useValue: collectionRepository },
        { provide: PlatformAdapterFactory, useValue: platformAdapterFactory },
        { provide: ExtractionService, useValue: extractionService },
      ],
    }).compile();

    processor = module.get<StorefrontProcessor>(StorefrontProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    const defaultJobData: StorefrontExtractionJobData = {
      storeId: 1,
      collectionHandle: 'mtg-singles',
      discoveryRunId: 42,
    };

    describe('full iteration', () => {
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
        // Each product is a new product URL (not found in DB)
        productUrlRepository.findOne.mockResolvedValue(null);
        extractionService.processExtractedVariants.mockResolvedValue({
          variantsExtracted: 1,
          success: true,
        });

        const job = createMockJob(defaultJobData);
        const result = await processor.process(job);

        expect(result.success).toBe(true);
        expect(result.productsExtracted).toBe(3);
        expect(result.variantsExtracted).toBe(3); // 1 variant per product
        expect(extractionService.processExtractedVariants).toHaveBeenCalledTimes(3);

        // Verify each call receives correct arguments
        for (let i = 0; i < 3; i++) {
          const call = extractionService.processExtractedVariants.mock.calls[i];
          expect(call[1]).toBe(1); // storeId
          expect(call[2]).toBe(products[i].handle); // handle
          expect(call[3]).toEqual(products[i].variants); // variants
          expect(call[4]).toBe(42); // discoveryRunId
        }
      });
    });

    describe('staleness skipping', () => {
      it('should skip products that were recently extracted', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const products = [
          createMockProduct('fresh-product'),
          createMockProduct('stale-product'),
          createMockProduct('another-fresh-product'),
        ];
        const adapter = createMockAdapter(products);

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);

        // fresh-product: recently extracted (within 24 hours)
        const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
        productUrlRepository.findOne
          .mockResolvedValueOnce(createMockProductUrl({
            handle: 'fresh-product',
            lastExtractedAt: recentDate,
            extractionStatus: 'success',
          }))
          .mockResolvedValueOnce(createMockProductUrl({
            handle: 'stale-product',
            lastExtractedAt: null,
            extractionStatus: 'pending',
          }))
          .mockResolvedValueOnce(createMockProductUrl({
            handle: 'another-fresh-product',
            lastExtractedAt: recentDate,
            extractionStatus: 'success',
          }));

        extractionService.processExtractedVariants.mockResolvedValue({
          variantsExtracted: 1,
          success: true,
        });

        const job = createMockJob(defaultJobData);
        const result = await processor.process(job);

        expect(result.success).toBe(true);
        expect(result.productsExtracted).toBe(3); // all counted as extracted
        // Only the stale product should have processExtractedVariants called
        expect(extractionService.processExtractedVariants).toHaveBeenCalledTimes(1);
        expect(extractionService.processExtractedVariants.mock.calls[0][2]).toBe('stale-product');
      });

      it('should not skip products with error extraction status even if recently extracted', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const products = [createMockProduct('error-product')];
        const adapter = createMockAdapter(products);

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);

        const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
        productUrlRepository.findOne.mockResolvedValue(
          createMockProductUrl({
            handle: 'error-product',
            lastExtractedAt: recentDate,
            extractionStatus: 'error',
          }),
        );

        extractionService.processExtractedVariants.mockResolvedValue({
          variantsExtracted: 2,
          success: true,
        });

        const job = createMockJob(defaultJobData);
        const result = await processor.process(job);

        expect(result.success).toBe(true);
        expect(extractionService.processExtractedVariants).toHaveBeenCalledTimes(1);
      });
    });

    describe('per-product error handling', () => {
      it('should continue processing remaining products when one fails', async () => {
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
        productUrlRepository.findOne.mockResolvedValue(null); // all new

        extractionService.processExtractedVariants
          .mockResolvedValueOnce({ variantsExtracted: 1, success: true })
          .mockRejectedValueOnce(new Error('Extraction failed for product-2'))
          .mockResolvedValueOnce({ variantsExtracted: 1, success: true });

        const job = createMockJob(defaultJobData);
        const result = await processor.process(job);

        expect(result.success).toBe(true);
        expect(result.productsExtracted).toBe(2); // 1st and 3rd succeeded
        expect(result.variantsExtracted).toBe(2); // 1 + 0 (error) + 1
        expect(extractionService.processExtractedVariants).toHaveBeenCalledTimes(3);
      });

      it('should report the number of errors in the result', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const products = [
          createMockProduct('ok-product'),
          createMockProduct('bad-product'),
        ];
        const adapter = createMockAdapter(products);

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);
        productUrlRepository.findOne.mockResolvedValue(null);

        extractionService.processExtractedVariants
          .mockResolvedValueOnce({ variantsExtracted: 3, success: true })
          .mockRejectedValueOnce(new Error('Bad product'));

        const job = createMockJob(defaultJobData);
        const result = await processor.process(job);

        // The result still reports success for the overall job
        expect(result.success).toBe(true);
        expect(result.productsExtracted).toBe(1);
        expect(result.variantsExtracted).toBe(3);
      });
    });

    describe('store not found', () => {
      it('should throw when storeId does not exist', async () => {
        storeRepository.findOne.mockResolvedValue(null);

        const job = createMockJob({ storeId: 999, collectionHandle: 'mtg-singles' });

        await expect(processor.process(job)).rejects.toThrow('Store 999 not found');
        expect(collectionRepository.findOne).not.toHaveBeenCalled();
      });
    });

    describe('collection not found', () => {
      it('should throw when collection does not exist for the store', async () => {
        const store = createMockStore();
        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(null);

        const job = createMockJob({
          storeId: 1,
          collectionHandle: 'nonexistent-collection',
        });

        await expect(processor.process(job)).rejects.toThrow(
          'No MTG singles collection found for test-store (handle: nonexistent-collection)',
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
          success: true,
        });

        const job = createMockJob(defaultJobData);
        await processor.process(job);

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
          success: true,
        });

        const job = createMockJob(defaultJobData);
        await processor.process(job);

        // Should have updated the sitemapLastmod
        expect(existingProductUrl.sitemapLastmod).toEqual(new Date('2025-01-01'));
        expect(productUrlRepository.save).toHaveBeenCalledWith(existingProductUrl);
        // Should NOT have called create for existing product
        expect(productUrlRepository.create).not.toHaveBeenCalled();
      });
    });

    describe('progress reporting', () => {
      it('should call updateProgress every 100 products', async () => {
        const store = createMockStore();
        const collection = createMockCollection();

        // Create 150 products to trigger progress at product 100
        const products = Array.from({ length: 150 }, (_, i) =>
          createMockProduct(`product-${i}`),
        );
        const adapter = createMockAdapter(products);

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);
        productUrlRepository.findOne.mockResolvedValue(null);
        extractionService.processExtractedVariants.mockResolvedValue({
          variantsExtracted: 1,
          success: true,
        });

        const job = createMockJob(defaultJobData);
        await processor.process(job);

        // updateProgress should have been called at product 100
        expect(job.updateProgress).toHaveBeenCalledTimes(1);
        expect(job.updateProgress).toHaveBeenCalledWith({
          productsExtracted: 100,
          variantsExtracted: 100,
        });
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
          success: true,
        });

        const job = createMockJob(defaultJobData);
        const result = await processor.process(job);

        expect(result).toEqual({
          storeId: 1,
          collectionHandle: 'mtg-singles',
          productsExtracted: 1,
          variantsExtracted: 5,
          success: true,
        });
      });

      it('should return zero counts when collection has no products', async () => {
        const store = createMockStore();
        const collection = createMockCollection();
        const adapter = createMockAdapter([]);

        storeRepository.findOne.mockResolvedValue(store);
        collectionRepository.findOne.mockResolvedValue(collection);
        platformAdapterFactory.getExtractionAdapter.mockReturnValue(adapter);

        const job = createMockJob(defaultJobData);
        const result = await processor.process(job);

        expect(result).toEqual({
          storeId: 1,
          collectionHandle: 'mtg-singles',
          productsExtracted: 0,
          variantsExtracted: 0,
          success: true,
        });
        expect(extractionService.processExtractedVariants).not.toHaveBeenCalled();
      });
    });
  });
});
