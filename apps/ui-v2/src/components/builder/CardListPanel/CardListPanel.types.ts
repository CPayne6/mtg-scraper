import type { PriceLookupState } from '@/hooks/useListPrices';
import type { ListHistoryEntry } from '@/hooks/useListEditor';
import type { DeckListEntry } from '@/utils/parseDeckList';
import type { SortBy } from '../SortByMenu';

export type CardListPanelProps = {
  entries: DeckListEntry[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  sortBy: SortBy;
  onSortByChange: (sortBy: SortBy) => void;
  results: Record<string, PriceLookupState>;
  inCartByName: (name: string) => boolean;
  history: ListHistoryEntry[];
  existingNames: string[];
  onAddCard: (name: string) => void;
  onRemoveCard: (name: string) => void;
  onUndoHistory: (id: string) => void;
  onAddBestCards: () => void;
  isAddingBestCards: boolean;
  canAddBestCards: boolean;
};
