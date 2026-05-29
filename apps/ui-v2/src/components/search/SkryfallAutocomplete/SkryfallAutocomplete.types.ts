export type SkryfallAutocompleteProps = {
  value?: string;
  placeholder?: string;
  size?: 'small' | 'medium';
  autoFocus?: boolean;
  onSelect: (name: string) => void;
  onSubmit?: (name: string) => void;
};
