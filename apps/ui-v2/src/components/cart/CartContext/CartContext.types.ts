import type { CardWithStore } from '@scoutlgs/shared';

export type CartItem = CardWithStore & { id: number; addedAt: number };

export type AddManyResult = {
  added: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  skippedCapacity: number;
};

export type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (card: CardWithStore) => boolean;
  addMany: (cards: CardWithStore[]) => AddManyResult;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
  sync: () => Promise<void>;
};
