import { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Add as AddIcon, AddShoppingCart } from '@mui/icons-material';
import { CardListRow } from '../CardListRow';
import { SortByMenu } from '../SortByMenu';
import { AddCardPopover } from '../AddCardPopover';
import { HistoryPopover } from '../HistoryPopover';
import { useCart } from '@/components/cart/CartContext';
import type { CardListPanelProps } from './CardListPanel.types';
import { sortCardListEntries } from './CardListPanel.utils';
import {
  containerSx,
  headerSx,
  titleSx,
  countTextSx,
  historyBtnSx,
  historyIconSx,
  historyBadgeSx,
  addBtnSx,
  sortRowSx,
  sortLabelSx,
  listSx,
  emptyListSx,
  footerSx,
  bestCardsBtnSx,
  cartBtnSx,
} from './CardListPanel.styles';

export function CardListPanel({
  entries,
  selectedName,
  onSelect,
  sortBy,
  onSortByChange,
  results,
  inCartByName,
  history,
  existingNames,
  onAddCard,
  onRemoveCard,
  onUndoHistory,
  onAddBestCards,
  isAddingBestCards,
  canAddBestCards,
}: CardListPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const addAnchorRef = useRef<HTMLButtonElement | null>(null);
  const historyAnchorRef = useRef<HTMLButtonElement | null>(null);

  const { count, total, isOpen, open, close, items } = useCart();
  const cartStoreCount = useMemo(
    () => new Set(items.map((i) => i.store)).size,
    [items],
  );

  const sortedEntries = useMemo(
    () => sortCardListEntries(entries, sortBy, results),
    [entries, sortBy, results],
  );
  const bestCardsDisabled = !canAddBestCards || isAddingBestCards;

  return (
    <Box component="aside" sx={containerSx}>
      {/* Header */}
      <Box sx={headerSx}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Typography sx={titleSx}>Card list</Typography>
          <Box component="span" sx={countTextSx}>
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
                type="button"
                ref={historyAnchorRef}
                onClick={() => {
                  setHistoryOpen((o) => !o);
                  setAddOpen(false);
                }}
                aria-label="Recent activity"
                aria-expanded={historyOpen}
                title="Recent activity"
                sx={historyBtnSx(historyOpen)}
              >
                {/* Clock icon: SVG matching the design */}
                <Box
                  component="svg"
                  viewBox="0 0 24 24"
                  width={15}
                  height={15}
                  sx={historyIconSx}
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </Box>
              </Box>
              {history.length > 0 && (
                <Box component="span" sx={historyBadgeSx}>
                  {history.length}
                </Box>
              )}
            </Box>

            {/* + Add button */}
            <Box
              component="button"
              type="button"
              ref={addAnchorRef}
              onClick={() => {
                setAddOpen((o) => !o);
                setHistoryOpen(false);
              }}
              aria-label="Add card to list"
              aria-expanded={addOpen}
              sx={addBtnSx(addOpen)}
            >
              <AddIcon sx={{ fontSize: 13 }} />
              <span>Add</span>
            </Box>
          </Box>
        </Box>
        <Box sx={sortRowSx}>
          <Typography component="span" sx={sortLabelSx}>
            Sort by
          </Typography>
          <SortByMenu value={sortBy} onChange={onSortByChange} />
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
      <Box sx={listSx}>
        {sortedEntries.length === 0 ? (
          <Box sx={emptyListSx}>No cards match your filters.</Box>
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
      <Box sx={footerSx}>
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
          type="button"
          onClick={onAddBestCards}
          disabled={bestCardsDisabled}
          aria-busy={isAddingBestCards}
          sx={bestCardsBtnSx(bestCardsDisabled)}
        >
          <AddShoppingCart sx={{ fontSize: 16 }} />
          {isAddingBestCards ? 'Finding best...' : 'Add Best Cards'}
        </Box>
        <Box
          component="button"
          type="button"
          onClick={() => (isOpen ? close() : open())}
          aria-expanded={isOpen}
          sx={cartBtnSx(isOpen)}
        >
          {isOpen ? 'Close Cart' : 'Open Cart'}
        </Box>
      </Box>
    </Box>
  );
}
