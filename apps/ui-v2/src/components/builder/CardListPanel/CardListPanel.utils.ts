import type { PriceLookupState } from '@/hooks/useListPrices';
import type { DeckListEntry } from '@/utils/parseDeckList';
import type { SortBy } from '../SortByMenu';

export function sortCardListEntries(
  entries: DeckListEntry[],
  sortBy: SortBy,
  results: Record<string, PriceLookupState>,
): DeckListEntry[] {
  const sorted = entries.slice();
  if (sortBy === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }

  sorted.sort((a, b) => {
    const ra = results[a.name];
    const rb = results[b.name];
    const ap = ra?.state === 'success' && ra.cheapest ? ra.cheapest.price : Infinity;
    const bp = rb?.state === 'success' && rb.cheapest ? rb.cheapest.price : Infinity;
    return ap - bp;
  });
  return sorted;
}
