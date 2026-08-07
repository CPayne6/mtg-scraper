import { useCallback, useEffect, useRef, useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  fetchCartRefresh,
  startCartRefresh,
  type CartRefreshItem,
  type CartRefreshStatus,
} from '@/api/cart';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

type EnqueueSnackbar = ReturnType<typeof useSnackbar>['enqueueSnackbar'];

function isPending(status: CartRefreshStatus): boolean {
  return status.status === 'queued' || status.status === 'running';
}

function refreshMessage(items: CartRefreshItem[]): { message: string; variant: 'success' | 'warning' } {
  const unavailable = items.filter((item) => item.outcome === 'unavailable').length;
  const changed = items.filter((item) => item.outcome === 'price_changed').length;
  const unconfirmed = items.filter((item) => item.outcome === 'unconfirmed').length;
  const unsupported = items.filter((item) => item.outcome === 'unsupported').length;

  if (unavailable || changed || unconfirmed || unsupported) {
    return {
      message: `Cart refreshed: ${unavailable} unavailable, ${changed} price ${changed === 1 ? 'change' : 'changes'}${unconfirmed ? `, ${unconfirmed} unconfirmed` : ''}${unsupported ? `, ${unsupported} not mapped yet` : ''}.`,
      variant: unavailable || unconfirmed || unsupported ? 'warning' : 'success',
    };
  }

  return { message: 'Cart refreshed — all selected listings are unchanged.', variant: 'success' };
}

type UseCartRefreshOptions = {
  hasItems: boolean;
  sync: () => Promise<void>;
  enqueueSnackbar: EnqueueSnackbar;
};

export function useCartRefresh({ hasItems, sync, enqueueSnackbar }: UseCartRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshItems, setRefreshItems] = useState<CartRefreshItem[]>([]);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
  }, []);

  const waitForTerminalStatus = useCallback(async (jobId: string): Promise<CartRefreshStatus | null> => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const status = await fetchCartRefresh(jobId);
      if (!isPending(status)) return status;
      await new Promise<void>((resolve) => {
        timeoutRef.current = window.setTimeout(resolve, POLL_INTERVAL_MS);
      });
    }

    return null;
  }, []);

  const finishRefresh = useCallback(async (status: CartRefreshStatus) => {
    setRefreshItems(status.items);
    if (status.status === 'failed') {
      enqueueSnackbar(status.failedReason ?? 'Cart refresh failed. Your saved prices were kept.', { variant: 'error' });
      return;
    }

    await sync();
    const notification = refreshMessage(status.items);
    enqueueSnackbar(notification.message, { variant: notification.variant });
  }, [enqueueSnackbar, sync]);

  const refreshCart = useCallback(async () => {
    if (isRefreshing || !hasItems) return;

    setIsRefreshing(true);
    try {
      const { jobId } = await startCartRefresh();
      const status = await waitForTerminalStatus(jobId);
      if (!status) {
        enqueueSnackbar('Cart refresh is still running. Your cart remains usable.', { variant: 'info' });
        return;
      }
      await finishRefresh(status);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Unable to refresh cart', { variant: 'error' });
    } finally {
      setIsRefreshing(false);
    }
  }, [enqueueSnackbar, finishRefresh, hasItems, isRefreshing, waitForTerminalStatus]);

  return {
    isRefreshing,
    refreshItems,
    refreshCart,
    dismissRefreshResults: () => setRefreshItems([]),
  };
}
