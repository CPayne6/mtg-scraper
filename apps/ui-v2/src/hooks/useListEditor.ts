import { useCallback, useEffect, useRef } from 'react';
import { useLists } from '@/components/lists/ListsContext';
import { useCart } from '@/components/cart/CartContext';
import { cartItemId } from '@/components/cart/CartContext/CartContext.utils';
import type { CardWithStore } from '@scoutlgs/shared';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export type ListHistoryEntry = {
  id: string;
  type: 'add' | 'remove' | 'fill';
  cardName: string;
  at: number;
  cartItemIds?: string[];
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

// `listId` is the server list UUID. ListsContext owns optimistic state and
// rollback; additions wait for persistence before they enter undo history.
export function useListEditor(
  listId: string,
  inCartByName: (name: string) => boolean,
): {
  history: ListHistoryEntry[];
  addCard: (cardName: string) => Promise<string | null>;
  removeCard: (cardName: string) => string | null;
  recordCartFill: (cards: CardWithStore[]) => string | null;
  undo: (entryId?: string) => UndoResult;
} {
  const { addCardToList, removeCardFromList, getList } = useLists();
  const { remove: removeCartItem } = useCart();
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
    async (cardName: string) => {
      const added = await addCardToList(listId, cardName);
      return added ? pushEntry('add', cardName) : null;
    },
    [addCardToList, listId, pushEntry],
  );

  const removeCard = useCallback(
    (cardName: string): string | null => {
      const list = getList(listId);
      // Server rejects empty lists. Hand off to the context so it surfaces the
      // "lists need at least one card" toast, and skip history so the Undo
      // affordance doesn't accumulate a stale entry.
      if (list && list.cards.length <= 1 && list.cards.some((card) => card.cardName === cardName)) {
        void removeCardFromList(listId, cardName);
        return null;
      }
      void removeCardFromList(listId, cardName);
      return pushEntry('remove', cardName);
    },
    [getList, removeCardFromList, listId, pushEntry],
  );

  const recordCartFill = useCallback((cards: CardWithStore[]): string | null => {
    if (cards.length === 0) return null;
    const entry: ListHistoryEntry = {
      id: makeId(), type: 'fill', cardName: `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`,
      at: Date.now(), cartItemIds: cards.map((card) => cartItemId(card)),
    };
    setHistory((current) => [entry, ...current].slice(0, MAX_HISTORY));
    return entry.id;
  }, [setHistory]);

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

      if (target.type === 'fill') {
        for (const cartItemIdValue of target.cartItemIds ?? []) removeCartItem(cartItemIdValue);
      } else if (target.type === 'add') {
        if (inCartByName(target.cardName)) return 'blocked';
        void removeCardFromList(listId, target.cardName);
      } else {
        void addCardToList(listId, target.cardName);
      }
      setHistory((h) => h.filter((e) => e.id !== target.id));
      return 'undone';
    },
    [addCardToList, inCartByName, listId, removeCartItem, removeCardFromList, setHistory],
  );

  return { history, addCard, removeCard, recordCartFill, undo };
}
