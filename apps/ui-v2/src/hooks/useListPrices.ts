import { useEffect, useMemo, useState } from 'react';
import type { CardWithStore } from '@scoutlgs/shared';
import { fetchCard } from '@/api/cards';

export type PriceLookupState =
  | { state: 'pending' }
  | { state: 'success'; offers: CardWithStore[]; cheapest: CardWithStore | null }
  | { state: 'error'; message: string };

export function useListPrices(uniqueNames: string[]): {
  results: Record<string, PriceLookupState>;
  loadedCount: number;
  isLoaded: boolean;
} {
  // Stable key — re-fetch only when the set of names actually changes.
  const namesKey = useMemo(() => uniqueNames.join('|'), [uniqueNames]);
  const [results, setResults] = useState<Record<string, PriceLookupState>>({});

  useEffect(() => {
    if (uniqueNames.length === 0) {
      setResults({});
      return;
    }
    const controller = new AbortController();
    setResults(Object.fromEntries(uniqueNames.map((n) => [n, { state: 'pending' }])));
    for (const name of uniqueNames) {
      fetchCard(name, controller.signal)
        .then((resp) => {
          if (controller.signal.aborted) return;
          const offers = [...resp.results].sort((a, b) => a.price - b.price);
          const cheapest = offers.length > 0 ? offers[0] : null;
          setResults((prev) => ({
            ...prev,
            [name]: { state: 'success', offers, cheapest },
          }));
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          const message = err instanceof Error ? err.message : 'Failed to fetch';
          setResults((prev) => ({ ...prev, [name]: { state: 'error', message } }));
        });
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  const loadedCount = Object.values(results).filter((r) => r.state !== 'pending').length;
  const isLoaded = uniqueNames.length > 0 && loadedCount === uniqueNames.length;

  return { results, loadedCount, isLoaded };
}
