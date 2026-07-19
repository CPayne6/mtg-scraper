import type { ReactNode } from 'react';

export type ConfirmTone = 'default' | 'danger';

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
