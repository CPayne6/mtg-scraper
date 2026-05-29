import type { StoreInfo } from '@scoutlgs/shared';

export type FiltersSidebarProps = {
  stores: StoreInfo[];
  selectedStores: string[];
  onToggleStore: (name: string) => void;
  conditions: string[];
  onToggleCondition: (cond: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  storeCounts?: Record<string, number>;
  maxPrice: string;
  onMaxPriceChange: (value: string) => void;
};
