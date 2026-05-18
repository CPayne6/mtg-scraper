import { useCallback } from 'react';
import type { CardWithStore } from '@scoutlgs/shared';
import { useLocalStorage } from './useLocalStorage';

const KEY = 'scoutlgs:recent-searches';
const MAX = 8;

export function useRecentSearches() {
  const [recents, setRecents] = useLocalStorage<CardWithStore[]>(KEY, []);

  const push = useCallback(
    (card: CardWithStore) => {
      setRecents((prev) => {
        const filtered = prev.filter((c) => c.title.toLowerCase() !== card.title.toLowerCase());
        return [card, ...filtered].slice(0, MAX);
      });
    },
    [setRecents],
  );

  const clear = useCallback(() => setRecents([]), [setRecents]);

  return { recents, push, clear };
}
