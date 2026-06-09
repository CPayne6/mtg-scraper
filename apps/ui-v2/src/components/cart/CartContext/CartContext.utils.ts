import type { CardWithStore } from '@scoutlgs/shared';

export const CART_KEY = 'scoutlgs:cart';
export const MAX_CART_ITEMS = 150;

export function cartItemId(card: CardWithStore): string {
  if (Number.isInteger(card.id)) return `variant:${card.id}`;
  if (card.variant_id) return `platform:${card.store_key}:${card.variant_id}`;
  return `${card.scryfall_id ?? card.title}|${card.store_key}|${card.set ?? ''}|${card.condition ?? ''}|${card.foil ? 'foil' : 'nonfoil'}`;
}

export function cartVariantIds(items: CardWithStore[]): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const item of items) {
    const id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_CART_ITEMS) break;
  }
  return ids;
}
