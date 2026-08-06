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
  addedCards: CardWithStore[];
};

export type CartAddOutcome = 'added' | 'duplicate' | 'capacity' | 'invalid' | 'soldOut' | 'locked';

export type AddResult = { outcome: CartAddOutcome };

export type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  isOpen: boolean;
  isMutationLocked: boolean;
  open: () => void;
  close: () => void;
  add: (card: CardWithStore) => Promise<AddResult>;
  addMany: (cards: CardWithStore[], options?: { allowWhileLocked?: boolean }) => Promise<AddManyResult>;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
  sync: () => Promise<void>;
  deliveryByStore: Record<string, CartDeliverySelection>;
  setDeliverySelections: (
    selections: Record<string, CartDeliverySelection>,
  ) => void;
  setMutationLocked: (locked: boolean) => void;
};
