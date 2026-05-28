import type { CardWithStore, Condition } from '@scoutlgs/shared';

export const CONDITION_TO_LABEL: Record<Condition, string> = {
  nm: 'NM',
  lp: 'LP',
  mp: 'MP',
  hp: 'HP',
  dmg: 'DMG',
  unknown: 'Unknown',
};

export function scryfallPreviewUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
}

export function offerKey(o: CardWithStore): string {
  return `${o.store_key}|${o.set}|${o.card_number ?? ''}|${o.condition}|${o.price}|${o.link ?? ''}`;
}
