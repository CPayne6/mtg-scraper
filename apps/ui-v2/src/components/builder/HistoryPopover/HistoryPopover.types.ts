import type { ListHistoryEntry } from '@/hooks/useListEditor';

export type HistoryPopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  history: ListHistoryEntry[];
  onUndo: (id: string) => void;
};
