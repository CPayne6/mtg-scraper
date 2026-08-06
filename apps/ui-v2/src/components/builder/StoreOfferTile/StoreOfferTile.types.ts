import type { CardWithStore } from '@scoutlgs/shared';

export type StoreOfferTileProps = {
  offer: CardWithStore;
  isCheapest?: boolean;
  inCart: boolean;
  onAdd: () => void;
  onPreview?: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
};

export type CondVisual = {
  label: string;
  bg: string;
  fg: string;
  border: string;
};
