export type DeckCardProps = {
  name: string;
  colors: string;
  archetype: string;
  count: number;
  updated: string;
  onOpen: () => void;
  onDelete: () => void;
};
