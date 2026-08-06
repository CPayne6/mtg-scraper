import { colorIdentityName, sortColors } from '@/data/colors';
import type { ListCardEntry } from '@/api/lists';
export function getListColorIdentity(cards: ListCardEntry[]) {
  if (cards.some((card) => card.colorIdentity === null)) return { colors: null as string | null, label: 'Identity unavailable' };
  const colors = sortColors(cards.map((card) => card.colorIdentity ?? '').join(''));
  return { colors, label: colorIdentityName(colors) };
}
