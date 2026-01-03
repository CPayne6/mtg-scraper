
export type Condition = 'nm' | 'pl' | 'mp' | 'hp' | 'unknown'

export interface Card {
  price: number;
  condition: Condition;
  image: string;
  title: string;
  currency: string;
  link: string;
  set: string;
  card_number: string;
  scryfall_id?: string;
}

export type CardWithStore = Card & { store: string };

export interface StoreInfo {
  id: number;
  uuid: string;
  name: string;
  displayName: string;
  logoUrl?: string;
  cardCount: number;
}

export interface PriceStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface CardSearchResponse {
  cardName: string;
  stores: StoreInfo[];
  priceStats: PriceStats;
  results: CardWithStore[];
  timestamp: number;
}
