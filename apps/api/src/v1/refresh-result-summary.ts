import type { CartProductRefreshJobResult } from '@scoutlgs/shared';

type RefreshItem = CartProductRefreshJobResult['items'][number];

/**
 * The worker needs an outcome for every offer so cart reconciliation can
 * remove only the exact unavailable variants.  That is not a useful shape
 * for the client: a single card can have hundreds of offers.  Collapse that
 * internal data to one meaningful outcome per canonical card for the API.
 */
export function summarizeRefreshItemsByCard(items: RefreshItem[]): RefreshItem[] {
  const groups = new Map<string, RefreshItem[]>();
  for (const item of items) {
    const key = item.cardKey ?? `variant:${item.variantId}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const changed = group.find((item) => item.outcome === 'price_changed');
    const confirmed = changed ?? group.find((item) => item.outcome === 'refreshed');
    // A missing offer at one store is not an unavailable card when another
    // offer was confirmed.  Only report unavailable when every known offer
    // for the card was confirmed absent.
    if (confirmed) return confirmed;
    if (group.every((item) => item.outcome === 'unavailable')) {
      return group[0];
    }
    return group.find((item) => item.outcome === 'unconfirmed')
      ?? group.find((item) => item.outcome === 'unsupported')
      ?? group[0];
  });
}
