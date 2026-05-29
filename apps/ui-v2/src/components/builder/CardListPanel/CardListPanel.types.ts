import type { PriceLookupState } from '@/hooks/useListPrices';
import type { ListHistoryEntry } from '@/hooks/useListEditor';

export type CardListPanelProps = {
  entries: { name: string; qty: number }[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  results: Record<string, PriceLookupState>;
  inCartByName: (name: string) => boolean;
  history: ListHistoryEntry[];
  existingNames: string[];
  onAddCard: (name: string) => void;
  onRemoveCard: (name: string) => void;
  onUndoHistory: (id: string) => void;
};
