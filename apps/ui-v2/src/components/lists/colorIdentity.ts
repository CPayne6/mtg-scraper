import { colorIdentityName, sortColors } from '@/data/colors';
import type { ListCardRecord } from './ListsContext/ListsContext.types';
export function getListColorIdentity(cards: ListCardRecord[]) {
  if (cards.some((card) => card.colorIdentity === null)) return { colors: null as string | null, label: 'Identity unavailable' };
  const colors = sortColors(cards.map((card) => card.colorIdentity ?? '').join(''));
  return { colors, label: colorIdentityName(colors) };
}
