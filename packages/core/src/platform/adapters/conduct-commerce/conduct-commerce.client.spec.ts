import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('undici', () => ({ fetch: fetchMock }));

import { ConductCommerceApiError, ConductCommerceClient } from './conduct-commerce.client';

const store = {
  name: 'conduct-fixture',
  rateLimitPerSecond: 9,
  scraperConfig: {
    platform: 'conduct_commerce', storefrontHost: 'merchant.example', currency: 'CAD',
    source: { kind: 'conduct-storefront-api', mode: 'search', query: 'Sol Ring' },
    parser: { kind: 'builtin', version: 1, parserType: 'conduct' },
    parserConfig: { parserType: 'conduct', settings: {} },
  },
} as any;

describe('ConductCommerceClient', () => {
  const limiter = { acquirePermit: vi.fn().mockResolvedValue({ allowed: true }) };
  let client: ConductCommerceClient;

  beforeEach(() => {
    fetchMock.mockReset();
    limiter.acquirePermit.mockClear();
    client = new ConductCommerceClient(limiter as any);
  });

  it('uses the verified public endpoint and tenant host contract', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { listings: [] } }) });
    await expect(client.listings(store, { search: 'Sol Ring' })).resolves.toEqual({ listings: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.conductcommerce.com/v1/getProductListings',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'content-type': 'text/plain' }) }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ host: 'merchant.example', search: 'Sol Ring' });
    expect(limiter.acquirePermit).toHaveBeenCalledWith('conduct-fixture', 0, 1);
  });

  it('marks HTTP throttling as retryable and API contract failures as permanent', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(client.settings(store)).rejects.toMatchObject({ retryable: true, status: 429 });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false, errors: [{ message: 'Invalid store.' }] }) });
    await expect(client.settings(store)).rejects.toMatchObject({ retryable: false });
  });

  it('rejects unapproved API operations before making a request', async () => {
    await expect(client.call(store, 'deleteEverything', {})).rejects.toBeInstanceOf(ConductCommerceApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
