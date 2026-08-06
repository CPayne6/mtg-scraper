import type { ListCardEntry } from '@/api/lists';
export type CardListRowProps = {
  card: ListCardEntry;
  selected: boolean;
  inCart: boolean;
  cartPrice?: number;
  artScrollRoot: Element | null;
  onSelect: () => void;
  onRemove?: (cardName: string) => void;
};
