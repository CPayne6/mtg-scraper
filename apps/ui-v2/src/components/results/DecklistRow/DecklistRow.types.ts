export type DecklistRowProps = {
  qty: number;
  name: string;
  meta: string;
  price: number;
  store: string;
  onStoreChange?: () => void;
  storeActionDisabled?: boolean;
  onOpenBuilder?: () => void;
  onRemove?: () => void;
};
