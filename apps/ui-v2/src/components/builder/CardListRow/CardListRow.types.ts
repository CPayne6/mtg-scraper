export type CardListRowProps = {
  name: string;
  selected: boolean;
  inCart: boolean;
  cartPrice?: number;
  onSelect: () => void;
  onRemove?: (cardName: string) => void;
};
