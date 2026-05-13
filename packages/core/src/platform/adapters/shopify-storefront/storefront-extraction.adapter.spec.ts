import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorefrontExtractionAdapter } from './storefront-extraction.adapter';
import { ExtractionHttpError } from '../shopify/shopify-extraction.adapter';
import { Condition } from '@scoutlgs/shared';
import type { Store } from '../../../database/store.entity';
import type { StorefrontProduct, ProductByHandleData, CollectionProductsData } from './storefront.types';
import type { ICardDetailExtractor } from '../shopify/card-detail-extractor.interface';

function createMockStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 1,
    uuid: 'test-uuid',
    name: 'test-store',
    displayName: 'Test Store',
    baseUrl: 'https://test-store.com',
    isActive: true,
    scraperType: 'binderpos',
    rateLimitPerSecond: 2,
    scraperConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Store;
}

function createMockExtractor(): ICardDetailExtractor {
  return {
    parseTitle: vi.fn().mockReturnValue({
      cardName: 'Lightning Bolt',
      setName: 'Magic 2011',
      collectorNumber: undefined,
    }),
    parseSkuInfo: vi.fn().mockReturnValue({
      setCode: undefined,
      collectorNumber: undefined,
      foil: undefined,
      isToken: false,
    }),
    parseTags: vi.fn().mockReturnValue({ setName: undefined, foil: undefined }),
    parseImageFilename: vi.fn().mockReturnValue({
      setCode: undefined,
      collectorNumber: undefined,
    }),
    parseProductMeta: vi.fn().mockReturnValue({}),
  };
}

function createMockProduct(overrides: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    id: 'gid://shopify/Product/111',
    handle: 'lightning-bolt-magic-2011',
    title: 'Lightning Bolt [Magic 2011]',
    vendor: 'Wizards',
    productType: 'MTG Single',
    descriptionHtml: '',
    availableForSale: true,
    updatedAt: '2025-01-01T00:00:00Z',
    tags: ['mtg-singles'],
    onlineStoreUrl: 'https://test-store.com/products/lightning-bolt-magic-2011',
    images: {
      edges: [{ node: { url: 'https://cdn.shopify.com/image.jpg' } }],
    },
    variants: {
      edges: [
        {
          node: {
            id: 'gid://shopify/ProductVariant/12345',
            title: 'NM',
            sku: 'M11-123',
            availableForSale: true,
            quantityAvailable: 5,
            price: { amount: '2.50', currencyCode: 'CAD' },
            selectedOptions: [
              { name: 'Condition', value: 'NM' },
            ],
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('StorefrontExtractionAdapter', () => {
  let adapter: StorefrontExtractionAdapter;
  let mockClient: { query: ReturnType<typeof vi.fn> };
  let mockExtractor: ICardDetailExtractor;
  let mockDefaultExtractor: ICardDetailExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { query: vi.fn() };
    mockExtractor = createMockExtractor();
    mockDefaultExtractor = createMockExtractor();

    adapter = new StorefrontExtractionAdapter(
      mockClient as any,
      { binderpos: mockExtractor },
      mockDefaultExtractor as any,
    );
  });

  describe('extractProduct', () => {
    it('normalizes price from amount string to number', async () => {
      const product = createMockProduct({
        variants: {
          edges: [
            {
              node: {
                id: 'gid://shopify/ProductVariant/99',
                title: 'NM',
                sku: null,
                availableForSale: true,
                quantityAvailable: 3,
                price: { amount: '2.50', currencyCode: 'CAD' },
                selectedOptions: [{ name: 'Condition', value: 'NM' }],
              },
            },
          ],
        },
      });
      mockClient.query.mockResolvedValue({ product } as ProductByHandleData);

      const store = createMockStore();
      const variants = await adapter.extractProduct(store, 'lightning-bolt');

      expect(variants[0].price).toBe(2.5);
      expect(variants[0].currency).toBe('CAD');
    });

    it('maps selectedOptions to condition and foil', async () => {
      const product = createMockProduct({
        variants: {
          edges: [
            {
              node: {
                id: 'gid://shopify/ProductVariant/200',
                title: 'Near Mint Foil',
                sku: null,
                availableForSale: true,
                quantityAvailable: 1,
                price: { amount: '5.00', currencyCode: 'CAD' },
                selectedOptions: [
                  { name: 'Condition', value: 'Near Mint' },
                  { name: 'Style', value: 'Foil' },
                ],
              },
            },
          ],
        },
      });
      mockClient.query.mockResolvedValue({ product } as ProductByHandleData);

      const store = createMockStore();
      const variants = await adapter.extractProduct(store, 'test-handle');

      // selectedOptions[0] => option1 = "Near Mint" => NM
      // option2 = "Foil" => foil=true via parseConditionAndFoil
      expect(variants[0].condition).toBe(Condition.NM);
      expect(variants[0].foil).toBe(true);
    });

    it('extracts platformVariantId from variant gid', async () => {
      const product = createMockProduct({
        variants: {
          edges: [
            {
              node: {
                id: 'gid://shopify/ProductVariant/12345',
                title: 'NM',
                sku: null,
                availableForSale: true,
                quantityAvailable: 2,
                price: { amount: '1.00', currencyCode: 'CAD' },
                selectedOptions: [{ name: 'Condition', value: 'NM' }],
              },
            },
          ],
        },
      });
      mockClient.query.mockResolvedValue({ product } as ProductByHandleData);

      const store = createMockStore();
      const variants = await adapter.extractProduct(store, 'test-handle');

      expect(variants[0].platformVariantId).toBe('12345');
    });

    it('throws ExtractionHttpError with status 404 when product is null', async () => {
      mockClient.query.mockResolvedValue({ product: null } as ProductByHandleData);

      const store = createMockStore();

      await expect(
        adapter.extractProduct(store, 'nonexistent-handle'),
      ).rejects.toThrow(ExtractionHttpError);

      await expect(
        adapter.extractProduct(store, 'nonexistent-handle'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('uses the correct extractor based on store scraperType', async () => {
      const product = createMockProduct();
      mockClient.query.mockResolvedValue({ product } as ProductByHandleData);

      const store = createMockStore({ scraperType: 'binderpos' });
      await adapter.extractProduct(store, 'test-handle');

      // The binderpos-specific extractor should be called, not the default
      expect(mockExtractor.parseTitle).toHaveBeenCalledWith(product.title);
      expect(mockDefaultExtractor.parseTitle).not.toHaveBeenCalled();
    });

    it('falls back to default extractor for unknown scraperType', async () => {
      const product = createMockProduct();
      mockClient.query.mockResolvedValue({ product } as ProductByHandleData);

      const store = createMockStore({ scraperType: 'f2f' as any });
      await adapter.extractProduct(store, 'test-handle');

      // 'f2f' is not in the extractorMap, so default should be used
      expect(mockDefaultExtractor.parseTitle).toHaveBeenCalledWith(product.title);
      expect(mockExtractor.parseTitle).not.toHaveBeenCalled();
    });
  });

  describe('extractCollection', () => {
    it('paginates through multiple pages and yields all products', async () => {
      const product1 = createMockProduct({ handle: 'product-1' });
      const product2 = createMockProduct({ handle: 'product-2' });
      const product3 = createMockProduct({ handle: 'product-3' });

      // Page 1: has next page
      const page1: CollectionProductsData = {
        collection: {
          products: {
            edges: [{ node: product1 }, { node: product2 }],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          },
        },
      };
      // Page 2: last page
      const page2: CollectionProductsData = {
        collection: {
          products: {
            edges: [{ node: product3 }],
            pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
          },
        },
      };

      mockClient.query
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const store = createMockStore();
      const results: Array<{ handle: string }> = [];

      for await (const item of adapter.extractCollection(store, 'mtg-singles')) {
        results.push(item);
      }

      expect(results).toHaveLength(3);
      expect(results[0].handle).toBe('product-1');
      expect(results[1].handle).toBe('product-2');
      expect(results[2].handle).toBe('product-3');

      // Verify pagination cursor was passed
      const secondCallVars = mockClient.query.mock.calls[1][2];
      expect(secondCallVars.after).toBe('cursor-1');
    });

    it('yields nothing when collection is null', async () => {
      mockClient.query.mockResolvedValue({
        collection: null,
      } as CollectionProductsData);

      const store = createMockStore();
      const results: unknown[] = [];

      for await (const item of adapter.extractCollection(store, 'nonexistent')) {
        results.push(item);
      }

      expect(results).toHaveLength(0);
    });
  });
});
