import { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { CardListRow } from './CardListRow';
import { SortByMenu, type SortBy } from './SortByMenu';
import { AddCardPopover } from './AddCardPopover';
import { HistoryPopover } from './HistoryPopover';
import { useCart } from '@/components/cart/CartContext';
import type { PriceLookupState } from '@/hooks/useListPrices';
import type { ListHistoryEntry } from '@/hooks/useListEditor';

type Props = {
  entries: { name: string; qty: number }[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  results: Record<string, PriceLookupState>;
  inCartByName: (name: string) => boolean;
  history: ListHistoryEntry[];
  existingNames: string[];
  onAddCard: (name: string) => void;
  onRemoveCard: (name: string) => void;
  onUndoHistory: (id: string) => void;
};

export function CardListPanel({
  entries,
  selectedName,
  onSelect,
  results,
  inCartByName,
  history,
  existingNames,
  onAddCard,
  onRemoveCard,
  onUndoHistory,
}: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [addOpen, setAddOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const addAnchorRef = useRef<HTMLButtonElement | null>(null);
  const historyAnchorRef = useRef<HTMLButtonElement | null>(null);

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Typography
            sx={{
              fontSize: '15px',
              fontWeight: 700,
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
          <Box
            sx={{
              ml: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {/* History icon button */}
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <Box
                component="button"
                ref={historyAnchorRef}
                onClick={() => {
                  setHistoryOpen((o) => !o);
                  setAddOpen(false);
                }}
                aria-label="Recent activity"
                aria-expanded={historyOpen}
                title="Recent activity"
                sx={(theme) => ({
                  position: 'relative',
                  width: 30,
                  height: 30,
                  borderRadius: '8px',
                  border: `1px solid ${
                    historyOpen
                      ? theme.palette.mode === 'dark'
                        ? 'rgba(36,135,33,0.5)'
                        : 'rgba(74,103,65,0.35)'
                      : theme.palette.divider
                  }`,
                  background: historyOpen
                    ? theme.palette.background.default
                    : theme.palette.background.paper,
                  color: historyOpen
                    ? theme.palette.text.primary
                    : theme.palette.text.secondary,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                  transition:
                    'background 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1), color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    background: theme.palette.background.default,
                    borderColor:
                      theme.palette.mode === 'dark'
                        ? 'rgba(36,135,33,0.5)'
                        : 'rgba(74,103,65,0.35)',
                    color: theme.palette.text.primary,
                  },
                })}
              >
                {/* Clock icon: SVG matching the design */}
                <Box
                  component="svg"
                  viewBox="0 0 24 24"
                  width={15}
                  height={15}
                  sx={{
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: 1.8,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  }}
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </Box>
              </Box>
              {history.length > 0 && (
                <Box
                  component="span"
                  sx={(theme) => ({
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: '999px',
                    background: theme.palette.honey.main,
                    color: '#3d2a14',
                    fontSize: '10px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
                    pointerEvents: 'none',
                  })}
                >
                  {history.length}
                </Box>
              )}
            </Box>

            {/* + Add button */}
            <Box
              component="button"
              ref={addAnchorRef}
              onClick={() => {
                setAddOpen((o) => !o);
                setHistoryOpen(false);
              }}
              aria-label="Add card to list"
              aria-expanded={addOpen}
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px 6px 8px',
                borderRadius: '8px',
                border: `1px solid ${theme.palette.primary.main}`,
                background: theme.palette.primary.main,
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'filter 120ms cubic-bezier(0.4, 0, 0.2, 1)',
                filter: addOpen ? 'brightness(0.92)' : 'none',
                '&:hover': { filter: 'brightness(0.92)' },
              })}
            >
              <AddIcon sx={{ fontSize: 13 }} />
              <span>Add</span>
            </Box>
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

      {/* Popovers */}
      <HistoryPopover
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        anchorEl={historyAnchorRef.current}
        history={history}
        onUndo={(id) => onUndoHistory(id)}
      />
      <AddCardPopover
        open={addOpen}
        onClose={() => setAddOpen(false)}
        anchorEl={addAnchorRef.current}
        onAdd={onAddCard}
        existingNames={existingNames}
      />

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
              onRemove={onRemoveCard}
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
