import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorefrontClient } from './storefront-client';
import { ExtractionHttpError } from '../shopify/extraction-http-error';
import { DEFAULT_STOREFRONT_API_VERSION } from './storefront.queries';
import type { Store } from '../../../database/store.entity';

// Mock undici.fetch
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';

const mockFetch = vi.mocked(fetch);

function createMockStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 1,
    uuid: 'test-uuid',
    name: 'test-store',
    displayName: 'Test Store',
    baseUrl: 'https://test-store.myshopify.com',
    isActive: true,
    scraperType: 'binderpos',
    rateLimitPerSecond: 2,
    scraperConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Store;
}

function createMockDeps() {
  return {
    proxyService: {
      getIpCount: () => 10,
      getProxyAgentForNumber: () => undefined,
    },
    cacheService: {
      getNextProxyNumber: vi.fn().mockResolvedValue(1),
    },
    rateLimiter: {
      acquireWithRotation: vi.fn().mockImplementation(
        async (_name: string, _rate: number, fn: () => Promise<number>) => ({
          proxyNumber: await fn(),
        }),
      ),
    },
    webBotAuth: {
      isEnabled: () => false,
      signRequest: vi.fn().mockResolvedValue(null),
    },
  };
}

function createClient(deps = createMockDeps()) {
  return new StorefrontClient(
    deps.proxyService as any,
    deps.cacheService as any,
    deps.rateLimiter as any,
    deps.webBotAuth as any,
  );
}

function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 429 ? 'Too Many Requests' : 'Error',
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('StorefrontClient', () => {
  let client: StorefrontClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createClient();
  });

  describe('getEndpointUrl', () => {
    it('uses scraperConfig.shopifyUrl when present', () => {
      const store = createMockStore({
        scraperConfig: { shopifyUrl: 'custom-store.myshopify.com' },
      });
      const url = client.getEndpointUrl(store);
      expect(url).toBe(
        `https://custom-store.myshopify.com/api/${DEFAULT_STOREFRONT_API_VERSION}/graphql.json`,
      );
    });

    it('falls back to baseUrl host when shopifyUrl is not set', () => {
      const store = createMockStore({
        baseUrl: 'https://example-store.com',
        scraperConfig: {},
      });
      const url = client.getEndpointUrl(store);
      expect(url).toBe(
        `https://example-store.com/api/${DEFAULT_STOREFRONT_API_VERSION}/graphql.json`,
      );
    });

    it('uses per-store Storefront API version override when present', () => {
      const store = createMockStore({
        scraperConfig: { storefrontApiVersion: '2026-01' },
      });
      const url = client.getEndpointUrl(store);
      expect(url).toBe(
        'https://test-store.myshopify.com/api/2026-01/graphql.json',
      );
    });
  });

  describe('query', () => {
    const store = createMockStore();
    const gql = 'query { product { title } }';
    const variables = { handle: 'test' };

    it('returns data on successful response', async () => {
      const data = { product: { title: 'Lightning Bolt' } };
      mockFetch.mockResolvedValue(mockResponse(200, { data }) as any);

      const result = await client.query(store, gql, variables);
      expect(result).toEqual(data);
    });

    it('does not set Storefront access token headers for tokenless mode', async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, { data: { product: null } }) as any,
      );

      await client.query(store, gql, variables);

      const callArgs = mockFetch.mock.calls[0];
      const fetchOptions = callArgs[1] as any;
      expect(
        fetchOptions.headers['X-Shopify-Storefront-Access-Token'],
      ).toBeUndefined();
      expect(fetchOptions.headers['Shopify-Storefront-Private-Token']).toBeUndefined();
    });

    it('merges Web Bot Auth headers when enabled', async () => {
      const deps = createMockDeps();
      (deps.webBotAuth as any).isEnabled = () => true;
      deps.webBotAuth.signRequest.mockResolvedValue({
        'Signature-Input': 'sig=("@authority" "signature-agent")',
        Signature: 'sig=:abc123:',
        'Signature-Agent': '"https://bot.example/.well-known/http-message-signatures-directory"',
      });
      client = createClient(deps);
      mockFetch.mockResolvedValue(
        mockResponse(200, { data: { product: null } }) as any,
      );

      await client.query(store, gql, variables);

      const fetchOptions = mockFetch.mock.calls[0][1] as any;
      expect(fetchOptions.headers['Signature-Agent']).toBe(
        '"https://bot.example/.well-known/http-message-signatures-directory"',
      );
      expect(fetchOptions.headers.Signature).toBe('sig=:abc123:');
    });

    it('throws ExtractionHttpError with retryAfter on HTTP 429', async () => {
      mockFetch.mockResolvedValue(
        mockResponse(429, {}, { 'retry-after': '5' }) as any,
      );

      await expect(client.query(store, gql, variables)).rejects.toThrow(
        ExtractionHttpError,
      );
      await expect(client.query(store, gql, variables)).rejects.toMatchObject({
        statusCode: 429,
        retryAfter: 5,
      });
    });

    it('throws ExtractionHttpError on HTTP 430', async () => {
      mockFetch.mockResolvedValue(mockResponse(430, {}) as any);

      await expect(client.query(store, gql, variables)).rejects.toThrow(
        ExtractionHttpError,
      );
      await expect(client.query(store, gql, variables)).rejects.toMatchObject({
        statusCode: 430,
      });
    });

    it('throws ExtractionHttpError on HTTP 5xx', async () => {
      mockFetch.mockResolvedValue(mockResponse(500, {}) as any);

      await expect(client.query(store, gql, variables)).rejects.toThrow(
        ExtractionHttpError,
      );
      await expect(client.query(store, gql, variables)).rejects.toMatchObject({
        statusCode: 500,
      });
    });

    it('throws ExtractionHttpError with computed retryAfter on GraphQL THROTTLED', async () => {
      const throttledBody = {
        data: null,
        errors: [
          {
            message: 'Throttled',
            extensions: { code: 'THROTTLED' },
          },
        ],
        extensions: {
          cost: {
            requestedQueryCost: 100,
            actualQueryCost: 0,
            throttleStatus: {
              maximumAvailable: 1000,
              currentlyAvailable: 20,
              restoreRate: 50,
            },
          },
        },
      };
      mockFetch.mockResolvedValue(mockResponse(200, throttledBody) as any);

      await expect(client.query(store, gql, variables)).rejects.toThrow(
        ExtractionHttpError,
      );

      try {
        await client.query(store, gql, variables);
      } catch (e) {
        const err = e as ExtractionHttpError;
        expect(err.statusCode).toBe(429);
        // deficit = 100 - 20 = 80, retryAfter = ceil(80/50) = 2
        expect(err.retryAfter).toBe(2);
      }
    });

    it('throws Error (not ExtractionHttpError) on non-throttle GraphQL error', async () => {
      const errorBody = {
        data: null,
        errors: [{ message: 'Something went wrong' }],
      };
      mockFetch.mockResolvedValue(mockResponse(200, errorBody) as any);

      await expect(client.query(store, gql, variables)).rejects.toThrow(
        'GraphQL errors from test-store: Something went wrong',
      );
      await expect(client.query(store, gql, variables)).rejects.not.toBeInstanceOf(
        ExtractionHttpError,
      );
    });
  });
});
