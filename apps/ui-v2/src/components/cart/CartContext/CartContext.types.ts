import type { CardWithStore } from '@scoutlgs/shared';

export type CartItem = CardWithStore & { id: number; addedAt: number };

export type CartDeliverySelection = {
  label: string;
  price: number;
  currency: string;
};

export type AddManyResult = {
  added: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  skippedCapacity: number;
  skippedSoldOut: number;
};

export type CartAddOutcome = 'added' | 'duplicate' | 'capacity' | 'invalid' | 'soldOut';

export type AddResult = { outcome: CartAddOutcome };

export type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (card: CardWithStore) => Promise<AddResult>;
  addMany: (cards: CardWithStore[]) => Promise<AddManyResult>;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
  sync: () => Promise<void>;
  deliveryByStore: Record<string, CartDeliverySelection>;
  setDeliverySelections: (
    selections: Record<string, CartDeliverySelection>,
  ) => void;
};
