import type { CardWithStore } from '@scoutlgs/shared';

export const CART_KEY = 'scoutlgs:cart';

export function cartItemId(card: CardWithStore): string {
  return `${card.scryfall_id ?? card.title}|${card.store_key}|${card.set ?? ''}|${card.condition ?? ''}`;
}
