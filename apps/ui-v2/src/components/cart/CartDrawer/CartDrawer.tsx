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
import { useSnackbar } from 'notistack';
import { useCart, cartItemId, type CartItem } from '@/components/cart/CartContext';
import { ART_GRADIENTS, hashIndex } from './CartDrawer.utils';
import { paperSx, headerSx, storeHeaderSx, footerSx } from './CartDrawer.styles';

export function CartDrawer() {
  const { items, isOpen, close, remove, clear } = useCart();
  const { enqueueSnackbar } = useSnackbar();

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
      anchor="right"
      open={isOpen}
      onClose={close}
      slotProps={{
        paper: { sx: paperSx },
      }}
    >
      <Box sx={headerSx}>
        <Box>
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

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 1.75 }}>
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
                <Box sx={storeHeaderSx}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'primary.main' }}>
                    {store}
                  </Typography>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
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
                        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
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
                        sx={{ width: 28, height: 28 }}
                      >
                        <OpenInNew sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Remove"
                        onClick={() => remove(id)}
                        sx={{ width: 28, height: 28 }}
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
        <Box sx={footerSx}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>Total</Typography>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'primary.main' }}>
              CA${total.toFixed(2)}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
            You'll check out separately at each store. ScoutLGS doesn't take payment.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
            <Button variant="outlined" color="primary" sx={{ flex: 1 }} onClick={clear}>
              Clear
            </Button>
            <Button
              variant="contained"
              color="primary"
              sx={{ flex: 1 }}
              disabled={!hasAnyLink}
              onClick={openAllStores}
            >
              Open All Stores ({storeKeys.length})
            </Button>
          </Stack>
        </Box>
      )}
    </Drawer>
  );
}
