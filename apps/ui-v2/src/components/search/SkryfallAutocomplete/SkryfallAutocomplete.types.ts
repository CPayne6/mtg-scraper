import type { ScryfallCardOption } from '@/api/cards';

export type SkryfallAutocompleteProps = {
  value?: string;
  placeholder?: string;
  size?: 'small' | 'medium';
  autoFocus?: boolean;
  onSelect: (card: ScryfallCardOption) => void;
  onSubmit?: (name: string) => void;
};
