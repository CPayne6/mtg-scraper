import type { PriceLookupState } from '@/hooks/useListPrices';
import type { ListCardEntry } from '@/api/lists';
import type { SortBy } from '../SortByMenu';

export function sortCardListEntries(
  entries: ListCardEntry[],
  sortBy: SortBy,
  results: Record<string, PriceLookupState>,
): ListCardEntry[] {
  const sorted = entries.slice();
  if (sortBy === 'name') {
    sorted.sort((a, b) => a.cardName.localeCompare(b.cardName));
    return sorted;
  }

  sorted.sort((a, b) => {
    const ra = results[a.cardName];
    const rb = results[b.cardName];
    const ap = ra?.state === 'success' && ra.cheapest ? ra.cheapest.price : Infinity;
    const bp = rb?.state === 'success' && rb.cheapest ? rb.cheapest.price : Infinity;
    return ap - bp;
  });
  return sorted;
}
