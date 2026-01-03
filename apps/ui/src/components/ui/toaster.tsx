"use client"

import { SnackbarProvider, useSnackbar, SnackbarKey } from 'notistack';
import React from 'react';

// Re-export SnackbarProvider as Toaster for compatibility
export const Toaster = SnackbarProvider;

// Create a toaster API similar to Chakra's
interface ToasterOptions {
  title?: string;
  description?: string;
  type?: 'success' | 'error' | 'warning' | 'info' | 'loading';
  duration?: number;
  closable?: boolean;
}

class ToasterAPI {
  private enqueueSnackbar: ReturnType<typeof useSnackbar>['enqueueSnackbar'] | null = null;
  private closeSnackbar: ReturnType<typeof useSnackbar>['closeSnackbar'] | null = null;

  setSnackbar(enqueue: typeof this.enqueueSnackbar, close: typeof this.closeSnackbar) {
    this.enqueueSnackbar = enqueue;
    this.closeSnackbar = close;
  }

  create(options: ToasterOptions): SnackbarKey | null {
    if (!this.enqueueSnackbar) return null;

    const message = options.title || options.description || '';
    const variant = options.type === 'loading' ? 'info' : (options.type || 'info');

    return this.enqueueSnackbar(message, {
      variant,
      autoHideDuration: options.duration,
      anchorOrigin: { horizontal: 'right', vertical: 'bottom' }
    });
  }

  success(options: Omit<ToasterOptions, 'type'>): SnackbarKey | null {
    return this.create({ ...options, type: 'success' });
  }

  error(options: Omit<ToasterOptions, 'type'>): SnackbarKey | null {
    return this.create({ ...options, type: 'error' });
  }

  close(id: SnackbarKey) {
    this.closeSnackbar?.(id);
  }
}

export const toaster = new ToasterAPI();

// Hook to initialize toaster
export function useToasterInit() {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  React.useEffect(() => {
    toaster.setSnackbar(enqueueSnackbar, closeSnackbar);
  }, [enqueueSnackbar, closeSnackbar]);
}
