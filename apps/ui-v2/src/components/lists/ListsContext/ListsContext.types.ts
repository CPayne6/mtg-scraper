export type SavedLists = Record<string, string[]>;

export type ListsContextValue = {
  lists: SavedLists;
  names: string[];
  count: number;
  totalCards: number;
  get: (name: string) => string[];
  save: (name: string, cards: string[]) => string;
  rename: (oldName: string, newName: string) => string | null;
  remove: (name: string) => void;
  addCardToList: (listName: string, cardName: string) => void;
  removeCardFromList: (listName: string, cardName: string) => void;
};
