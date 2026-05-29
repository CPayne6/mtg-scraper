// Card condition slugs match the values emitted by the scrapers and stored on
// the listing variants. `dmg` and `unknown` are distinct — `unknown` means we
// couldn't determine the condition, not that the card is damaged.
export enum Condition {
  NM = 'nm',
  LP = 'lp',
  MP = 'mp',
  HP = 'hp',
  DMG = 'dmg',
  UNKNOWN = 'unknown',
}

export interface Card {
  price: number;
  condition: Condition;
  foil?: boolean;
  image: string;
  title: string;
  currency: string;
  link: string;
  set: string;
  card_number: string;
  scryfall_id?: string;
}

// `store` is the store's displayName (human-readable, e.g. "Face to Face Games").
// `store_key` is the store's stable slug from the DB (e.g. "face-to-face-games")
// and must be used anywhere an offer is grouped, filtered, deduped, or compared.
export type CardWithStore = Card & { store: string; store_key: string };

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

export interface PaginationMeta {
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
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
