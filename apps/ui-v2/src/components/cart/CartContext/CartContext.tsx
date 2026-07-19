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
  CartContextValue,
  CartDeliverySelection,
  CartItem,
} from './CartContext.types';
import {
  CART_DELIVERY_KEY,
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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useLocalStorage<CartItem[]>(CART_KEY, []);
  const [deliveryByStore, setDeliveryByStore] = useLocalStorage<
    Record<string, CartDeliverySelection>
  >(CART_DELIVERY_KEY, {});
  const [isOpen, setIsOpen] = useState(false);
  const { status, principalId } = useAuth();
  const itemsRef = useRef(items);
  const syncVersionRef = useRef(0);
  const hydratedPrincipalRef = useRef<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const persist = useCallback(
    async (nextItems: CartItem[]) => {
      const version = ++syncVersionRef.current;
      const response = await replaceCart(cartVariantIds(nextItems));
      if (syncVersionRef.current !== version) return;
      const mergedItems = mergeServerItems(response.items, itemsRef.current);
      itemsRef.current = mergedItems;
      setItems(mergedItems);
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
    (card: CardWithStore) => {
      if (!isPersistableCard(card)) return false;
      const id = cartItemId(card);
      const currentItems = itemsRef.current;
      if (currentItems.some((c) => cartItemId(c) === id)) return false;
      if (cartVariantIds(currentItems).length >= MAX_CART_ITEMS) return false;

      const nextItems = [...currentItems, { ...card, id: card.id, addedAt: Date.now() }];
      itemsRef.current = nextItems;
      setItems(nextItems);
      void persist(nextItems).catch((err) => console.warn('Failed to persist cart', err));
      return true;
    },
    [persist, setItems],
  );

  const addMany = useCallback(
    (cards: CardWithStore[]): AddManyResult => {
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
      };

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
        nextItems.push({ ...card, id: card.id, addedAt });
        result.added += 1;
      }

      if (result.added > 0) {
        itemsRef.current = nextItems;
        setItems(nextItems);
        void persist(nextItems).catch((err) => console.warn('Failed to persist cart', err));
      }

      return result;
    },
    [persist, setItems],
  );

  const remove = useCallback(
    (id: string) => {
      const currentItems = itemsRef.current;
      const nextItems = currentItems.filter((c) => cartItemId(c) !== id);
      if (nextItems.length === currentItems.length) return;

      itemsRef.current = nextItems;
      setItems(nextItems);
      void persist(nextItems).catch((err) => console.warn('Failed to persist cart', err));
    },
    [persist, setItems],
  );

  const clear = useCallback(() => {
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
  }, [setDeliveryByStore, setItems]);

  const setDeliverySelections = useCallback(
    (selections: Record<string, CartDeliverySelection>) => {
      setDeliveryByStore((current) => ({ ...current, ...selections }));
    },
    [setDeliveryByStore],
  );

  const has = useCallback((id: string) => items.some((c) => cartItemId(c) === id), [items]);

  const total = useMemo(() => items.reduce((sum, c) => sum + (c.price ?? 0), 0), [items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.length,
      total,
      isOpen,
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
    }),
    [
      items,
      total,
      isOpen,
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
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
