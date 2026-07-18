import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowBack, Close, ExpandMore, OpenInNew } from '@mui/icons-material';
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
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const initialGroupsRef = useRef('');
  const requestedFingerprintRef = useRef<string | null>(null);

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
      // React Strict Mode runs effect cleanup once before re-running effects
      // in development. Allow that second pass to request this fingerprint
      // again after the first request is aborted.
      requestedFingerprintRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
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

  // Keep the initial scan compact: one store opens by default, multiple stores don't.
  useEffect(() => {
    const groupKey = groups.map((group) => group.storeKey).join(',');
    if (groupKey === initialGroupsRef.current) return;
    initialGroupsRef.current = groupKey;
    setExpandedKeys(groups.length === 1 ? new Set([groups[0].storeKey]) : new Set());
  }, [groups]);

  // Redirect home if cart is empty (e.g. user navigated to /checkout directly).
  useEffect(() => {
    if (groups.length === 0) {
      navigate({ to: '/' });
    }
  }, [groups.length, navigate]);

  const anyBuilding = Object.values(storeStates).some((s) => s.kind === 'building');

  const buildCheckoutLinks = useCallback(
    async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const buildingStates: Record<string, StoreCheckoutState> = Object.fromEntries(
        groups.map((group) => [group.storeKey, { kind: 'building' } as StoreCheckoutState]),
      );
      setStoreStates(buildingStates);
      const fingerprintAtBuild = currentFingerprintRef.current;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15_000);

      try {
        const variantIds = cartVariantIds(items);
        await replaceCart(variantIds, controller.signal);
        const result = await buildCheckout(controller.signal);

        // Discard if the cart changed while we were building.
        if (fingerprintAtBuild !== currentFingerprintRef.current) {
          setStoreStates({});
          return;
        }

        // Cache all generated URLs until the cart fingerprint changes.
        const urls = new Map(result.stores.map((entry) => [entry.storeKey, entry.checkoutUrl]));
        const nextStates: Record<string, StoreCheckoutState> = {};
        for (const group of groups) {
          const url = urls.get(group.storeKey);
          nextStates[group.storeKey] = url
            ? { kind: 'ready', url }
            : { kind: 'error', message: 'No checkout link was returned for this store.' };
        }
        lastBuiltFingerprint.current = fingerprintAtBuild;
        setStoreStates(nextStates);
      } catch (err) {
        // A newer build has already replaced this one; let it own the UI.
        if (controller.signal.aborted && abortRef.current !== controller) return;
        const errorState: StoreCheckoutState = timedOut
          ? { kind: 'error', message: 'Checkout link creation timed out. Please retry.' }
          : buildErrorState(err);
        const errorStates: Record<string, StoreCheckoutState> = Object.fromEntries(
          groups.map((group) => [group.storeKey, errorState]),
        );
        setStoreStates(errorStates);
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [groups, items],
  );

  // Build every store link on page load. Rebuild only after the cart changes.
  useEffect(() => {
    if (groups.length === 0 || requestedFingerprintRef.current === currentFingerprint) return;
    requestedFingerprintRef.current = currentFingerprint;
    void buildCheckoutLinks();
  }, [buildCheckoutLinks, currentFingerprint, groups.length]);

  const handleCheckoutClick = useCallback(
    (storeKey: string, storeDisplayName: string) => {
      const current = storeStates[storeKey];
      if (current?.kind === 'ready') {
        setOpenedKeys((prev) => new Set(prev).add(storeKey));
        enqueueSnackbar(`Opening ${storeDisplayName}...`, { variant: 'success' });
        return;
      }
      if (current?.kind !== 'building') void buildCheckoutLinks();
    },
    [buildCheckoutLinks, enqueueSnackbar, storeStates],
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
        Each store has its own cart. We prepare the checkout links now; open each store in a new tab when you're ready. ScoutLGS doesn't take payment.
      </Typography>

      {droppedNoVariant > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {droppedNoVariant} item{droppedNoVariant === 1 ? '' : 's'} skipped (no Shopify variant id yet -- try again once prices have loaded).
        </Alert>
      )}

      {anyBuilding && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2, color: 'text.secondary' }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Preparing store checkout links…</Typography>
        </Box>
      )}

      <Stack spacing={2}>
        {groups.map((group) => {
          const storeState = storeStates[group.storeKey] ?? { kind: 'idle' as const };
          const isReady = storeState.kind === 'ready';
          const isBuilding = storeState.kind === 'building';
          const isError = storeState.kind === 'error';
          const opened = openedKeys.has(group.storeKey);
          const expanded = expandedKeys.has(group.storeKey);

          const toggleExpanded = () => {
            setExpandedKeys((previous) => {
              const next = new Set(previous);
              if (next.has(group.storeKey)) next.delete(group.storeKey);
              else next.add(group.storeKey);
              return next;
            });
          };

          return (
            <Accordion
              key={group.storeKey}
              expanded={expanded}
              onChange={toggleExpanded}
              disableGutters
              sx={(theme) => ({
                border: `1px solid ${theme.palette.divider}`,
                // MUI Accordion's built-in first/last-child rules otherwise
                // override the shared radius on those edge cards.
                borderRadius: '16px !important',
                bgcolor: 'background.paper',
                // Clip every animated child to the shared radius without
                // creating the scrolling ancestor that breaks sticky headers.
                overflow: 'clip',
                '&:before': { display: 'none' },
              })}
            >
              <AccordionSummary expandIcon={<ExpandMore />} sx={{ position: 'sticky', top: 0, zIndex: 1, px: 2.5, minHeight: 72, bgcolor: 'background.paper', '& .MuiAccordionSummary-content': { my: 1.5, alignItems: 'center', gap: 2 }, '& .MuiAccordionSummary-content.Mui-expanded': { my: 1.5 }, '& .MuiAccordionSummary-expandIconWrapper': { ml: 2 } }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
                    {group.storeDisplayName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {group.items.length} {group.items.length === 1 ? 'card' : 'cards'}
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, color: 'primary.main', flexShrink: 0, ml: 'auto' }}>
                  CA${group.subtotal.toFixed(2)}
                </Typography>
                <Button
                  size="small"
                  variant={isReady ? 'outlined' : 'contained'}
                  color={isError ? 'error' : 'primary'}
                  startIcon={isBuilding ? <CircularProgress size={14} color="inherit" /> : <OpenInNew sx={{ fontSize: 16 }} />}
                  disabled={isBuilding || (anyBuilding && !isBuilding)}
                  {...(isReady ? { component: 'a' as const, href: storeState.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleCheckoutClick(group.storeKey, group.storeDisplayName);
                  }}
                >
                  {isBuilding ? 'Building' : isError ? 'Retry' : isReady ? 'Open' : 'Checkout'}
                </Button>
              </AccordionSummary>

              <AccordionDetails sx={{ px: 2.5, pt: 0, pb: 2.5 }}>
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
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCheckoutClick(group.storeKey, group.storeDisplayName);
                }}
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
              </AccordionDetails>
            </Accordion>
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
