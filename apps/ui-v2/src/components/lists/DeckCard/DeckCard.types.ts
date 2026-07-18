export type DeckCardProps = {
  name: string;
  colors: string | null;
  archetype: string;
  count: number;
  updated: string;
  onOpen: () => void;
  onDelete: () => void;
};
