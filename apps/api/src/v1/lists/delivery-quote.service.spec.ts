import { describe, expect, it, vi } from 'vitest';
import { DeliveryQuoteService } from './delivery-quote.service';

describe('DeliveryQuoteService', () => {
  it('quotes the store cart with every available deck entry and the selected delivery address', async () => {
    const entityManager = {
      query: vi.fn()
        .mockResolvedValueOnce([{
          id: 7,
          name: 'example-store',
          display_name: 'Example Store',
          base_url: 'https://example.test',
          scraper_config: {},
        }])
        // Two copies map to the same Shopify variant, while the third card
        // maps to another variant. The quote must preserve those quantities.
        .mockResolvedValueOnce([
          { platform_variant_id: '111' },
          { platform_variant_id: '111' },
          { platform_variant_id: '222' },
        ]),
    };
    const storefront = {
      query: vi.fn().mockResolvedValue({
        cartCreate: {
          cart: {
            deliveryGroups: {
              edges: [{
                node: {
                  deliveryOptions: [{
                    title: 'Standard shipping',
                    handle: 'standard',
                    estimatedCost: { amount: '12.50' },
                  }],
                },
              }],
            },
          },
          userErrors: [],
        },
      }),
    };
    const service = new DeliveryQuoteService(entityManager as never, storefront as never);

    const result = await service.quote('owner-1', 42, ['example-store'], {
      address1: '123 Main St',
      address2: 'Unit 4',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5V 1E3',
      countryCode: 'ca',
    });

    expect(storefront.query).toHaveBeenCalledOnce();
    const [, query, variables] = storefront.query.mock.calls[0];
    expect(query).toContain('mutation Quote($input: CartInput!)');
    expect(variables).toEqual({
      input: {
        lines: [
          { merchandiseId: 'gid://shopify/ProductVariant/111', quantity: 2 },
          { merchandiseId: 'gid://shopify/ProductVariant/222', quantity: 1 },
        ],
        buyerIdentity: { countryCode: 'CA' },
        delivery: {
          addresses: [{
            address: {
              deliveryAddress: {
                address1: '123 Main St',
                address2: 'Unit 4',
                city: 'Toronto',
                provinceCode: 'ON',
                zip: 'M5V 1E3',
                countryCode: 'CA',
              },
            },
            selected: true,
            oneTimeUse: true,
          }],
        },
      },
    });
    expect(result.methods['example-store']).toEqual([
      { label: 'Pickup', handle: 'pickup', price: 0 },
      { label: 'Standard shipping', handle: 'standard', price: 12.5 },
    ]);
  });
});
