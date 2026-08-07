import type { CardWithStore } from '@scoutlgs/shared';

export type CartItem = CardWithStore & { id: number; addedAt: number };

export type CartHistoryEntry = {
  id: string;
  type: 'add' | 'remove' | 'clear' | 'fill';
  items: CartItem[];
  at: number;
  deliveryByStore?: Record<string, CartDeliverySelection>;
};

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
export type CartHistoryUndoResult = 'undone' | 'partial' | 'locked' | 'noop';

export type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  isOpen: boolean;
  isMutationLocked: boolean;
  history: CartHistoryEntry[];
  open: () => void;
  close: () => void;
  add: (card: CardWithStore) => Promise<AddResult>;
  addMany: (cards: CardWithStore[], options?: {
    allowWhileLocked?: boolean;
    historyType?: 'add' | 'fill';
  }) => Promise<AddManyResult>;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
  sync: () => Promise<void>;
  deliveryByStore: Record<string, CartDeliverySelection>;
  setDeliverySelections: (
    selections: Record<string, CartDeliverySelection>,
  ) => void;
  setMutationLocked: (locked: boolean) => void;
  undoHistory: (entryId: string) => Promise<CartHistoryUndoResult>;
};
