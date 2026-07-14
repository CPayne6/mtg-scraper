import type { CartItem } from '@/components/cart/CartContext';

export function normalizeCardName(name: string) {
  return name
    .replace(/\s*\[[^\]]+\]\s*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLocaleLowerCase();
}

export function cartOffersByName(items: CartItem[]) {
  const offers = new Map<string, CartItem[]>();
  for (const item of items) {
    const key = normalizeCardName(item.title);
    offers.set(key, [...(offers.get(key) ?? []), item]);
  }
  return offers;
}

export function selectedOfferStatus(items: CartItem[]) {
  if (items.length === 0) return undefined;
  return {
    price: items.reduce((sum, item) => sum + (item.price ?? 0), 0),
    store: items.length === 1
      ? items[0].store
      : `${new Set(items.map((item) => item.store)).size} stores`,
  };
}
