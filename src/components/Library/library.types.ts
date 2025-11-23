
export interface LibraryEntry {
  name: string;
  set?: string;
  card_number?: string;
  scryfall_id?: string;
  foil?: boolean;
  condition?: string;
  [key: string]: string | boolean | undefined;
}

export type LibraryStorage = Record<string, LibraryEntry>
