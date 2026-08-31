import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inferScopeFromStorefrontProducts,
  main as probeMain,
  parseArgs as parseProbeArgs,
  tryStorefrontApi,
} from './probe-storefront-store.ts';
import {
  inferScopeFromListings,
  parseArgs as parseVerificationArgs,
  postJson,
} from './verify-storefront-listing-data.ts';
import { validateStorefrontParserProfile } from '../packages/shared/dist/storefront-parser-profile.js';

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('storefront onboarding scripts', () => {
  it('loads the probe against the compiled CommonJS shared module', () => {
    expect(parseProbeArgs(['--url', 'https://example.test', '--no-ai-discovery']).url).toBe('https://example.test');
  });

  it('validates probe and verification arguments', () => {
    expect(() => parseProbeArgs([])).toThrow('--url is required');
    expect(parseProbeArgs(['--help']).help).toBe(true);
    expect(() => parseProbeArgs(['--url', 'https://example.test', '--approve'])).toThrow('--approve requires --output');
    expect(() => parseProbeArgs(['--url', 'https://example.test', '--output', 'proposal.json'])).toThrow('--output requires --approve');
    expect(() => parseVerificationArgs(['--url'])).toThrow('Missing value for --url');
    expect(() => parseVerificationArgs([])).toThrow('--url is required');
    expect(parseVerificationArgs(['--help']).help).toBe(true);
  });

  it('uses a tokenless Storefront request and accepts public GraphQL products', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { products: { nodes: [{ id: 'p1', title: 'Lightning Bolt [LEA]', productType: 'MTG Singles', vendor: 'Magic', tags: ['MTG'], variants: { nodes: [{ id: 'v1', sku: 'LEA-161-EN-NF-1', selectedOptions: [{ name: 'Condition', value: 'Near Mint' }], price: { amount: '4.99', currencyCode: 'CAD' } }] } }] } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await tryStorefrontApi(new URL('https://example.test'), '2026-04', 'tag:"MTG"', 100, 5);

    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].headers['X-Shopify-Storefront-Access-Token']).toBeUndefined();
  });

  it('reports GraphQL rejection and request timeout failures without proposing an unsafe scope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: 'access denied' }] }), { status: 401 })));
    await expect(postJson('https://example.test/graphql', {}, 100)).rejects.toThrow('HTTP 401');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('request aborted'))))));
    const timedOut = await tryStorefrontApi(new URL('https://example.test'), '2026-04', null, 5);
    expect(timedOut.ok).toBe(false);
    expect(timedOut.error).toContain('request aborted');
    expect(inferScopeFromStorefrontProducts([{ productType: 'Accessories', vendor: 'Board Games', tags: [] }])).toMatchObject({ ok: false, strategy: 'none' });
  });

  it('rejects unsafe inferred listing scopes and invalid parser profiles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ products: [{ product_type: 'Accessories', vendor: 'Board Games', tags: '' }] }), { status: 200 })));
    await expect(inferScopeFromListings(new URL('https://example.test'), 100)).rejects.toThrow('Could not infer an MTG singles scope');
    expect(validateStorefrontParserProfile({ kind: 'mapping', version: 1, fields: { cardName: { candidates: [] } } })).toMatchObject({ valid: false });
  });

  it('keeps the default probe path read-only', async () => {
    const fetchMock = vi.fn().mockImplementation((url, init = {}) => {
      if (init.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ data: { products: { nodes: [] } } }), { status: 200 }));
      return Promise.resolve(new Response('<html><title>Example</title></html>', { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.argv = ['node', 'probe-storefront-store.ts', '--url', 'https://example.test', '--no-ai-discovery'];

    await probeMain();

    const report = JSON.parse(log.mock.calls[0][0]);
    expect(report).toMatchObject({ probeOnly: true, approvalRequired: true, proposedStore: null });
    expect(fetchMock.mock.calls.every(([, init = {}]) => init.method !== 'PUT' && init.method !== 'PATCH' && init.method !== 'DELETE')).toBe(true);
  });
});
