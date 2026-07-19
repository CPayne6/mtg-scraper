import { describe, expect, it, vi } from 'vitest';
import { DeliveryQuoteService } from './delivery-quote.service';

describe('DeliveryQuoteService', () => {
  it('builds the exact completed per-store bundle and preserves every delivery group', async () => {
    const queryBuilder = {
      innerJoinAndSelect: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(), getMany: vi.fn().mockResolvedValue([{ platformVariantId: '111', cardListing: { store: { name: 'example-store' } } }]),
    };
    const stores = { find: vi.fn().mockResolvedValue([{ id: 7, name: 'example-store', displayName: 'Example Store', baseUrl: 'https://example.test', isActive: true, scraperType: 'f2f', rateLimitPerSecond: 15 }]) };
    const variants = { createQueryBuilder: vi.fn(() => queryBuilder) };
    const storefront = {
      query: vi.fn().mockResolvedValue({ cartCreate: { cart: { id: 'private-cart-id' }, userErrors: [] } }),
      queryDeferred: vi.fn().mockResolvedValue({ cart: { deliveryGroups: { edges: [{ node: { id: 'group-1', deliveryOptions: [{ title: 'Standard', handle: 'standard', deliveryMethodType: 'SHIPPING', estimatedCost: { amount: '12.50', currencyCode: 'CAD' } }] } }, { node: { id: 'group-2', deliveryOptions: [{ title: 'Pickup', handle: 'pickup', deliveryMethodType: 'PICK_UP', estimatedCost: { amount: '0', currencyCode: 'CAD' } }] } }] } } }),
    };
    const service = new DeliveryQuoteService(stores as never, variants as never, storefront as never);

    const result = await service.quoteSelected([{ storeKey: 'example-store', offer: { variant_id: '111' } } as never], {
      address1: '123 Main St', city: 'Toronto', province: 'ON', postalCode: 'm5v1e3', countryCode: 'ca',
    });

    expect(storefront.query.mock.calls[0][2].input.lines).toEqual([{ merchandiseId: 'gid://shopify/ProductVariant/111', quantity: 1 }]);
    expect(storefront.query.mock.calls[0][2].input.delivery.addresses[0].address.deliveryAddress).toMatchObject({ countryCode: 'CA', provinceCode: 'ON', zip: 'M5V 1E3' });
    expect(storefront.queryDeferred).toHaveBeenCalledOnce();
    expect(result).toEqual({ stores: [{ state: 'quoted', store: 'example-store', storeName: 'Example Store', groups: [{ id: 'group-1', options: [{ label: 'Standard', handle: 'standard', methodType: 'SHIPPING', price: 12.5, currency: 'CAD' }] }, { id: 'group-2', options: [{ label: 'Pickup', handle: 'pickup', methodType: 'PICK_UP', price: 0, currency: 'CAD' }] }] }] });
    expect(JSON.stringify(result)).not.toContain('private-cart-id');
  });
});
