import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { CardWithStore } from '@scoutlgs/shared';
import type { CartContextValue, CartItem } from './CartContext.types';
import { CART_KEY, cartItemId } from './CartContext.utils';

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useLocalStorage<CartItem[]>(CART_KEY, []);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const add = useCallback(
    (card: CardWithStore) => {
      const id = cartItemId(card);
      let added = false;
      setItems((current) => {
        if (current.some((c) => cartItemId(c) === id)) return current;
        added = true;
        return [...current, { ...card, addedAt: Date.now() }];
      });
      return added;
    },
    [setItems],
  );

  const remove = useCallback(
    (id: string) => setItems((current) => current.filter((c) => cartItemId(c) !== id)),
    [setItems],
  );

  const clear = useCallback(() => setItems([]), [setItems]);

  const has = useCallback((id: string) => items.some((c) => cartItemId(c) === id), [items]);

  const total = useMemo(() => items.reduce((sum, c) => sum + (c.price ?? 0), 0), [items]);

  const value = useMemo<CartContextValue>(
    () => ({ items, count: items.length, total, isOpen, open, close, add, remove, clear, has }),
    [items, total, isOpen, open, close, add, remove, clear, has],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
