import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSnackbar } from 'notistack';
import {
  createList as apiCreateList,
  deleteList as apiDeleteList,
  fetchList,
  fetchLists,
  replaceListCards,
  type ListSummary,
} from '@/api/lists';
import type { ListsContextValue, ServerList } from './ListsContext.types';
import { readNameOverrides, writeNameOverrides } from './ListsContext.utils';

const ListsContext = createContext<ListsContextValue | null>(null);

function applyOverrides(
  lists: ServerList[],
  overrides: Record<string, string>,
): ServerList[] {
  if (Object.keys(overrides).length === 0) return lists;
  return lists.map((l) =>
    overrides[l.id] ? { ...l, name: overrides[l.id] } : l,
  );
}

async function loadList(summary: ListSummary): Promise<ServerList | null> {
  try {
    const full = await fetchList(summary.id);
    return {
      id: full.id,
      name: full.name,
      cards: full.cards.map((c) => c.cardName),
    };
  } catch {
    return { id: summary.id, name: summary.name, cards: [] };
  }
}

async function loadAllLists(summaries: ListSummary[]): Promise<ServerList[]> {
  const results = await Promise.all(summaries.map(loadList));
  return results.filter((l): l is ServerList => l !== null);
}

export function ListsProvider({ children }: { children: React.ReactNode }) {
  const [lists, setLists] = useState<ServerList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    readNameOverrides(),
  );
  const { enqueueSnackbar } = useSnackbar();
  const initRan = useRef(false);

  // Initial load: GET /lists, fetch each, optionally migrate localStorage.
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    let active = true;

    async function init() {
      try {
        const summariesResp = await fetchLists();
        const serverLists = await loadAllLists(summariesResp.lists);
        if (!active) return;
        setLists(serverLists);
        setError(null);
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Failed to load lists';
        setError(msg);
        enqueueSnackbar(`Couldn't load saved lists: ${msg}`, { variant: 'error' });
      } finally {
        if (active) setLoading(false);
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [enqueueSnackbar]);

  const visibleLists = useMemo(
    () => applyOverrides(lists, overrides),
    [lists, overrides],
  );

  const get = useCallback(
    (id: string) => visibleLists.find((l) => l.id === id)?.cards ?? [],
    [visibleLists],
  );

  const getList = useCallback(
    (id: string) => visibleLists.find((l) => l.id === id),
    [visibleLists],
  );

  const save = useCallback(
    async (name: string, cards: string[]): Promise<string | null> => {
      if (cards.length === 0) {
        enqueueSnackbar("Can't create an empty list", { variant: 'warning' });
        return null;
      }
      try {
        const created = await apiCreateList({ name, cards });
        const full = await fetchList(created.id);
        const newList: ServerList = {
          id: full.id,
          name: full.name,
          cards: full.cards.map((c) => c.cardName),
        };
        setLists((prev) => [...prev, newList]);
        if (created.warnings.length > 0) {
          enqueueSnackbar(created.warnings.join(' · '), { variant: 'info' });
        }
        return created.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create list';
        enqueueSnackbar(msg, { variant: 'error' });
        return null;
      }
    },
    [enqueueSnackbar],
  );

  const rename = useCallback(
    async (id: string, newName: string): Promise<string | null> => {
      const trimmed = newName.trim();
      if (!trimmed) return null;
      const current = lists.find((l) => l.id === id);
      if (!current) return null;
      // No server rename endpoint yet — persist as a client-side override.
      const nextOverrides = { ...overrides, [id]: trimmed };
      setOverrides(nextOverrides);
      writeNameOverrides(nextOverrides);
      return trimmed;
    },
    [lists, overrides],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic: drop from state immediately, restore on failure.
      const prev = lists;
      const prevOverrides = overrides;
      setLists((current) => current.filter((l) => l.id !== id));
      if (overrides[id]) {
        const { [id]: _removed, ...rest } = overrides;
        setOverrides(rest);
        writeNameOverrides(rest);
      }
      try {
        await apiDeleteList(id);
      } catch (err) {
        setLists(prev);
        if (prevOverrides[id]) {
          setOverrides(prevOverrides);
          writeNameOverrides(prevOverrides);
        }
        const msg = err instanceof Error ? err.message : 'Failed to delete list';
        enqueueSnackbar(msg, { variant: 'error' });
      }
    },
    [lists, overrides, enqueueSnackbar],
  );

  const replaceCardsForList = useCallback(
    async (id: string, prevCards: string[], nextCards: string[]) => {
      // Skip the server call when the list would become empty — the API
      // requires ArrayMinSize(1) on PUT /cards. The server keeps the previous
      // cards; next non-empty mutation re-syncs.
      if (nextCards.length === 0) return;
      try {
        await replaceListCards(id, nextCards);
      } catch (err) {
        // Roll back to the pre-mutation cards.
        setLists((current) =>
          current.map((l) => (l.id === id ? { ...l, cards: prevCards } : l)),
        );
        const msg = err instanceof Error ? err.message : 'Failed to update list';
        enqueueSnackbar(msg, { variant: 'error' });
      }
    },
    [enqueueSnackbar],
  );

  const addCardToList = useCallback(
    async (id: string, cardName: string): Promise<void> => {
      const current = lists.find((l) => l.id === id);
      if (!current) return;
      const nextCards = [...current.cards, cardName];
      setLists((all) =>
        all.map((l) => (l.id === id ? { ...l, cards: nextCards } : l)),
      );
      await replaceCardsForList(id, current.cards, nextCards);
    },
    [lists, replaceCardsForList],
  );

  const removeCardFromList = useCallback(
    async (id: string, cardName: string): Promise<void> => {
      const current = lists.find((l) => l.id === id);
      if (!current) return;
      const idx = current.cards.indexOf(cardName);
      if (idx < 0) return;
      const nextCards = current.cards.slice();
      nextCards.splice(idx, 1);
      setLists((all) =>
        all.map((l) => (l.id === id ? { ...l, cards: nextCards } : l)),
      );
      await replaceCardsForList(id, current.cards, nextCards);
    },
    [lists, replaceCardsForList],
  );

  const names = useMemo(() => visibleLists.map((l) => l.name), [visibleLists]);
  const totalCards = useMemo(
    () => visibleLists.reduce((sum, l) => sum + l.cards.length, 0),
    [visibleLists],
  );

  const value = useMemo<ListsContextValue>(
    () => ({
      lists: visibleLists,
      names,
      count: visibleLists.length,
      totalCards,
      loading,
      error,
      get,
      getList,
      save,
      rename,
      remove,
      addCardToList,
      removeCardFromList,
    }),
    [
      visibleLists,
      names,
      totalCards,
      loading,
      error,
      get,
      getList,
      save,
      rename,
      remove,
      addCardToList,
      removeCardFromList,
    ],
  );

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useLists() {
  const ctx = useContext(ListsContext);
  if (!ctx) throw new Error('useLists must be used inside <ListsProvider>');
  return ctx;
}
