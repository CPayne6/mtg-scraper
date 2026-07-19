export type SortBy = 'name' | 'price';

export type SortByMenuProps = {
  value: SortBy;
  onChange: (v: SortBy) => void;
};

export type SortByOption = { key: SortBy; label: string };
