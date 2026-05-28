import { useCallback, useEffect, useRef } from 'react';
import { useLists } from '@/components/lists/ListsContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export type ListHistoryEntry = {
  id: string;
  type: 'add' | 'remove';
  cardName: string;
  at: number;
};

const MAX_HISTORY = 30;

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore — fall through to fallback
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type UndoResult = 'undone' | 'blocked' | 'noop';

// `listId` is the server list UUID. Mutations are fire-and-forget: ListsContext
// owns the optimistic state and rolls it back on API error (with a toast). The
// history here is local UI state for the Undo affordance.
export function useListEditor(
  listId: string,
  inCartByName: (name: string) => boolean,
): {
  history: ListHistoryEntry[];
  addCard: (cardName: string) => string;
  removeCard: (cardName: string) => string | null;
  undo: (entryId?: string) => UndoResult;
} {
  const { addCardToList, removeCardFromList, getList } = useLists();
  const [history, setHistory] = useLocalStorage<ListHistoryEntry[]>(
    `scoutlgs:list-history:${listId}`,
    [],
  );

  const pushEntry = useCallback(
    (type: 'add' | 'remove', cardName: string) => {
      const entry: ListHistoryEntry = {
        id: makeId(),
        type,
        cardName,
        at: Date.now(),
      };
      setHistory((current) => {
        const next = [entry, ...current];
        if (next.length > MAX_HISTORY) next.length = MAX_HISTORY;
        return next;
      });
      return entry.id;
    },
    [setHistory],
  );

  const addCard = useCallback(
    (cardName: string) => {
      void addCardToList(listId, cardName);
      return pushEntry('add', cardName);
    },
    [addCardToList, listId, pushEntry],
  );

  const removeCard = useCallback(
    (cardName: string): string | null => {
      const list = getList(listId);
      // Server rejects empty lists. Hand off to the context so it surfaces the
      // "lists need at least one card" toast, and skip history so the Undo
      // affordance doesn't accumulate a stale entry.
      if (list && list.cards.length <= 1 && list.cards.includes(cardName)) {
        void removeCardFromList(listId, cardName);
        return null;
      }
      void removeCardFromList(listId, cardName);
      return pushEntry('remove', cardName);
    },
    [getList, removeCardFromList, listId, pushEntry],
  );

  // Keep a ref to the latest history so undo can read it without making the
  // setHistory updater impure (StrictMode double-invokes updaters in dev,
  // which would otherwise apply the inverse mutation twice).
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const undo = useCallback(
    (entryId?: string): UndoResult => {
      const current = historyRef.current;
      if (current.length === 0) return 'noop';
      const target = entryId
        ? current.find((e) => e.id === entryId)
        : current[0];
      if (!target) return 'noop';

      if (target.type === 'add') {
        if (inCartByName(target.cardName)) return 'blocked';
        void removeCardFromList(listId, target.cardName);
      } else {
        void addCardToList(listId, target.cardName);
      }
      setHistory((h) => h.filter((e) => e.id !== target.id));
      return 'undone';
    },
    [addCardToList, inCartByName, listId, removeCardFromList, setHistory],
  );

  return { history, addCard, removeCard, undo };
}
