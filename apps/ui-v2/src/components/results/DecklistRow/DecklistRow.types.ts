export type DecklistRowProps = {
  qty: number;
  name: string;
  meta: string;
  price: number;
  store: string;
  onStoreChange?: () => void;
  onRemove?: () => void;
};
