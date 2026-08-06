import type { CardWithStore, Condition } from '@scoutlgs/shared';

export const CONDITION_TO_LABEL: Record<Condition, string> = {
  nm: 'NM',
  lp: 'LP',
  mp: 'MP',
  hp: 'HP',
  dmg: 'DMG',
  unknown: 'Unknown',
};

export function offerKey(o: CardWithStore): string {
  return `${o.store_key}|${o.set}|${o.card_number ?? ''}|${o.condition}|${o.price}|${o.link ?? ''}`;
}
