import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CardListRow } from './CardListRow';
import { SortByMenu, type SortBy } from './SortByMenu';
import { useCart } from '@/components/cart/CartContext';
import type { PriceLookupState } from '@/hooks/useListPrices';

type Props = {
  entries: { name: string; qty: number }[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  results: Record<string, PriceLookupState>;
  inCartByName: (name: string) => boolean;
};

export function CardListPanel({
  entries,
  selectedName,
  onSelect,
  results,
  inCartByName,
}: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const { count, total, isOpen, open, close, items } = useCart();
  const cartStoreCount = useMemo(
    () => new Set(items.map((i) => i.store)).size,
    [items],
  );

  const sortedEntries = useMemo(() => {
    const arr = entries.slice();
    if (sortBy === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      arr.sort((a, b) => {
        const ra = results[a.name];
        const rb = results[b.name];
        const ap = ra?.state === 'success' && ra.cheapest ? ra.cheapest.price : Infinity;
        const bp = rb?.state === 'success' && rb.cheapest ? rb.cheapest.price : Infinity;
        return ap - bp;
      });
    }
    return arr;
  }, [entries, sortBy, results]);

  return (
    <Box
      component="aside"
      sx={(theme) => ({
        bgcolor: 'background.paper',
        borderRadius: '16px',
        boxShadow: theme.shadows[2],
        position: { xs: 'static', lg: 'sticky' },
        top: { lg: 148 },
        maxHeight: { xs: 'none', lg: 'calc(100vh - 168px)' },
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      })}
    >
      {/* Header */}
      <Box
        sx={(theme) => ({
          padding: '14px 16px',
          borderBottom: `1px solid ${theme.palette.divider}`,
        })}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Typography
            sx={{
              fontSize: '15px',
              fontWeight: 700,
              flex: 1,
              letterSpacing: '-0.01em',
            }}
          >
            Card list
          </Typography>
          <Box
            component="span"
            sx={{
              fontSize: '12px',
              color: 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Box component="b" sx={{ color: 'text.primary', fontWeight: 700 }}>
              {entries.length}
            </Box>{' '}
            {entries.length === 1 ? 'card' : 'cards'}
          </Box>
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            mt: '10px',
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'text.secondary',
            }}
          >
            Sort by
          </Typography>
          <SortByMenu value={sortBy} onChange={setSortBy} />
        </Box>
      </Box>

      {/* Scrollable list */}
      <Box
        sx={(theme) => ({
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px 10px',
          '&::-webkit-scrollbar': { width: 10 },
          '&::-webkit-scrollbar-thumb': {
            background: theme.palette.divider,
            borderRadius: 99,
          },
        })}
      >
        {sortedEntries.length === 0 ? (
          <Box
            sx={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'text.secondary',
              fontSize: '14px',
            }}
          >
            No cards match your filters.
          </Box>
        ) : (
          sortedEntries.map((e) => (
            <CardListRow
              key={e.name}
              name={e.name}
              selected={selectedName === e.name}
              inCart={inCartByName(e.name)}
              onSelect={() => onSelect(e.name)}
            />
          ))
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={(theme) => ({
          padding: '12px 14px',
          borderTop: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          bgcolor: 'background.paper',
        })}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <Box>
            <Box sx={{ fontSize: '12px', color: 'text.secondary' }}>
              Cart · {count} {count === 1 ? 'item' : 'items'} from{' '}
              {cartStoreCount} {cartStoreCount === 1 ? 'store' : 'stores'}
            </Box>
            <Box
              sx={{
                fontSize: '20px',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              CA${total.toFixed(2)}
            </Box>
          </Box>
        </Box>
        <Box
          component="button"
          onClick={() => (isOpen ? close() : open())}
          aria-expanded={isOpen}
          sx={(theme) => ({
            flex: 1,
            padding: '9px 12px',
            border: 0,
            background: theme.palette.primary.main,
            color: '#fff',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
            boxShadow: isOpen
              ? 'inset 0 0 0 2px rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.18)'
              : 'none',
            filter: isOpen ? 'brightness(0.92)' : 'none',
            transition: 'background 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background:
                theme.palette.mode === 'dark' ? '#1f7a1c' : '#3a5333',
            },
          })}
        >
          {isOpen ? 'Close Cart' : 'Open Cart'}
        </Box>
      </Box>
    </Box>
  );
}
