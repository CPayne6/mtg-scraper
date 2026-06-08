import { forwardRef, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowBack, OpenInNew } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import {
  buildCheckout,
  CheckoutBuildError,
  type BuildCheckoutStoreInput,
} from '@/api/cart';
import {
  cartItemId,
  formatCartItemName,
  type CartItem,
  useCart,
} from '@/components/cart/CartContext';
import { gradientForCard } from '@/utils/cardGradient';

export const Route = createFileRoute('/checkout')({
  component: CheckoutRoute,
});

// Larger preview rendered above the row on hover. Same image / gradient /
// name-overlay logic as the inline thumbnail, scaled up so the user can
// actually read the card art. Portal-rendered by MUI Tooltip so it floats
// outside the row's stacking context.
function CardPreview({ item }: { item: CartItem }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const gradient = useMemo(
    () => gradientForCard(item.scryfall_id ?? item.title ?? ''),
    [item.scryfall_id, item.title],
  );
  const hasImage = Boolean(item.image) && !failed;
  const showFallback = !hasImage || !loaded;
  const displayName = formatCartItemName(item);

  return (
    <Box
      sx={{
        width: 220,
        height: 308,
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
        background: gradient,
        boxShadow: '0 16px 36px rgba(0,0,0,0.55)',
      }}
    >
      {hasImage && (
        <Box
          component="img"
          src={item.image}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 1.5,
          textAlign: 'center',
          opacity: showFallback ? 1 : 0,
          transition: 'opacity 200ms ease',
          pointerEvents: 'none',
        }}
      >
        <Typography
          sx={{
            fontSize: '1rem',
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 2px 6px rgba(0,0,0,0.75)',
            lineHeight: 1.3,
          }}
        >
          {displayName}
        </Typography>
      </Box>
    </Box>
  );
}

// Compact card thumbnail used inline in each per-store item row. Uses the
// shared gradient placeholder while the image loads or as a fallback if it
// fails, with the card name overlaid so the row still identifies the item.
// forwardRef so MUI Tooltip can attach its listeners to the underlying Box.
const ItemThumbnail = forwardRef<HTMLDivElement, { item: CartItem }>(function ItemThumbnail(
  { item, ...rest },
  ref,
) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const gradient = useMemo(
    () => gradientForCard(item.scryfall_id ?? item.title ?? ''),
    [item.scryfall_id, item.title],
  );
  const hasImage = Boolean(item.image) && !failed;
  const showFallback = !hasImage || !loaded;
  const displayName = formatCartItemName(item);

  return (
    <Box
      ref={ref}
      {...rest}
      role="img"
      aria-label={displayName}
      sx={{
        width: 44,
        height: 60,
        flexShrink: 0,
        borderRadius: 0.75,
        overflow: 'hidden',
        position: 'relative',
        background: gradient,
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }}
    >
      {hasImage && (
        <Box
          component="img"
          src={item.image}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 0.5,
          textAlign: 'center',
          opacity: showFallback ? 1 : 0,
          transition: 'opacity 200ms ease',
          pointerEvents: 'none',
        }}
      >
        <Typography
          sx={{
            fontSize: '0.55rem',
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.75)',
            lineHeight: 1.1,
            letterSpacing: '0.005em',
          }}
        >
          {displayName}
        </Typography>
      </Box>
    </Box>
  );
});

type StoreGroup = {
  storeKey: string;
  storeDisplayName: string;
  items: CartItem[];
  subtotal: number;
  lines: Map<string, number>;
};

type CheckoutState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retryAfterSec?: number }
  | { kind: 'ready'; urls: Record<string, string> };

function CheckoutRoute() {
  const navigate = useNavigate();
  const { items } = useCart();
  const { enqueueSnackbar } = useSnackbar();

  // Snapshot the cart at mount time so the URLs we display match the items the
  // user saw when they clicked checkout, even if another tab mutates the cart
  // localStorage while this page is open.
  const [snapshot] = useState(() => items);

  const groups = useMemo<StoreGroup[]>(() => {
    const map = new Map<string, StoreGroup>();
    for (const item of snapshot) {
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
  }, [snapshot]);

  const droppedNoVariant = snapshot.length - groups.reduce((sum, g) => sum + g.items.length, 0);

  const [state, setState] = useState<CheckoutState>({ kind: 'loading' });
  const [openedKeys, setOpenedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (groups.length === 0) return;

    const payload: BuildCheckoutStoreInput[] = groups.map((g) => ({
      storeKey: g.storeKey,
      lines: Array.from(g.lines.entries()).map(([variantId, quantity]) => ({
        variantId,
        quantity,
      })),
    }));

    let cancelled = false;
    setState({ kind: 'loading' });

    buildCheckout(payload)
      .then((result) => {
        if (cancelled) return;
        const urls: Record<string, string> = {};
        for (const entry of result.stores) {
          urls[entry.storeKey] = entry.checkoutUrl;
        }
        setState({ kind: 'ready', urls });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof CheckoutBuildError) {
          if (err.status === 429) {
            setState({
              kind: 'error',
              message: 'Too many checkout attempts.',
              retryAfterSec: err.retryAfterSec,
            });
          } else if (err.errorCode === 'unknown-store') {
            setState({
              kind: 'error',
              message: `Unknown store "${err.storeKey ?? ''}" -- refresh the page and try again.`,
            });
          } else if (err.status === 401) {
            setState({
              kind: 'error',
              message: 'Session expired -- refresh the page and try again.',
            });
          } else if (err.status === 403) {
            setState({
              kind: 'error',
              message: 'Request blocked -- refresh the page and try again.',
            });
          } else {
            setState({ kind: 'error', message: 'Checkout failed -- please try again.' });
          }
        } else {
          setState({ kind: 'error', message: 'Checkout failed -- please try again.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [groups]);

  // Redirect home if cart is empty (e.g. user navigated to /checkout directly).
  useEffect(() => {
    if (groups.length === 0) {
      navigate({ to: '/' });
    }
  }, [groups.length, navigate]);

  if (groups.length === 0) return null;

  const total = groups.reduce((sum, g) => sum + g.subtotal, 0);

  // The button is rendered as an anchor (component="a" + href + target=_blank)
  // so navigation happens as a native click, not a window.open call.
  // window.open(..., 'noopener,...') returns null even when the popup opens
  // successfully, which makes "did it work?" detection unreliable, and some
  // popup blockers refuse window.open even from synchronous click handlers
  // while leaving native anchor clicks alone.
  const handleStoreCheckout = (group: StoreGroup) => {
    setOpenedKeys((prev) => {
      const next = new Set(prev);
      next.add(group.storeKey);
      return next;
    });
    enqueueSnackbar(`Opening ${group.storeDisplayName}...`, { variant: 'success' });
  };

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
        Each store has its own cart. Click a store's button to open its checkout in a new tab. ScoutLGS doesn't take payment.
      </Typography>

      {droppedNoVariant > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {droppedNoVariant} item{droppedNoVariant === 1 ? '' : 's'} skipped (no Shopify variant id yet -- try again once prices have loaded).
        </Alert>
      )}

      {state.kind === 'error' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {state.message}
          {state.retryAfterSec ? ` Try again in ${state.retryAfterSec}s.` : ''}
        </Alert>
      )}

      <Stack spacing={2}>
        {groups.map((group) => {
          const opened = openedKeys.has(group.storeKey);
          const ready = state.kind === 'ready' && Boolean(state.urls[group.storeKey]);
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
                      <ItemThumbnail item={item} />
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
                  </Box>
                ))}
              </Stack>

              <Button
                variant={opened ? 'outlined' : 'contained'}
                color="primary"
                fullWidth
                startIcon={
                  state.kind === 'loading' ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <OpenInNew />
                  )
                }
                disabled={!ready}
                {...(ready
                  ? {
                      component: 'a' as const,
                      href: state.urls[group.storeKey],
                      target: '_blank',
                      rel: 'noopener noreferrer',
                    }
                  : {})}
                onClick={() => {
                  if (ready) handleStoreCheckout(group);
                }}
              >
                {state.kind === 'loading'
                  ? 'Building cart...'
                  : opened
                    ? `Re-open ${group.storeDisplayName}`
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
