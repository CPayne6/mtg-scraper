import { describe, expect, it } from 'vitest';
import type { Store } from '@scoutlgs/core';
import { buildCartPermalink, normalizeLines, resolveStoreHost } from './cart-permalink';

describe('buildCartPermalink', () => {
  it('builds a single-line permalink', () => {
    const url = buildCartPermalink('store.401games.ca', [
      { variantId: '12345', quantity: 1 },
    ]);
    expect(url).toBe('https://store.401games.ca/cart/12345:1');
  });

  it('joins multiple lines with commas', () => {
    const url = buildCartPermalink('facetofacegames.com', [
      { variantId: '111', quantity: 2 },
      { variantId: '222', quantity: 4 },
      { variantId: '333', quantity: 1 },
    ]);
    expect(url).toBe('https://facetofacegames.com/cart/111:2,222:4,333:1');
  });

  it('throws on empty lines', () => {
    expect(() => buildCartPermalink('x.com', [])).toThrow(/at least one/i);
  });
});

describe('resolveStoreHost', () => {
  const makeStore = (overrides: Partial<Store> = {}): Pick<Store, 'baseUrl' | 'scraperConfig'> => ({
    baseUrl: 'https://facetofacegames.com',
    scraperConfig: undefined,
    ...overrides,
  });

  it('uses baseUrl host when scraperConfig.shopifyUrl is unset', () => {
    expect(resolveStoreHost(makeStore())).toBe('facetofacegames.com');
  });

  it('prefers scraperConfig.shopifyUrl when present', () => {
    expect(
      resolveStoreHost(
        makeStore({
          baseUrl: 'https://houseofcards.ca',
          scraperConfig: { shopifyUrl: 'house-of-cards-mtg.myshopify.com' },
        }),
      ),
    ).toBe('house-of-cards-mtg.myshopify.com');
  });

  it('trims surrounding whitespace from scraperConfig.shopifyUrl', () => {
    expect(
      resolveStoreHost(
        makeStore({ scraperConfig: { shopifyUrl: '  shop.myshopify.com  ' } }),
      ),
    ).toBe('shop.myshopify.com');
  });

  it('treats empty shopifyUrl as unset', () => {
    expect(
      resolveStoreHost(makeStore({ scraperConfig: { shopifyUrl: '   ' } })),
    ).toBe('facetofacegames.com');
  });

  it('strips path/port from baseUrl when falling back', () => {
    expect(
      resolveStoreHost(makeStore({ baseUrl: 'https://shop.example.com:8080/products' })),
    ).toBe('shop.example.com:8080');
  });
});

describe('normalizeLines', () => {
  it('returns lines unchanged when all variantIds are unique', () => {
    const out = normalizeLines(
      [
        { variantId: '1', quantity: 1 },
        { variantId: '2', quantity: 3 },
      ],
      20,
    );
    expect(out).toEqual([
      { variantId: '1', quantity: 1 },
      { variantId: '2', quantity: 3 },
    ]);
  });

  it('sums duplicate variantId quantities', () => {
    const out = normalizeLines(
      [
        { variantId: '1', quantity: 1 },
        { variantId: '1', quantity: 2 },
        { variantId: '2', quantity: 1 },
      ],
      20,
    );
    const byId = Object.fromEntries(out.map((l) => [l.variantId, l.quantity]));
    expect(byId).toEqual({ '1': 3, '2': 1 });
  });

  it('caps merged quantity at maxPerLine', () => {
    const out = normalizeLines(
      [
        { variantId: '1', quantity: 18 },
        { variantId: '1', quantity: 5 },
      ],
      20,
    );
    expect(out).toEqual([{ variantId: '1', quantity: 20 }]);
  });
});
