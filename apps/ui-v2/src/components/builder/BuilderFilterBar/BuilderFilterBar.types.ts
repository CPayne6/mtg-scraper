export type BuilderFilterBarProps = {
  // Store slugs (e.g. "face-to-face-games"), not displayNames.
  allStores: string[];
  // slug -> human label, used for rendering only.
  storeLabels: Record<string, string>;
  selectedStores: string[];
  onToggleStore: (name: string) => void;
  onToggleAll: () => void;
  conditions: string[];
  onToggleCondition: (c: string) => void;
};
