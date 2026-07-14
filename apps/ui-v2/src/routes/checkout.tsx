import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowBack, Close, OpenInNew } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import {
  buildCheckout,
  CheckoutBuildError,
  replaceCart,
} from '@/api/cart';
import {
  cartItemId,
  formatCartItemName,
  type CartItem,
  useCart,
} from '@/components/cart/CartContext';
import { cartVariantIds } from '@/components/cart/CartContext/CartContext.utils';
import { CardPreview, CartThumbnail } from '@/components/cart/ItemThumbnail';

export const Route = createFileRoute('/checkout')({
  component: CheckoutRoute,
});

type StoreGroup = {
  storeKey: string;
  storeDisplayName: string;
  items: CartItem[];
  subtotal: number;
  lines: Map<string, number>;
};

type StoreCheckoutState =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; message: string; retryAfterSec?: number };

function cartFingerprint(items: CartItem[]): string {
  return cartVariantIds(items).sort((a, b) => a - b).join(',');
}

function buildErrorState(err: unknown): StoreCheckoutState {
  if (err instanceof CheckoutBuildError) {
    if (err.status === 429) {
      return {
        kind: 'error',
        message: 'Too many checkout attempts.',
        retryAfterSec: err.retryAfterSec,
      };
    }
    if (err.errorCode === 'unknown-store') {
      return {
        kind: 'error',
        message: `Unknown store "${err.storeKey ?? ''}" -- refresh the page and try again.`,
      };
    }
    if (err.errorCode === 'empty-cart') {
      return { kind: 'error', message: 'Cart is empty -- add cards and try again.' };
    }
    if (err.status === 401) {
      return { kind: 'error', message: 'Session expired -- refresh the page and try again.' };
    }
    if (err.status === 403) {
      return { kind: 'error', message: 'Request blocked -- refresh the page and try again.' };
    }
  }
  return { kind: 'error', message: 'Checkout failed -- please try again.' };
}

function CheckoutRoute() {
  const navigate = useNavigate();
  const { items, remove } = useCart();
  const { enqueueSnackbar } = useSnackbar();

  const [storeStates, setStoreStates] = useState<Record<string, StoreCheckoutState>>({});
  const [openedKeys, setOpenedKeys] = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const lastBuiltFingerprint = useRef('');

  const currentFingerprint = useMemo(() => cartFingerprint(items), [items]);
  const currentFingerprintRef = useRef(currentFingerprint);
  useEffect(() => {
    currentFingerprintRef.current = currentFingerprint;
  }, [currentFingerprint]);

  // Invalidate cached checkout URLs when the cart changes after a build.
  useEffect(() => {
    if (
      lastBuiltFingerprint.current !== '' &&
      lastBuiltFingerprint.current !== currentFingerprint
    ) {
      setStoreStates({});
      lastBuiltFingerprint.current = '';
    }
  }, [currentFingerprint]);

  // Abort any in-flight build on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const groups = useMemo<StoreGroup[]>(() => {
    const map = new Map<string, StoreGroup>();
    for (const item of items) {
      if (!item.variant_id) continue;
      let group = map.get(item.store_key);
      if (!group) {
        group = {
          storeKey: item.store_key,
          storeDisplayName: item.store,
          items: [],
          subtotal: 0,
          lines: new Map(),
        };
        map.set(item.store_key, group);
      }
      group.items.push(item);
      group.subtotal += item.price ?? 0;
      group.lines.set(
        item.variant_id,
        (group.lines.get(item.variant_id) ?? 0) + 1,
      );
    }
    return Array.from(map.values());
  }, [items]);

  const droppedNoVariant = items.length - groups.reduce((sum, g) => sum + g.items.length, 0);

  // Redirect home if cart is empty (e.g. user navigated to /checkout directly).
  useEffect(() => {
    if (groups.length === 0) {
      navigate({ to: '/' });
    }
  }, [groups.length, navigate]);

  const anyBuilding = Object.values(storeStates).some((s) => s.kind === 'building');

  const handleCheckoutClick = useCallback(
    async (storeKey: string, storeDisplayName: string) => {
      const current = storeStates[storeKey];

      // If already ready the button is a native <a> — just track the open.
      if (current?.kind === 'ready') {
        setOpenedKeys((prev) => {
          const next = new Set(prev);
          next.add(storeKey);
          return next;
        });
        enqueueSnackbar(`Opening ${storeDisplayName}...`, { variant: 'success' });
        return;
      }

      // Don't start a new build while one is in progress.
      if (current?.kind === 'building') return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStoreStates((prev) => ({ ...prev, [storeKey]: { kind: 'building' } }));
      const fingerprintAtBuild = currentFingerprintRef.current;

      try {
        const variantIds = cartVariantIds(items);
        await replaceCart(variantIds, controller.signal);
        const result = await buildCheckout(controller.signal);

        // Discard if the cart changed while we were building.
        if (fingerprintAtBuild !== currentFingerprintRef.current) {
          setStoreStates({});
          return;
        }

        // Cache ALL store URLs from the response.
        const nextStates: Record<string, StoreCheckoutState> = {};
        for (const entry of result.stores) {
          nextStates[entry.storeKey] = { kind: 'ready', url: entry.checkoutUrl };
        }
        lastBuiltFingerprint.current = fingerprintAtBuild;
        setStoreStates((prev) => ({ ...prev, ...nextStates }));
      } catch (err) {
        if (controller.signal.aborted) return;
        setStoreStates((prev) => ({ ...prev, [storeKey]: buildErrorState(err) }));
      }
    },
    [storeStates, items, enqueueSnackbar],
  );

  if (groups.length === 0) return null;

  const total = groups.reduce((sum, g) => sum + g.subtotal, 0);

  return (
    <Container maxWidth="md" sx={{ pb: 6 }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate({ to: '/' })}
        sx={{ mb: 2, ml: -1 }}
        size="small"
      >
        Back
      </Button>
      <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'primary.main', mb: 0.5 }}>
        Checkout
      </Typography>
      <Typography variant="h2" sx={{ mb: 1 }}>
        Check out at each store
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Each store has its own cart. Click a store's button to build the checkout link, then open it in a new tab. ScoutLGS doesn't take payment.
      </Typography>

      {droppedNoVariant > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {droppedNoVariant} item{droppedNoVariant === 1 ? '' : 's'} skipped (no Shopify variant id yet -- try again once prices have loaded).
        </Alert>
      )}

      <Stack spacing={2}>
        {groups.map((group) => {
          const storeState = storeStates[group.storeKey] ?? { kind: 'idle' as const };
          const isReady = storeState.kind === 'ready';
          const isBuilding = storeState.kind === 'building';
          const isError = storeState.kind === 'error';
          const opened = openedKeys.has(group.storeKey);

          return (
            <Box
              key={group.storeKey}
              sx={(theme) => ({
                p: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                bgcolor: 'background.paper',
              })}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5, gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
                    {group.storeDisplayName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {group.items.length} {group.items.length === 1 ? 'card' : 'cards'}
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, color: 'primary.main', flexShrink: 0 }}>
                  CA${group.subtotal.toFixed(2)}
                </Typography>
              </Box>

              <Stack spacing={1} sx={{ mb: 2 }}>
                {group.items.map((item) => (
                  <Box
                    key={cartItemId(item)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      py: 0.5,
                      borderRadius: 1,
                      transition: 'background-color 120ms ease',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Tooltip
                      placement="top"
                      enterDelay={120}
                      enterNextDelay={80}
                      leaveDelay={40}
                      title={<CardPreview item={item} />}
                      slotProps={{
                        tooltip: {
                          sx: {
                            bgcolor: 'transparent',
                            p: 0,
                            maxWidth: 'none',
                          },
                        },
                        // Anchor the popper to the thumbnail with a small gap, no arrow.
                        popper: {
                          modifiers: [{ name: 'offset', options: { offset: [0, 8] } }],
                        },
                      }}
                    >
                      <CartThumbnail item={item} />
                    </Tooltip>
                    <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <Typography
                        sx={{
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {formatCartItemName(item)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {item.set} · {item.condition?.toUpperCase()}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, flexShrink: 0 }}>
                      CA${(item.price ?? 0).toFixed(2)}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label="Remove"
                      onClick={() => remove(cartItemId(item))}
                      sx={{ width: 28, height: 28, flexShrink: 0 }}
                    >
                      <Close sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Stack>

              {isError && (
                <Alert severity="error" sx={{ mb: 1.5 }}>
                  {storeState.message}
                  {storeState.retryAfterSec ? ` Try again in ${storeState.retryAfterSec}s.` : ''}
                </Alert>
              )}

              <Button
                variant={isReady && opened ? 'outlined' : 'contained'}
                color={isError ? 'error' : 'primary'}
                fullWidth
                startIcon={
                  isBuilding ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <OpenInNew />
                  )
                }
                disabled={isBuilding || (anyBuilding && !isBuilding)}
                {...(isReady
                  ? {
                      component: 'a' as const,
                      href: storeState.url,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                    }
                  : {})}
                onClick={() => handleCheckoutClick(group.storeKey, group.storeDisplayName)}
              >
                {isBuilding
                  ? 'Building cart...'
                  : isError
                    ? `Retry ${group.storeDisplayName}`
                    : isReady && opened
                      ? `Re-open ${group.storeDisplayName}`
                      : isReady
                        ? `Open ${group.storeDisplayName}`
                        : `Check out at ${group.storeDisplayName}`}
              </Button>
            </Box>
          );
        })}
      </Stack>

      <Box sx={(theme) => ({ mt: 3, pt: 2, borderTop: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' })}>
        <Typography variant="body2" color="text.secondary">
          Total across {groups.length} {groups.length === 1 ? 'store' : 'stores'}
        </Typography>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'primary.main' }}>
          CA${total.toFixed(2)}
        </Typography>
      </Box>
    </Container>
  );
}
