export type CardListRowProps = {
  name: string;
  selected: boolean;
  inCart: boolean;
  cartPrice?: number;
  artScrollRoot: Element | null;
  onSelect: () => void;
  onRemove?: (cardName: string) => void;
};
