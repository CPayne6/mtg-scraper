import type { Store } from '@scoutlgs/core';

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export interface CartLine {
  variantId: string;
  quantity: number;
}

// The Shopify cart permalink format -- the user lands in a real Shopify cart
// with the items pre-loaded; no Storefront API call required, no token
// required. Each store gets a URL like
// `https://{shop}/cart/{vid}:{qty},{vid}:{qty}`.
export function buildCartPermalink(host: string, lines: CartLine[]): string {
  if (lines.length === 0) {
    throw new Error('cart permalink requires at least one line');
  }
  const parts = lines.map((l) => `${l.variantId}:${l.quantity}`);
  return `https://${host}/cart/${parts.join(',')}`;
}

// Stores either expose their Shopify shop host directly via `baseUrl`
// (e.g. facetofacegames.com) or proxy through a vanity domain backed by
// `scraperConfig.shopifyUrl` (e.g. `house-of-cards-mtg.myshopify.com`).
// The cart permalink MUST hit the actual Shopify host -- vanity-domain
// stores will 404 `/cart/{vid}:{qty}` on the storefront frontend in some
// theme configurations, while the myshopify.com host always works.
export function resolveStoreHost(store: Pick<Store, 'baseUrl' | 'scraperConfig'>): string {
  const configured = store.scraperConfig?.shopifyUrl?.trim();
  if (configured) return configured;
  return new URL(store.baseUrl).host;
}

// Dedupe by variantId and sum quantities. Caps each merged quantity at `maxPerLine`
// because Shopify rejects cart permalinks with absurd quantities and the cap
// matches the DTO's per-line constraint.
export function normalizeLines(lines: CartLineInput[], maxPerLine: number): CartLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    const existing = merged.get(line.variantId) ?? 0;
    merged.set(line.variantId, Math.min(existing + line.quantity, maxPerLine));
  }
  return Array.from(merged.entries()).map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
}
