import { describe, expect, it } from 'vitest';
import { ConductCommerceOnboardingExplorer } from './conduct-commerce-onboarding-explorer.service';
import { ConductCommerceExtractionAdapter, ConductCardDetailExtractor } from '@scoutlgs/core';

describe('ConductCommerceOnboardingExplorer', () => {
  const listings = Array.from({ length: 25 }, (_, index) => ({
    inventoryID: index + 1, inventoryName: `Lightning Bolt ${index + 1}`,
    categoryName: 'Magic 2010', image: `magic/${index}.jpg`,
    variants: Array.from({ length: 4 }, (_, variant) => ({
      id: null, variantCombinationID: variant + 1, name: 'Near Mint', price: 1, quantity: 1,
    })),
  }));

  function explorer() {
    const client = {
      settings: async () => ({ categories: [{ id: 7, name: 'Magic Singles', categories: [{ uniqueDisplayName: 'Empty' }, { uniqueDisplayName: 'Magic 2010' }] }] }),
      listings: async (_store: unknown, input: { category: string }) => ({ listings: input.category === 'Empty' ? [] : listings }),
      details: async (_store: unknown, inventoryID: number) => ({
        ...listings.find((listing) => listing.inventoryID === inventoryID),
        fields: [
          { name: 'Set', value: 'Magic 2010' },
          { name: 'Collector Number', value: String(inventoryID) },
        ],
      }),
    };
    const adapter = new ConductCommerceExtractionAdapter(client as any, new ConductCardDetailExtractor());
    const identity = { evaluate: async (variants: any[]) => variants.map((variant) => ({ productId: variant.productId, variantId: variant.variantId, outcome: 'exact-printing' })) };
    return new ConductCommerceOnboardingExplorer(client as any, adapter, identity as any);
  }

  it('requires merchant-confirmed currency before probing', async () => {
    const report = await explorer().onboard({ url: 'https://merchant.example', timeoutMs: 1000 });
    expect(report).toMatchObject({ status: 'rejected', proposedStore: null });
  });

  it('uses sorted categories until 100 normalized variants and emits typed Conduct configuration', async () => {
    const report: any = await explorer().onboard({ url: 'https://merchant.example', currency: 'cad', proposedSlug: 'merchant', timeoutMs: 1000 });
    expect(report.status).toBe('proposal-ready');
    expect(report.scope).toMatchObject({ productTypeId: 7, sampledCategories: ['Magic 2010'], sampledVariants: 100 });
    expect(report.proposedStore).toMatchObject({ platformType: 'conduct_commerce', scraperType: 'conduct', scraperConfig: { storefrontHost: 'merchant.example', currency: 'CAD', source: { mode: 'magic-product-type', productTypeId: 7 }, parserConfig: { parserType: 'conduct', settings: {} } } });
  });
});
