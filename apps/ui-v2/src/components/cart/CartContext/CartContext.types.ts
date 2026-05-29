import type { CardWithStore } from '@scoutlgs/shared';

export type CartItem = CardWithStore & { addedAt: number };

export type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (card: CardWithStore) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
};
