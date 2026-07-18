export type DecklistRowProps = {
  qty: number;
  name: string;
  meta: string;
  cartOffer?: {
    price: number;
    store: string;
  };
  onOpenBuilder?: () => void;
  onRemoveFromCart?: () => void;
  onRemoveFromList?: () => void;
};
