import { useMemo } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Close from '@mui/icons-material/Close';
import OpenInNew from '@mui/icons-material/OpenInNew';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useSnackbar } from 'notistack';
import { useCart, cartItemId, type CartItem } from '@/components/cart/CartContext';

const ART_GRADIENTS = [
  'linear-gradient(135deg, #6b3f7e, #2d1f3d)',
  'linear-gradient(135deg, #c94838, #6f1d12)',
  'linear-gradient(135deg, #2f78c4, #14365e)',
  'linear-gradient(135deg, #d4a945, #6e5318)',
  'linear-gradient(135deg, #888, #444)',
  'linear-gradient(135deg, #4a8b3f, #1f3d1a)',
  'linear-gradient(135deg, #e8c46a, #6e5318)',
];

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function CartDrawer() {
  const { items, isOpen, close, remove, clear } = useCart();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const byStore = useMemo(() => {
    const groups: Record<string, CartItem[]> = {};
    for (const it of items) {
      (groups[it.store] = groups[it.store] || []).push(it);
    }
    return groups;
  }, [items]);

  const storeKeys = Object.keys(byStore);
  const total = items.reduce((s, c) => s + (c.price ?? 0), 0);

  const openAllStores = () => {
    const opened = new Set<string>();
    let openedCount = 0;
    for (const store of storeKeys) {
      const candidate = byStore[store].find((c) => c.link && c.link.trim().length > 0);
      if (!candidate || opened.has(candidate.link)) continue;
      const win = window.open(candidate.link, '_blank', 'noopener,noreferrer');
      if (win) {
        opened.add(candidate.link);
        openedCount += 1;
      }
    }
    if (openedCount === 0) {
      enqueueSnackbar(
        'No store links available yet — try again once prices have loaded.',
        { variant: 'warning' },
      );
    } else {
      enqueueSnackbar(
        `Opening ${openedCount} ${openedCount === 1 ? 'store' : 'stores'}…`,
        { variant: 'success' },
      );
    }
  };

  const hasAnyLink = items.some((c) => c.link && c.link.trim().length > 0);

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={isOpen}
      onClose={close}
      slotProps={{
        paper: {
          sx: {
            display: 'flex',
            flexDirection: 'column',
            ...(isMobile
              ? {
                  width: '100%',
                  maxWidth: '100%',
                  height: '85vh',
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  boxSizing: 'border-box',
                }
              : {
                  width: 'min(420px, 100%)',
                  boxSizing: 'border-box',
                }),
          },
        },
      }}
    >
      {isMobile && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5, flexShrink: 0 }}>
          <Box
            sx={(t) => ({
              width: 36,
              height: 4,
              borderRadius: 2,
              bgcolor: t.palette.divider,
            })}
          />
        </Box>
      )}
      <Box
        sx={(t) => ({
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          px: 2.5,
          pt: isMobile ? 1.25 : 2.5,
          pb: 1.75,
          borderBottom: `1px solid ${t.palette.divider}`,
          flexShrink: 0,
        })}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, m: 0 }}>Your cart</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem', mt: '2px' }}>
            {items.length} {items.length === 1 ? 'card' : 'cards'} from {storeKeys.length}{' '}
            {storeKeys.length === 1 ? 'store' : 'stores'}
          </Typography>
        </Box>
        <IconButton onClick={close} aria-label="Close" size="small">
          <Close />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 1.75, minHeight: 0 }}>
        {items.length === 0 ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 6, textAlign: 'center' }}>
            <ShoppingCartOutlined sx={{ fontSize: 36, opacity: 0.4 }} />
            <Typography variant="body2" color="text.secondary">
              Your cart is empty. Add cards from any search result and we'll group them by store.
            </Typography>
          </Stack>
        ) : (
          storeKeys.map((store) => {
            const list = byStore[store];
            const subtotal = list.reduce((s, c) => s + (c.price ?? 0), 0);
            return (
              <Box key={store} sx={{ mb: 2.5 }}>
                <Box
                  sx={(t) => ({
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1,
                    mb: 1,
                    py: 0.75,
                    borderBottom: `1px dashed ${t.palette.divider}`,
                  })}
                >
                  <Typography
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: 'primary.main',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}
                  >
                    {store}
                  </Typography>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}>
                    CA${subtotal.toFixed(2)}
                  </Typography>
                </Box>
                {list.map((c) => {
                  const id = cartItemId(c);
                  const gradient = ART_GRADIENTS[hashIndex(id, ART_GRADIENTS.length)];
                  return (
                    <Stack
                      key={id}
                      direction="row"
                      alignItems="center"
                      spacing={1.25}
                      sx={{ py: 1 }}
                    >
                      <Box
                        sx={{
                          width: 36,
                          height: 50,
                          borderRadius: 0.5,
                          background: gradient,
                          flexShrink: 0,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontSize: '0.84rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c.title}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.72rem',
                            color: 'text.secondary',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c.set} · {c.condition}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}>
                        CA${(c.price ?? 0).toFixed(2)}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="View at store"
                        disabled={!c.link}
                        onClick={() => {
                          if (c.link) {
                            window.open(c.link, '_blank', 'noopener,noreferrer');
                          } else {
                            enqueueSnackbar(`No store link for ${c.title}`, { variant: 'warning' });
                          }
                        }}
                        sx={{ width: 28, height: 28, flexShrink: 0 }}
                      >
                        <OpenInNew sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Remove"
                        onClick={() => remove(id)}
                        sx={{ width: 28, height: 28, flexShrink: 0 }}
                      >
                        <Close sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Stack>
                  );
                })}
              </Box>
            );
          })
        )}
      </Box>

      {items.length > 0 && (
        <Box
          sx={(t) => ({
            borderTop: `1px solid ${t.palette.divider}`,
            bgcolor: 'background.default',
            px: 2.5,
            pt: 1.75,
            pb: 'calc(18px + env(safe-area-inset-bottom))',
            flexShrink: 0,
          })}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>Total</Typography>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'primary.main' }}>
              CA${total.toFixed(2)}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
            You'll check out separately at each store. ScoutLGS doesn't take payment.
          </Typography>
          <Stack
            direction={{ xs: 'column-reverse', sm: 'row' }}
            spacing={1}
            sx={{ mt: 1.25 }}
          >
            <Button
              variant="outlined"
              color="primary"
              sx={{ flex: { xs: 'unset', sm: 1 } }}
              onClick={clear}
              fullWidth
            >
              Clear
            </Button>
            <Button
              variant="contained"
              color="primary"
              sx={{ flex: { xs: 'unset', sm: 1 }, whiteSpace: 'nowrap' }}
              disabled={!hasAnyLink}
              onClick={openAllStores}
              fullWidth
            >
              Open All Stores ({storeKeys.length})
            </Button>
          </Stack>
        </Box>
      )}
    </Drawer>
  );
}
