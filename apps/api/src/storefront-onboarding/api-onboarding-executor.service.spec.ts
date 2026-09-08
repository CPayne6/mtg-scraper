import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('undici', () => ({ fetch: vi.fn() }));

import { fetch } from 'undici';
import { ConfigService } from '@nestjs/config';
import { ShopifyStorefrontOnboardingExplorer } from './api-onboarding-executor.service';

const mockedFetch = vi.mocked(fetch);

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as any;
}

function product(id: number, variants = 1) {
  return { id: `gid://shopify/Product/${id}`, variants: { nodes: Array.from({ length: variants }, (_, index) => ({ id: `${id}-${index}` })) } };
}

describe('Shopify Storefront onboarding transport', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('uses created_at buckets and the production cursor contract', async () => {
    mockedFetch
      .mockResolvedValueOnce(response({ data: { products: { edges: [{ node: { createdAt: '2024-01-01T00:00:00Z' } }] } } }))
      .mockResolvedValueOnce(response({ data: { products: { edges: [{ node: { createdAt: '2024-12-31T00:00:00Z' } }] } } }))
      .mockResolvedValueOnce(response({ data: { products: { edges: [{ node: product(1, 1) }], pageInfo: { hasNextPage: true, endCursor: 'bucket-cursor' } } } }))
      .mockResolvedValueOnce(response({ data: { products: { edges: [{ node: product(2, 1) }], pageInfo: { hasNextPage: false, endCursor: null } } } }));

    const explorer = new ShopifyStorefrontOnboardingExplorer(new ConfigService(), {} as any);
    const result = await (explorer as any).products(new URL('https://shop.example'), '2026-04', 'product_type:Singles', 1000, 50, 10, 100);

    expect(result.products).toHaveLength(2);
    expect(mockedFetch).toHaveBeenCalledTimes(4);
    const firstBucketRequest = JSON.parse(mockedFetch.mock.calls[2][1].body);
    const secondBucketRequest = JSON.parse(mockedFetch.mock.calls[3][1].body);
    expect(firstBucketRequest.variables.after).toBeNull();
    expect(secondBucketRequest.variables.after).toBe('bucket-cursor');
    expect(firstBucketRequest.variables.query).toContain("created_at:>='2024-01-01T00:00:00.000Z'");
  });

  it('retries a high-complexity bucket page with page size 50 without dropping the bucket', async () => {
    mockedFetch
      .mockResolvedValueOnce(response({ data: { products: { edges: [{ node: { createdAt: '2024-01-01T00:00:00Z' } }] } } }))
      .mockResolvedValueOnce(response({ data: { products: { edges: [{ node: { createdAt: '2024-01-01T00:00:00Z' } }] } } }))
      .mockResolvedValueOnce(response({ errors: [{ message: 'Internal error' }] }))
      .mockResolvedValueOnce(response({ data: { products: { edges: [{ node: product(1, 2) }], pageInfo: { hasNextPage: false, endCursor: null } } } }));

    const explorer = new ShopifyStorefrontOnboardingExplorer(new ConfigService(), {} as any);
    const result = await (explorer as any).products(new URL('https://shop.example'), '2026-04', 'product_type:Singles', 1000, 250, 10, 100);
    expect(result.products).toHaveLength(1);
    const retryRequest = JSON.parse(mockedFetch.mock.calls[3][1].body);
    expect(retryRequest.variables.first).toBe(50);
  });
});
