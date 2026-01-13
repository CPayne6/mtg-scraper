
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
  storeErrors?: { storeName: string; error: string }[];
}

export interface Set {
  object: string;
  id: string;
  code: string;
  mtgo_code?: string;
  arena_code?: string;
  name: string;
  uri: string;
  scryfall_uri: string;
  search_uri: string;
  released_at: string;
  set_type: string;
  card_count: number;
  digital: boolean;
  nonfoil_only: boolean;
  foil_only: boolean;
  icon_svg_uri: string;
  tcgplayer_id?: number;
  parent_set_code?: string;
  block_code?: string;
  block?: string;
  printed_size?: number;
}
