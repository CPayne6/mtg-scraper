export type ServerList = {
  id: string;
  name: string;
  cards: string[];
};

export type ListsContextValue = {
  lists: ServerList[];
  names: string[];
  count: number;
  listLimit: number;
  canCreateList: boolean;
  totalCards: number;
  loading: boolean;
  error: string | null;
  get: (id: string) => string[];
  getList: (id: string) => ServerList | undefined;
  save: (name: string, cards: string[]) => Promise<string | null>;
  rename: (id: string, newName: string) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  addCardToList: (id: string, cardName: string) => Promise<void>;
  removeCardFromList: (id: string, cardName: string) => Promise<void>;
};
