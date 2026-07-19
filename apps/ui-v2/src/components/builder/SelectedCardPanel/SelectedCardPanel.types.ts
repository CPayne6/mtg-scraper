import type { CardWithStore } from '@scoutlgs/shared';
import type { PriceLookupState } from '@/hooks/useListPrices';

export type SelectedCardPanelProps = {
  card: { name: string; set?: string } | null;
  lookup: PriceLookupState | undefined;
  selectedStores: string[];
  conditions: string[];
  inCartByOffer: (offer: CardWithStore) => boolean;
  onAddOffer: (offer: CardWithStore) => void;
  positionLabel?: string;
  canSelectPrevious?: boolean;
  canSelectNext?: boolean;
  onSelectPrevious?: () => void;
  onSelectNext?: () => void;
};
