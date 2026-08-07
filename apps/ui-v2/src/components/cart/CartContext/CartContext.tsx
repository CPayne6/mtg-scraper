import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { clearCart as apiClearCart, fetchCart, replaceCart } from '@/api/cart';
import { useAuth } from '@/components/auth/AuthContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { CardWithStore } from '@scoutlgs/shared';
import type {
  AddManyResult,
  AddResult,
  CartContextValue,
  CartDeliverySelection,
  CartHistoryEntry,
  CartHistoryUndoResult,
  CartItem,
} from './CartContext.types';
import {
  CART_DELIVERY_KEY,
  CART_HISTORY_KEY,
  CART_KEY,
  MAX_CART_ITEMS,
  cartItemId,
  cartVariantIds,
} from './CartContext.utils';

const CartContext = createContext<CartContextValue | null>(null);

function isPersistableCard(card: CardWithStore): card is CardWithStore & { id: number } {
  return Number.isInteger(card.id) && Number(card.id) > 0;
}

function mergeServerItems(serverItems: CartItem[], currentItems: CartItem[]): CartItem[] {
  const addedAtById = new Map(currentItems.map((item) => [item.id, item.addedAt]));
  return serverItems.map((item) => ({
    ...item,
    addedAt: addedAtById.get(item.id) ?? item.addedAt,
  }));
}

function makeHistoryId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useLocalStorage<CartItem[]>(CART_KEY, []);
  const [deliveryByStore, setDeliveryByStore] = useLocalStorage<
    Record<string, CartDeliverySelection>
  >(CART_DELIVERY_KEY, {});
  const [history, setHistory] = useLocalStorage<CartHistoryEntry[]>(CART_HISTORY_KEY, []);
  const [isOpen, setIsOpen] = useState(false);
  const [isMutationLocked, setIsMutationLockedState] = useState(false);
  const { status, principalId } = useAuth();
  const itemsRef = useRef(items);
  const historyRef = useRef(history);
  const mutationLockedRef = useRef(false);
  const syncVersionRef = useRef(0);
  const hydratedPrincipalRef = useRef<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const setMutationLocked = useCallback((locked: boolean) => {
    mutationLockedRef.current = locked;
    setIsMutationLockedState(locked);
  }, []);
  const recordHistory = useCallback((
    type: CartHistoryEntry['type'],
    historyItems: CartItem[],
    historyDeliveryByStore?: Record<string, CartDeliverySelection>,
  ) => {
    if (historyItems.length === 0) return;
    const entry: CartHistoryEntry = {
      id: makeHistoryId(),
      type,
      items: historyItems,
      at: Date.now(),
      deliveryByStore: historyDeliveryByStore,
    };
    setHistory((current) => [entry, ...current].slice(0, 30));
  }, [setHistory]);

  const persist = useCallback(
    async (nextItems: CartItem[]) => {
      const version = ++syncVersionRef.current;
      const response = await replaceCart(cartVariantIds(nextItems));
      if (syncVersionRef.current !== version) return response;
      const mergedItems = mergeServerItems(response.items, itemsRef.current);
      itemsRef.current = mergedItems;
      setItems(mergedItems);
      return response;
    },
    [setItems],
  );

  const sync = useCallback(async () => {
    const response = await replaceCart(cartVariantIds(itemsRef.current));
    const mergedItems = mergeServerItems(response.items, itemsRef.current);
    itemsRef.current = mergedItems;
    setItems(mergedItems);
  }, [setItems]);

  useEffect(() => {
    if (status !== 'ready' || !principalId) return;
    if (hydratedPrincipalRef.current === principalId) return;

    hydratedPrincipalRef.current = principalId;
    const controller = new AbortController();
    let active = true;

    async function hydrateCart() {
      try {
        const response = await fetchCart(controller.signal);
        if (!active) return;

        if (response.items.length > 0) {
          const mergedItems = mergeServerItems(response.items, itemsRef.current);
          itemsRef.current = mergedItems;
          setItems(mergedItems);
          return;
        }

        const localVariantIds = cartVariantIds(itemsRef.current);
        if (localVariantIds.length > 0) {
          const saved = await replaceCart(localVariantIds, controller.signal);
          if (active) {
            const mergedItems = mergeServerItems(saved.items, itemsRef.current);
            itemsRef.current = mergedItems;
            setItems(mergedItems);
          }
        } else if (itemsRef.current.length > 0) {
          itemsRef.current = [];
          setItems([]);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn('Failed to sync cart', err);
        }
      }
    }

    hydrateCart();

    return () => {
      active = false;
      controller.abort();
    };
  }, [principalId, setItems, status]);

  const add = useCallback(
    async (card: CardWithStore): Promise<AddResult> => {
      if (mutationLockedRef.current) return { outcome: 'locked' };
      if (!isPersistableCard(card)) return { outcome: 'invalid' };
      const id = cartItemId(card);
      const currentItems = itemsRef.current;
      if (currentItems.some((c) => cartItemId(c) === id)) return { outcome: 'duplicate' };
      if (cartVariantIds(currentItems).length >= MAX_CART_ITEMS) return { outcome: 'capacity' };

      const nextItems = [...currentItems, { ...card, id: card.id, addedAt: Date.now() }];
      itemsRef.current = nextItems;
      setItems(nextItems);
      try {
        const response = await persist(nextItems);
        if (response && !response.variantIds.includes(card.id)) return { outcome: 'soldOut' };
      } catch (err) {
        console.warn('Failed to persist cart', err);
      }
      recordHistory('add', itemsRef.current.filter((item) => cartItemId(item) === id));
      return { outcome: 'added' };
    },
    [persist, recordHistory, setItems],
  );

  const addMany = useCallback(
    async (cards: CardWithStore[], options: {
      allowWhileLocked?: boolean;
      historyType?: 'add' | 'fill';
    } = {}): Promise<AddManyResult> => {
      if (mutationLockedRef.current && !options.allowWhileLocked) {
        return { added: 0, skippedDuplicate: 0, skippedInvalid: 0, skippedCapacity: 0, skippedSoldOut: 0, addedCards: [] };
      }
      const currentItems = itemsRef.current;
      const existingItemIds = new Set(currentItems.map((item) => cartItemId(item)));
      const existingVariantIds = new Set(cartVariantIds(currentItems));
      const nextItems = [...currentItems];
      const addedAt = Date.now();
      const result: AddManyResult = {
        added: 0,
        skippedDuplicate: 0,
        skippedInvalid: 0,
        skippedCapacity: 0,
        skippedSoldOut: 0,
        addedCards: [],
      };
      const requestedAddedIds = new Set<number>();
      const requestedCards: CardWithStore[] = [];

      for (const card of cards) {
        if (!isPersistableCard(card)) {
          result.skippedInvalid += 1;
          continue;
        }

        const itemId = cartItemId(card);
        if (existingItemIds.has(itemId) || existingVariantIds.has(card.id)) {
          result.skippedDuplicate += 1;
          continue;
        }

        if (existingVariantIds.size >= MAX_CART_ITEMS) {
          result.skippedCapacity += 1;
          continue;
        }

        existingItemIds.add(itemId);
        existingVariantIds.add(card.id);
        requestedAddedIds.add(card.id);
        requestedCards.push(card);
        nextItems.push({ ...card, id: card.id, addedAt });
        result.added += 1;
      }

      if (result.added > 0) {
        itemsRef.current = nextItems;
        setItems(nextItems);
        try {
          const response = await persist(nextItems);
          if (response) {
            const returnedIds = new Set(response.variantIds);
            result.skippedSoldOut = [...requestedAddedIds].filter((id) => !returnedIds.has(id)).length;
            result.added -= result.skippedSoldOut;
            result.addedCards = requestedCards.filter((card) => returnedIds.has(Number(card.id)));
          } else {
            result.addedCards = requestedCards;
          }
        } catch (err) {
          console.warn('Failed to persist cart', err);
          result.addedCards = requestedCards;
        }
        const addedIds = new Set(result.addedCards.map((card) => cartItemId(card)));
        recordHistory(
          options.historyType ?? 'add',
          itemsRef.current.filter((item) => addedIds.has(cartItemId(item))),
        );
      }

      return result;
    },
    [persist, recordHistory, setItems],
  );

  const remove = useCallback(
    (id: string) => {
      if (mutationLockedRef.current) return;
      const currentItems = itemsRef.current;
      const nextItems = currentItems.filter((c) => cartItemId(c) !== id);
      if (nextItems.length === currentItems.length) return;

      recordHistory('remove', currentItems.filter((item) => cartItemId(item) === id));
      itemsRef.current = nextItems;
      setItems(nextItems);
      void persist(nextItems).catch((err) => console.warn('Failed to persist cart', err));
    },
    [persist, recordHistory, setItems],
  );

  const clear = useCallback(() => {
    if (mutationLockedRef.current) return;
    const currentItems = itemsRef.current;
    recordHistory('clear', currentItems, deliveryByStore);
    itemsRef.current = [];
    setItems([]);
    setDeliveryByStore({});
    const version = ++syncVersionRef.current;
    void apiClearCart()
      .then((response) => {
        if (syncVersionRef.current === version) {
          itemsRef.current = response.items;
          setItems(response.items);
        }
      })
      .catch((err) => console.warn('Failed to clear cart', err));
  }, [deliveryByStore, recordHistory, setDeliveryByStore, setItems]);

  const undoHistory = useCallback(async (entryId: string): Promise<CartHistoryUndoResult> => {
    if (mutationLockedRef.current) return 'locked';
    const entry = historyRef.current.find((item) => item.id === entryId);
    if (!entry) return 'noop';

    const currentItems = itemsRef.current;
    const entryIds = new Set(entry.items.map((item) => cartItemId(item)));
    let nextItems: CartItem[];
    let expectedIds: Set<string>;

    if (entry.type === 'add' || entry.type === 'fill') {
      nextItems = currentItems.filter((item) => !entryIds.has(cartItemId(item)));
      expectedIds = new Set(nextItems.map((item) => cartItemId(item)));
    } else {
      const existingIds = new Set(currentItems.map((item) => cartItemId(item)));
      const restored = entry.items.filter((item) =>
        !existingIds.has(cartItemId(item)) && existingIds.size < MAX_CART_ITEMS && existingIds.add(cartItemId(item)),
      );
      nextItems = [...currentItems, ...restored];
      expectedIds = new Set(restored.map((item) => cartItemId(item)));
    }

    itemsRef.current = nextItems;
    setItems(nextItems);
    try {
      const response = await persist(nextItems);
      if (entry.type === 'clear' && entry.deliveryByStore) {
        setDeliveryByStore((current) => ({ ...current, ...entry.deliveryByStore }));
      }
      setHistory((current) => current.filter((item) => item.id !== entryId));
      if (entry.type === 'add' || entry.type === 'fill') return 'undone';
      const returnedIds = new Set(response.items.map((item) => cartItemId(item)));
      return [...expectedIds].every((id) => returnedIds.has(id)) ? 'undone' : 'partial';
    } catch (err) {
      console.warn('Failed to undo cart history', err);
      return 'partial';
    }
  }, [persist, setDeliveryByStore, setHistory, setItems]);

  const setDeliverySelections = useCallback(
    (selections: Record<string, CartDeliverySelection>) => {
      if (mutationLockedRef.current) return;
      setDeliveryByStore((current) => ({ ...current, ...selections }));
    },
    [setDeliveryByStore],
  );

  const has = useCallback((id: string) => items.some((c) => cartItemId(c) === id), [items]);

  const total = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
    const storeKeys = new Set(items.map((item) => item.store_key));
    const shipping = [...storeKeys].reduce(
      (sum, storeKey) => sum + (deliveryByStore[storeKey]?.currency === 'CAD'
        ? deliveryByStore[storeKey].price
        : 0),
      0,
    );
    return subtotal + shipping;
  }, [deliveryByStore, items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.length,
      total,
      isOpen,
      isMutationLocked,
      history,
      open,
      close,
      add,
      addMany,
      remove,
      clear,
      has,
      sync,
      deliveryByStore,
      setDeliverySelections,
      setMutationLocked,
      undoHistory,
    }),
    [
      items,
      total,
      isOpen,
      isMutationLocked,
      history,
      open,
      close,
      add,
      addMany,
      remove,
      clear,
      has,
      sync,
      deliveryByStore,
      setDeliverySelections,
      setMutationLocked,
      undoHistory,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
