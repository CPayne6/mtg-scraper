import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSnackbar } from 'notistack';
import { useAuth } from '@/components/auth/AuthContext';
import {
  createList as apiCreateList,
  deleteList as apiDeleteList,
  fetchList,
  fetchLists,
  renameList as apiRenameList,
  replaceListCards,
  type ListSummary,
} from '@/api/lists';
import type { ListsContextValue, ServerList } from './ListsContext.types';

const ANONYMOUS_LIST_LIMIT = 3;
const USER_LIST_LIMIT = 6;

const ListsContext = createContext<ListsContextValue | null>(null);

function limitForPrincipalKind(kind: 'anonymous' | 'user' | undefined): number {
  return kind === 'user' ? USER_LIST_LIMIT : ANONYMOUS_LIST_LIMIT;
}

async function loadList(
  summary: ListSummary,
  signal?: AbortSignal,
): Promise<ServerList | null> {
  try {
    const full = await fetchList(summary.id, signal);
    return {
      id: full.id,
      name: full.name,
      cards: full.cards.map((c) => c.cardName),
      cardRecords: full.cards.map(({ cardName, colorIdentity }) => ({ cardName, colorIdentity })),
    };
  } catch {
    return { id: summary.id, name: summary.name, cards: [], cardRecords: [] };
  }
}

async function loadAllLists(
  summaries: ListSummary[],
  signal?: AbortSignal,
): Promise<ServerList[]> {
  const results = await Promise.all(
    summaries.map((summary) => loadList(summary, signal)),
  );
  return results.filter((l): l is ServerList => l !== null);
}

export function ListsProvider({ children }: { children: React.ReactNode }) {
  const [lists, setLists] = useState<ServerList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { status: authStatus, principalId, session } = useAuth();
  const listLimit = limitForPrincipalKind(session?.principal?.kind);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    if (authStatus === 'loading') {
      setLoading(true);
      return () => {
        active = false;
        controller.abort();
      };
    }

    if (authStatus === 'error' || !principalId) {
      setLists([]);
      setError(authStatus === 'error' ? 'Authentication unavailable' : null);
      setLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    async function init() {
      try {
        setLoading(true);
        const summariesResp = await fetchLists(controller.signal);
        const serverLists = await loadAllLists(
          summariesResp.lists,
          controller.signal,
        );
        if (!active) return;
        setLists(serverLists);
        setError(null);
      } catch (err) {
        if (!active) return;
        if (err instanceof Error && err.name === 'AbortError') return;
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
      controller.abort();
    };
  }, [authStatus, enqueueSnackbar, principalId]);

  const get = useCallback(
    (id: string) => lists.find((l) => l.id === id)?.cards ?? [],
    [lists],
  );

  const getList = useCallback(
    (id: string) => lists.find((l) => l.id === id),
    [lists],
  );

  const save = useCallback(
    async (name: string, cards: string[]): Promise<string | null> => {
      if (cards.length === 0) {
        enqueueSnackbar("Can't create an empty list", { variant: 'warning' });
        return null;
      }
      if (authStatus !== 'ready' || !principalId) {
        enqueueSnackbar('Your session is still loading. Try again in a moment.', {
          variant: 'warning',
        });
        return null;
      }
      if (lists.length >= listLimit) {
        enqueueSnackbar(
          `You can save up to ${listLimit} card lists. Delete one before creating another.`,
          { variant: 'warning' },
        );
        return null;
      }
      try {
        const created = await apiCreateList({ name, cards });
        const full = await fetchList(created.id);
        const newList: ServerList = {
          id: full.id,
          name: full.name,
          cards: full.cards.map((c) => c.cardName),
          cardRecords: full.cards.map(({ cardName, colorIdentity }) => ({ cardName, colorIdentity })),
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
    [authStatus, enqueueSnackbar, listLimit, lists.length, principalId],
  );

  const rename = useCallback(
    async (id: string, newName: string): Promise<string | null> => {
      const trimmed = newName.trim();
      if (!trimmed) return null;
      const current = lists.find((l) => l.id === id);
      if (!current || current.name === trimmed) return current?.name ?? null;
      // Optimistic update, roll back on error.
      const prevName = current.name;
      setLists((all) =>
        all.map((l) => (l.id === id ? { ...l, name: trimmed } : l)),
      );
      try {
        await apiRenameList(id, trimmed);
        return trimmed;
      } catch (err) {
        setLists((all) =>
          all.map((l) => (l.id === id ? { ...l, name: prevName } : l)),
        );
        const msg = err instanceof Error ? err.message : 'Failed to rename list';
        enqueueSnackbar(msg, { variant: 'error' });
        return null;
      }
    },
    [lists, enqueueSnackbar],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic: drop from state immediately, restore on failure.
      const prev = lists;
      setLists((current) => current.filter((l) => l.id !== id));
      try {
        await apiDeleteList(id);
      } catch (err) {
        setLists(prev);
        const msg = err instanceof Error ? err.message : 'Failed to delete list';
        enqueueSnackbar(msg, { variant: 'error' });
      }
    },
    [lists, enqueueSnackbar],
  );

  const replaceCardsForList = useCallback(
    async (id: string, prevCards: ServerList['cardRecords'], nextCards: string[]) => {
      try {
        const response = await replaceListCards(id, nextCards);
        setLists((current) => current.map((l) => l.id === id ? { ...l, cards: response.cards.map((card) => card.cardName), cardRecords: response.cards } : l));
        if (response.warnings.length) enqueueSnackbar(response.warnings.join(' · '), { variant: 'info' });
      } catch (err) {
        // Roll back to the pre-mutation cards.
        setLists((current) =>
          current.map((l) => (l.id === id ? { ...l, cards: prevCards.map((card) => card.cardName), cardRecords: prevCards } : l)),
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
      const nextRecords = [...current.cardRecords, { cardName, colorIdentity: null }];
      setLists((all) =>
        all.map((l) => (l.id === id ? { ...l, cards: nextCards, cardRecords: nextRecords } : l)),
      );
      await replaceCardsForList(id, current.cardRecords, nextCards);
    },
    [lists, replaceCardsForList],
  );

  const removeCardFromList = useCallback(
    async (id: string, cardName: string): Promise<void> => {
      const current = lists.find((l) => l.id === id);
      if (!current) return;
      const idx = current.cards.indexOf(cardName);
      if (idx < 0) return;
      // Lists must have at least one card on the server side, so refuse the
      // removal here and tell the user. Callers can offer Delete-List instead.
      if (current.cards.length <= 1) {
        enqueueSnackbar(
          'Lists must have at least one card. Delete the list to remove it.',
          { variant: 'warning' },
        );
        return;
      }
      const nextCards = current.cards.slice();
      nextCards.splice(idx, 1);
      const nextRecords = current.cardRecords.slice();
      nextRecords.splice(idx, 1);
      setLists((all) =>
        all.map((l) => (l.id === id ? { ...l, cards: nextCards, cardRecords: nextRecords } : l)),
      );
      await replaceCardsForList(id, current.cardRecords, nextCards);
    },
    [lists, replaceCardsForList, enqueueSnackbar],
  );

  const names = useMemo(() => lists.map((l) => l.name), [lists]);
  const totalCards = useMemo(
    () => lists.reduce((sum, l) => sum + l.cards.length, 0),
    [lists],
  );

  const value = useMemo<ListsContextValue>(
    () => ({
      lists,
      names,
      count: lists.length,
      listLimit,
      canCreateList: lists.length < listLimit,
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
      lists,
      listLimit,
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
