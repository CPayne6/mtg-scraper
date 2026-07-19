import { describe, expect, it, vi } from 'vitest';
import { StorefrontProcessor } from './storefront.processor';

describe('StorefrontProcessor Shopify product persistence', () => {
  it('persists the exact Shopify product title during an upsert', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const orUpdate = vi.fn().mockReturnValue({ execute });
    const values = vi.fn().mockReturnValue({ orUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const processor = Object.create(StorefrontProcessor.prototype) as StorefrontProcessor;
    (processor as unknown as { shopifyProductRepository: unknown }).shopifyProductRepository = {
      createQueryBuilder: () => ({ insert }),
    };

    await (processor as unknown as {
      bulkUpsertShopifyProducts: (storeId: number, products: unknown[]) => Promise<void>;
    }).bulkUpsertShopifyProducts(7, [{
      shopifyProductId: '123',
      productUrlId: 42,
      rawProductTitle: 'Umara Wizard (Art Series)',
      matchStatus: 'excluded',
      isToken: false,
      cardListingId: null,
    }]);

    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ rawProductTitle: 'Umara Wizard (Art Series)' }),
    ]);
    expect(orUpdate).toHaveBeenCalledWith(
      expect.arrayContaining(['raw_product_title']),
      ['shopify_product_id'],
    );
  });
});
