import { useCallback, useEffect, useRef, useState } from 'react';
import { useSnackbar } from 'notistack';
import { fetchListRefresh, ListsApiError, startListRefresh, type ListRefreshItem, type ListRefreshStatus } from '@/api/lists';
import { useCart } from '@/components/cart/CartContext';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;
const PROGRESS_TRANSITION_MS = 1_500;
const pending = (status: ListRefreshStatus) => status.status === 'queued' || status.status === 'running';

function refreshErrorMessage(error: unknown): string {
  if (!(error instanceof ListsApiError)) return error instanceof Error ? error.message : 'Unable to refresh this card list.';
  if (error.status === 409) return error.message || 'This card list cannot be refreshed yet. Please try again shortly.';
  if (error.status === 503) return 'List refresh is temporarily unavailable. Please try again later.';
  return error.message || 'Unable to refresh this card list.';
}

function message(items: ListRefreshItem[], cartVariantIds: Set<number>) {
  const unavailableInCart = items.filter((item) => item.outcome === 'unavailable' && cartVariantIds.has(item.variantId));
  if (unavailableInCart.length) {
    return {
      text: `${unavailableInCart.length} ${unavailableInCart.length === 1 ? 'card in your cart is' : 'cards in your cart are'} no longer available.`,
      variant: 'warning' as const,
    };
  }
  return { text: 'Card list refreshed.', variant: 'success' as const };
}

export function useListRefresh(listId: string, hasCards: boolean, onCompleted: () => void) {
  const { enqueueSnackbar } = useSnackbar();
  const { items: cartItems } = useCart();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [refreshItems, setRefreshItems] = useState<ListRefreshItem[]>([]);
  const timeoutRef = useRef<number | null>(null);
  useEffect(() => () => { if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current); }, []);

  const refreshList = useCallback(async () => {
    if (isRefreshing || !hasCards) return;
    setIsRefreshing(true);
    setRefreshProgress(0);
    try {
      const { jobId } = await startListRefresh(listId);
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let status: ListRefreshStatus | null = null;
      let notifiedLongRunning = false;
      while (!status) {
        const candidate = await fetchListRefresh(listId, jobId);
        setRefreshProgress(candidate.progress);
        if (!pending(candidate)) { status = candidate; break; }
        if (!notifiedLongRunning && Date.now() >= deadline) {
          notifiedLongRunning = true;
          enqueueSnackbar('Card list refresh is still running. Your list remains usable.', { variant: 'info' });
        }
        await new Promise<void>((resolve) => { timeoutRef.current = window.setTimeout(resolve, POLL_INTERVAL_MS); });
      }
      if (!status) return;
      // Keep the control mounted long enough for its final stroke animation.
      if (status.status === 'completed') {
        await new Promise<void>((resolve) => { timeoutRef.current = window.setTimeout(resolve, PROGRESS_TRANSITION_MS); });
      }
      setRefreshItems(status.items);
      if (status.status === 'failed') { enqueueSnackbar(status.failedReason ?? 'Card list refresh did not complete. Saved prices were kept.', { variant: 'info' }); return; }
      onCompleted();
      const notification = message(status.items, new Set(cartItems.map((item) => item.id)));
      enqueueSnackbar(notification.text, { variant: notification.variant });
    } catch (error) {
      enqueueSnackbar(refreshErrorMessage(error), { variant: 'error' });
    } finally { setIsRefreshing(false); }
  }, [cartItems, enqueueSnackbar, hasCards, isRefreshing, listId, onCompleted]);

  return { isRefreshing, refreshProgress, refreshItems, refreshList, dismissRefreshResults: () => setRefreshItems([]) };
}
