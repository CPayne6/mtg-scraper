import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardWithStore } from '@scoutlgs/shared';
import { fetchCardByName } from '@/api/cards';

const DEFAULT_PAGED_PRICE_PAGE_SIZE = 20;

export type PriceLookupState =
  | { state: 'pending' }
  | { state: 'success'; offers: CardWithStore[]; cheapest: CardWithStore | null }
  | { state: 'error'; message: string };

export type UsePagedListPricesOptions = {
  pageSize?: number;
};

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
      fetchCardByName(name, controller.signal)
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

export function usePagedListPrices(
  uniqueNames: string[],
  options: UsePagedListPricesOptions = {},
): {
  results: Record<string, PriceLookupState>;
  loadedCount: number;
  requestedCount: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoaded: boolean;
  loadMore: () => void;
  loadNames: (names: string[]) => void;
} {
  const pageSize = Math.max(
    1,
    Math.floor(options.pageSize ?? DEFAULT_PAGED_PRICE_PAGE_SIZE),
  );
  const namesKey = useMemo(() => uniqueNames.join('|'), [uniqueNames]);
  const namesRef = useRef(uniqueNames);
  const requestedNamesRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<AbortController[]>([]);
  const [results, setResults] = useState<Record<string, PriceLookupState>>({});
  const [requestedRevision, setRequestedRevision] = useState(0);
  const [activeRequests, setActiveRequests] = useState(0);

  useEffect(() => {
    namesRef.current = uniqueNames;
  }, [namesKey, uniqueNames]);

  useEffect(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current = [];
    requestedNamesRef.current = new Set();
    setResults({});
    setRequestedRevision((revision) => revision + 1);
    setActiveRequests(0);

    return () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current = [];
    };
  }, [namesKey]);

  const loadNames = useCallback((names: string[]) => {
    if (names.length === 0) return;

    const availableNames = new Set(namesRef.current);
    const toFetch = names.filter(
      (name) =>
        availableNames.has(name) && !requestedNamesRef.current.has(name),
    );
    if (toFetch.length === 0) return;

    toFetch.forEach((name) => requestedNamesRef.current.add(name));
    setRequestedRevision((revision) => revision + 1);
    setResults((prev) => {
      const next = { ...prev };
      toFetch.forEach((name) => {
        next[name] = { state: 'pending' };
      });
      return next;
    });

    const controller = new AbortController();
    controllersRef.current.push(controller);
    setActiveRequests((count) => count + 1);

    void Promise.all(
      toFetch.map(async (name) => {
        try {
          const resp = await fetchCardByName(name, controller.signal);
          if (controller.signal.aborted) return;
          const offers = [...resp.results].sort((a, b) => a.price - b.price);
          const cheapest = offers.length > 0 ? offers[0] : null;
          setResults((prev) => ({
            ...prev,
            [name]: { state: 'success', offers, cheapest },
          }));
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          const message = err instanceof Error ? err.message : 'Failed to fetch';
          setResults((prev) => ({
            ...prev,
            [name]: { state: 'error', message },
          }));
        }
      }),
    ).finally(() => {
      controllersRef.current = controllersRef.current.filter(
        (entry) => entry !== controller,
      );
      setActiveRequests((count) => Math.max(0, count - 1));
    });
  }, []);

  const loadMore = useCallback(() => {
    const nextNames = namesRef.current
      .filter((name) => !requestedNamesRef.current.has(name))
      .slice(0, pageSize);
    loadNames(nextNames);
  }, [loadNames, pageSize]);

  const loadedCount = Object.values(results).filter((r) => r.state !== 'pending').length;
  const requestedCount = requestedNamesRef.current.size;
  const hasMore = useMemo(
    () => uniqueNames.some((name) => !requestedNamesRef.current.has(name)),
    [requestedRevision, uniqueNames],
  );
  const isLoaded = uniqueNames.length > 0 && loadedCount === uniqueNames.length;

  return {
    results,
    loadedCount,
    requestedCount,
    hasMore,
    isLoading: activeRequests > 0,
    isLoaded,
    loadMore,
    loadNames,
  };
}
