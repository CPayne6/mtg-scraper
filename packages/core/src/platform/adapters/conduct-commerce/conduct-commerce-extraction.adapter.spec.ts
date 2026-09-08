import { describe, expect, it } from 'vitest';
import { Condition } from '@scoutlgs/shared';
import { ConductCommerceExtractionAdapter } from './conduct-commerce-extraction.adapter';
import { ConductCardDetailExtractor } from './conduct-card-detail.extractor';

const store = { baseUrl: 'https://merchant.example', scraperConfig: { currency: 'CAD' } } as any;

describe('ConductCommerceExtractionAdapter', () => {
  it('normalizes a listing and derives a stable fallback variant ID', () => {
    const adapter = new ConductCommerceExtractionAdapter({} as any, new ConductCardDetailExtractor());
    const [{ variants: [variant] }] = adapter.normalizeListings(store, [{
      inventoryID: 3212, inventoryName: 'Sol Ring', categoryName: 'Kamigawa: Neon Dynasty Commander',
      image: 'magic_singles/nec/sol-ring.jpg', filterFields: { Finish: 'Foil' },
      variants: [{ id: null, price: 3.14, quantity: 2, name: 'NM/Mint', variantCombinationID: 4 }],
    }]);
    expect(variant).toMatchObject({ cardName: 'Sol Ring', setName: 'Kamigawa: Neon Dynasty Commander', condition: Condition.NM, foil: true, price: 3.14, currency: 'CAD', inStock: true, quantity: 2, platformVariantId: '3212:4', imageUrl: 'https://conduct-catalog-images.s3-us-west-2.amazonaws.com/normal/magic_singles/nec/sol-ring.jpg', productUrl: 'https://merchant.example/store/item/3212' });
  });

  it('uses product details for collector number and explicit set identity', () => {
    const adapter = new ConductCommerceExtractionAdapter({} as any, new ConductCardDetailExtractor());
    const [variant] = adapter.normalizeDetails(store, {
      inventoryID: 3212, inventoryName: 'Sol Ring', categoryName: 'Wrong category', variants: [{ id: 9, price: 3.14, quantity: 0, name: 'NM/Mint' }],
      fields: [{ name: 'Set', value: 'Kamigawa: Neon Dynasty' }, { name: 'Collector Number', value: '161' }, { name: 'Finish', value: 'Regular' }],
    });
    expect(variant).toMatchObject({ setName: 'Kamigawa: Neon Dynasty', collectorNumber: '161', platformVariantId: '9', inStock: false });
  });

  it('streams every configured Magic category, including hidden categories', async () => {
    const client = {
      settings: async () => ({ categories: [{ id: 1, name: 'Magic Singles', categories: [
        { id: 10, name: 'Visible', uniqueDisplayName: 'Visible', visible: 1 },
        { id: 11, name: 'Hidden', uniqueDisplayName: 'Hidden', visible: 0 },
      ] }] }),
      listings: async (_store: unknown, input: { category?: string }) => ({ listings: [{
        inventoryID: input.category === 'Hidden' ? 2 : 1, inventoryName: 'Sol Ring', categoryName: input.category!,
        variants: [{ id: 1, price: 1, quantity: 1, name: 'NM/Mint' }],
      }] }),
    };
    const adapter = new ConductCommerceExtractionAdapter(client as any, new ConductCardDetailExtractor());
    const seen: string[] = [];
    await adapter.extractConfiguredSource({
      ...store,
      scraperConfig: { platform: 'conduct_commerce', storefrontHost: 'merchant.example', currency: 'CAD',
        source: { kind: 'conduct-storefront-api', mode: 'magic-product-type', productTypeId: 1 },
        parser: { kind: 'builtin', version: 1, parserType: 'conduct' },
        parserConfig: { parserType: 'conduct', settings: {} },
      },
    } as any, async (category) => { seen.push(`${category.category.name}:${category.listingCount}`); });
    expect(seen).toEqual(['Visible:1', 'Hidden:1']);
  });
});
