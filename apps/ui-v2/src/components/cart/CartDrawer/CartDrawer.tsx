import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Close from '@mui/icons-material/Close';
import OpenInNew from '@mui/icons-material/OpenInNew';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useSnackbar } from 'notistack';
import { cartItemId, type CartItem, useCart } from '@/components/cart/CartContext';
import {
  footerSx,
  headerSx,
  mobileHandleSx,
  mobileHandleWrapSx,
  paperSx,
  storeHeaderSx,
} from './CartDrawer.styles';
import { ART_GRADIENTS, hashIndex } from './CartDrawer.utils';

export function CartDrawer() {
  const { items, isOpen, close, remove, clear } = useCart();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const byStore = useMemo(() => {
    const groups: Record<string, CartItem[]> = {};
    for (const item of items) {
      (groups[item.store] = groups[item.store] || []).push(item);
    }
    return groups;
  }, [items]);

  const storeKeys = Object.keys(byStore);
  const total = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const hasAnyLink = items.some((item) => item.link && item.link.trim().length > 0);

  const openAllStores = () => {
    const opened = new Set<string>();
    let openedCount = 0;

    for (const store of storeKeys) {
      const candidate = (byStore[store] ?? []).find((item) => item.link && item.link.trim().length > 0);
      if (!candidate?.link || opened.has(candidate.link)) continue;

      const win = window.open(candidate.link, '_blank', 'noopener,noreferrer');
      if (win) {
        opened.add(candidate.link);
        openedCount += 1;
      }
    }

    if (openedCount === 0) {
      enqueueSnackbar('No store links available yet - try again once prices have loaded.', {
        variant: 'warning',
      });
      return;
    }

    enqueueSnackbar(`Opening ${openedCount} ${openedCount === 1 ? 'store' : 'stores'}...`, {
      variant: 'success',
    });
  };

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={isOpen}
      onClose={close}
      slotProps={{
        paper: { sx: paperSx(isMobile) },
      }}
    >
      {isMobile && (
        <Box sx={mobileHandleWrapSx}>
          <Box sx={mobileHandleSx} />
        </Box>
      )}

      <Box sx={headerSx(isMobile)}>
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
            const list = byStore[store] ?? [];
            const subtotal = list.reduce((sum, item) => sum + (item.price ?? 0), 0);

            return (
              <Box key={store} sx={{ mb: 2.5 }}>
                <Box sx={storeHeaderSx}>
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

                {list.map((item) => {
                  const id = cartItemId(item);
                  const gradient = ART_GRADIENTS[hashIndex(id, ART_GRADIENTS.length)];

                  return (
                    <Stack key={id} direction="row" alignItems="center" spacing={1.25} sx={{ py: 1 }}>
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
                          {item.title}
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
                          {item.set} - {item.condition}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}>
                        CA${(item.price ?? 0).toFixed(2)}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="View at store"
                        disabled={!item.link}
                        onClick={() => {
                          if (item.link) {
                            window.open(item.link, '_blank', 'noopener,noreferrer');
                          } else {
                            enqueueSnackbar(`No store link for ${item.title}`, { variant: 'warning' });
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
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} sx={{ mt: 1.25 }}>
            <Button variant="outlined" color="primary" sx={{ flex: { xs: 'unset', sm: 1 } }} onClick={clear} fullWidth>
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
