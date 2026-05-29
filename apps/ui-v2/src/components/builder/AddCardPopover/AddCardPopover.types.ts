export type AddCardPopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  onAdd: (cardName: string) => void;
  existingNames: string[];
};
