import { useEffect, useMemo, useCallback } from 'react';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import { useSnackbar } from 'notistack';
import type { CardWithStore } from '@scoutlgs/shared';
import { useLists } from '@/components/lists/ListsContext';
import { useCart, cartItemId } from '@/components/cart/CartContext';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { groupByName } from '@/utils/parseDeckList';
import { useListPrices } from '@/hooks/useListPrices';
import { useListEditor } from '@/hooks/useListEditor';
import { BuilderFilterBar } from '@/components/builder/BuilderFilterBar';
import { SelectedCardPanel } from '@/components/builder/SelectedCardPanel';
import { CardListPanel } from '@/components/builder/CardListPanel';
import { STORE_FACETS } from '@/data/sample';

export const Route = createFileRoute('/build/$listName')({
  component: BuilderRoute,
});

const ALL_STORES = STORE_FACETS.map((s) => s.name);

function isTypingInField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function BuilderRoute() {
  const { listName } = useParams({ from: '/build/$listName' });
  const navigate = useNavigate();
  const { get } = useLists();
  const { add: addToCart, items: cartItems } = useCart();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  const cards = get(listName);
  const entries = useMemo(() => groupByName(cards), [cards]);
  const uniqueNames = useMemo(() => entries.map((e) => e.name), [entries]);
  const existingNames = useMemo(
    () => uniqueNames.map((n) => n.toLowerCase()),
    [uniqueNames],
  );

  const { results } = useListPrices(uniqueNames);

  // Persisted UI state
  const [selectedName, setSelectedName] = useLocalStorage<string | null>(
    `scoutlgs:builder:selected:${listName}`,
    null,
  );
  const [selectedStores, setSelectedStores] = useLocalStorage<string[]>(
    'scoutlgs:builder:stores',
    ALL_STORES,
  );
  const [conditions, setConditions] = useLocalStorage<string[]>(
    'scoutlgs:builder:conditions',
    [],
  );

  const cartIdSet = useMemo(
    () => new Set(cartItems.map((i) => cartItemId(i))),
    [cartItems],
  );

  const inCartByOffer = useCallback(
    (offer: CardWithStore) => cartIdSet.has(cartItemId(offer)),
    [cartIdSet],
  );

  const cartCardKeys = useMemo(() => {
    const s = new Set<string>();
    for (const item of cartItems) {
      s.add((item.scryfall_id ?? item.title).toLowerCase());
    }
    return s;
  }, [cartItems]);

  const inCartByName = useCallback(
    (name: string) => cartCardKeys.has(name.toLowerCase()),
    [cartCardKeys],
  );

  // Editor: add/remove + history.
  const { history, addCard, removeCard, undo } = useListEditor(
    listName,
    inCartByName,
  );

  // Default selection: first entry, once entries load. Also handles the case
  // where the selected card was removed from the list — auto-pick the next
  // entry in alphabetical order.
  useEffect(() => {
    if (entries.length === 0) {
      if (selectedName !== null) setSelectedName(null);
      return;
    }
    if (!selectedName || !entries.some((e) => e.name === selectedName)) {
      const sorted = entries
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
      setSelectedName(sorted[0].name);
    }
  }, [entries, selectedName, setSelectedName]);

  const handleToggleStore = useCallback(
    (name: string) => {
      setSelectedStores((current) => {
        if (current.includes(name)) return current.filter((s) => s !== name);
        return [...current, name];
      });
    },
    [setSelectedStores],
  );

  const handleToggleAll = useCallback(() => {
    setSelectedStores((current) =>
      current.length === ALL_STORES.length ? [] : ALL_STORES.slice(),
    );
  }, [setSelectedStores]);

  const handleToggleCondition = useCallback(
    (c: string) => {
      setConditions((current) => {
        if (current.includes(c)) return current.filter((x) => x !== c);
        return [...current, c];
      });
    },
    [setConditions],
  );

  const handleAddOffer = useCallback(
    (offer: CardWithStore) => {
      const added = addToCart(offer);
      if (added) {
        enqueueSnackbar(
          `Added "${offer.title}" from ${offer.store} to cart`,
          { variant: 'success' },
        );
      } else {
        enqueueSnackbar(`"${offer.title}" from ${offer.store} is already in your cart`, {
          variant: 'default',
        });
      }
    },
    [addToCart, enqueueSnackbar],
  );

  // Undo a specific entry and surface any block warning.
  const performUndo = useCallback(
    (entryId?: string) => {
      const result = undo(entryId);
      if (result === 'blocked') {
        enqueueSnackbar(
          "Can't remove that card while it's in your cart",
          { variant: 'warning' },
        );
      }
      return result;
    },
    [undo, enqueueSnackbar],
  );

  const handleAddCard = useCallback(
    (cardName: string) => {
      const entryId = addCard(cardName);
      const key = enqueueSnackbar(`Added "${cardName}" to list`, {
        autoHideDuration: 6000,
        action: (snackKey) => (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              performUndo(entryId);
              closeSnackbar(snackKey);
            }}
          >
            Undo
          </Button>
        ),
      });
      return key;
    },
    [addCard, enqueueSnackbar, closeSnackbar, performUndo],
  );

  const handleRemoveCard = useCallback(
    (cardName: string) => {
      // The reselect effect handles updating `selectedName` when the removed
      // card's last copy disappears from `entries`.
      const entryId = removeCard(cardName);
      const key = enqueueSnackbar(`Removed "${cardName}" from list`, {
        autoHideDuration: 6000,
        action: (snackKey) => (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              performUndo(entryId);
              closeSnackbar(snackKey);
            }}
          >
            Undo
          </Button>
        ),
      });
      return key;
    },
    [removeCard, enqueueSnackbar, closeSnackbar, performUndo],
  );

  // Cmd/Ctrl + Z keyboard shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey) return;
      if (isTypingInField(e.target)) return;
      e.preventDefault();
      performUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [performUndo]);

  if (cards.length === 0) {
    return (
      <Container maxWidth={false} sx={{ maxWidth: 1100 }}>
        <EmptyState
          title="List not found"
          description={`We couldn't find "${listName}" in your saved lists.`}
          action={
            <Button variant="outlined" color="primary" onClick={() => navigate({ to: "/lists" })}>
              Back to Lists
            </Button>
          }
        />
      </Container>
    );
  }

  // Derive the card metadata for the SelectedCardPanel from results.
  const selectedCard = selectedName
    ? {
        name: selectedName,
        set:
          results[selectedName]?.state === 'success'
            ? results[selectedName].cheapest?.set
            : undefined,
      }
    : null;

  // The builder needs the full 1600 max-width. Override the root layout's
  // padding/main-component padding by stretching to the viewport width.
  return (
    <Box
      sx={{
        // Cancel the root <main> px/py — we want full-bleed filter bar and a
        // 1600-px-wide centered body.
        mx: { xs: -2, md: -3 },
        mt: { xs: -3, md: -5 },
        mb: { xs: -3, md: -5 },
      }}
    >
      <BuilderFilterBar
        allStores={ALL_STORES}
        selectedStores={selectedStores}
        onToggleStore={handleToggleStore}
        onToggleAll={handleToggleAll}
        conditions={conditions}
        onToggleCondition={handleToggleCondition}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 380px' },
          gap: '20px',
          padding: '20px',
          maxWidth: 1600,
          mx: 'auto',
          width: '100%',
          alignItems: 'start',
        }}
      >
        <Box
          component="main"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            minWidth: 0,
          }}
        >
          <SelectedCardPanel
            card={selectedCard}
            lookup={selectedName ? results[selectedName] : undefined}
            selectedStores={selectedStores}
            conditions={conditions}
            inCartByOffer={inCartByOffer}
            onAddOffer={handleAddOffer}
          />
        </Box>
        <CardListPanel
          entries={entries}
          selectedName={selectedName}
          onSelect={setSelectedName}
          results={results}
          inCartByName={inCartByName}
          history={history}
          existingNames={existingNames}
          onAddCard={handleAddCard}
          onRemoveCard={handleRemoveCard}
          onUndoHistory={performUndo}
        />
      </Box>
    </Box>
  );
}
