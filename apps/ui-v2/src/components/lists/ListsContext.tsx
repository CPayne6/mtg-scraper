import { createContext, useCallback, useContext, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const LISTS_KEY = 'deck-lists';

export type SavedLists = Record<string, string[]>;

type ListsContextValue = {
  lists: SavedLists;
  names: string[];
  count: number;
  totalCards: number;
  get: (name: string) => string[];
  save: (name: string, cards: string[]) => string;
  rename: (oldName: string, newName: string) => string | null;
  remove: (name: string) => void;
  addCardToList: (listName: string, cardName: string) => void;
  removeCardFromList: (listName: string, cardName: string) => void;
};

const ListsContext = createContext<ListsContextValue | null>(null);

function normalizeName(name: string): string {
  return name.replace(/\W/g, '');
}

export function ListsProvider({ children }: { children: React.ReactNode }) {
  const [lists, setLists] = useLocalStorage<SavedLists>(LISTS_KEY, {});

  const save = useCallback(
    (name: string, cards: string[]) => {
      const key = normalizeName(name) || `list-${Date.now()}`;
      setLists((current) => ({ ...current, [key]: cards }));
      return key;
    },
    [setLists],
  );

  const rename = useCallback(
    (oldName: string, newName: string) => {
      const cleaned = normalizeName(newName);
      if (!cleaned || cleaned === oldName) return null;
      let renamed: string | null = null;
      setLists((current) => {
        if (!current[oldName] || current[cleaned]) return current;
        const cards = current[oldName];
        const next: SavedLists = { ...current };
        delete next[oldName];
        next[cleaned] = cards;
        renamed = cleaned;
        return next;
      });
      return renamed;
    },
    [setLists],
  );

  const remove = useCallback(
    (name: string) =>
      setLists((current) => {
        if (!current[name]) return current;
        const next = { ...current };
        delete next[name];
        return next;
      }),
    [setLists],
  );

  const addCardToList = useCallback(
    (listName: string, cardName: string) =>
      setLists((current) => {
        const existing = current[listName] ?? [];
        return { ...current, [listName]: [...existing, cardName] };
      }),
    [setLists],
  );

  const removeCardFromList = useCallback(
    (listName: string, cardName: string) =>
      setLists((current) => {
        const existing = current[listName];
        if (!existing) return current;
        const idx = existing.indexOf(cardName);
        if (idx < 0) return current;
        const next = existing.slice();
        next.splice(idx, 1);
        return { ...current, [listName]: next };
      }),
    [setLists],
  );

  const get = useCallback((name: string) => lists[name] ?? [], [lists]);

  const names = useMemo(() => Object.keys(lists), [lists]);
  const totalCards = useMemo(() => names.reduce((sum, n) => sum + lists[n].length, 0), [lists, names]);

  const value = useMemo<ListsContextValue>(
    () => ({ lists, names, count: names.length, totalCards, get, save, rename, remove, addCardToList, removeCardFromList }),
    [lists, names, totalCards, get, save, rename, remove, addCardToList, removeCardFromList],
  );

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useLists() {
  const ctx = useContext(ListsContext);
  if (!ctx) throw new Error('useLists must be used inside <ListsProvider>');
  return ctx;
}
