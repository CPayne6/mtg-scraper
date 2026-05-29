export type CardListRowProps = {
  name: string;
  selected: boolean;
  inCart: boolean;
  onSelect: () => void;
  onRemove?: (cardName: string) => void;
};
