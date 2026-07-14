import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useSnackbar } from 'notistack';
import { Condition, type CardWithStore } from '@scoutlgs/shared';
import { fetchCard } from '@/api/cards';
import { createListOptimization, fetchDeliveryOptions, fetchListOptimizationStatus, type DeliveryOptionsResponse } from '@/api/lists';
import { useLists } from '@/components/lists/ListsContext';
import { useCart, cartItemId } from '@/components/cart/CartContext';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { groupByName } from '@/utils/parseDeckList';
import type { PriceLookupState } from '@/hooks/useListPrices';
import { useListEditor } from '@/hooks/useListEditor';
import { BuilderFilterBar } from '@/components/builder/BuilderFilterBar';
import { SelectedCardPanel } from '@/components/builder/SelectedCardPanel';
import { CardListPanel } from '@/components/builder/CardListPanel';
import { sortCardListEntries } from '@/components/builder/CardListPanel/CardListPanel.utils';
import type { SortBy } from '@/components/builder/SortByMenu';
import { STORE_FACETS } from '@/data/sample';

type BuilderSearch = {
  card?: string;
};

function formatCanadianPostalCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return compact.length > 3 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact;
}

const CANADIAN_PROVINCES = [
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'],
  ['NB', 'New Brunswick'], ['NL', 'Newfoundland and Labrador'],
  ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
  ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
] as const;

export const Route = createFileRoute('/build/$listId/$slug')({
  validateSearch: (search: Record<string, unknown>): BuilderSearch => ({
    card: typeof search.card === 'string' ? search.card : undefined,
  }),
  component: BuilderRoute,
});

// Builder filters/state operate on the store's slug (`key`), never displayName.
const ALL_STORE_KEYS = STORE_FACETS.map((s) => s.key);
const STORE_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  STORE_FACETS.map((s) => [s.key, s.label]),
);
const CONDITION_BY_LABEL: Record<string, Condition> = {
  NM: Condition.NM,
  LP: Condition.LP,
  MP: Condition.MP,
  HP: Condition.HP,
  DMG: Condition.DMG,
};
const CONDITION_RANK: Record<Condition, number> = {
  [Condition.NM]: 5,
  [Condition.LP]: 4,
  [Condition.MP]: 3,
  [Condition.HP]: 2,
  [Condition.DMG]: 1,
  [Condition.UNKNOWN]: 0,
};

function lookupFromOffers(offers: CardWithStore[]): PriceLookupState {
  const sorted = offers.slice().sort((a, b) => a.price - b.price);
  return {
    state: 'success',
    offers: sorted,
    cheapest: sorted[0] ?? null,
  };
}

function isTypingInField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function minimumConditionFromFilter(labels: string[]): Condition | undefined {
  const selected = labels
    .map((label) => CONDITION_BY_LABEL[label])
    .filter((condition): condition is Condition => Boolean(condition));
  if (selected.length === 0) return undefined;
  return selected.sort((a, b) => CONDITION_RANK[a] - CONDITION_RANK[b])[0];
}

function BuilderRoute() {
  const { listId, slug } = useParams({ from: '/build/$listId/$slug' });
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { get, getList, loading } = useLists();
  const {
    add: addToCart,
    addMany: addManyToCart,
    items: cartItems,
    open: openCart,
  } = useCart();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  const cards = get(listId);
  const list = getList(listId);
  const entries = useMemo(() => groupByName(cards), [cards]);
  const uniqueNames = useMemo(() => entries.map((e) => e.name), [entries]);
  const existingNames = useMemo(
    () => uniqueNames.map((n) => n.toLowerCase()),
    [uniqueNames],
  );

  const [detailedResults, setDetailedResults] = useState<
    Record<string, PriceLookupState>
  >({});
  const results = detailedResults;
  const loadedPriceCount = useMemo(
    () =>
      uniqueNames.filter((name) => {
        const result = results[name];
        return result && result.state !== 'pending';
      }).length,
    [results, uniqueNames],
  );
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const sortedEntries = useMemo(
    () => sortCardListEntries(entries, sortBy, results),
    [entries, sortBy, results],
  );
  const sortedNames = useMemo(
    () => sortedEntries.map((entry) => entry.name),
    [sortedEntries],
  );

  // Persisted UI state
  const [selectedName, setSelectedName] = useLocalStorage<string | null>(
    `scoutlgs:builder:selected:${listId}`,
    null,
  );
  // Stored values are store slugs (e.g. "face-to-face-games"), matching the
  // `store_key` field on offers from the API. Bumped to v3 after migrating from
  // displayName to slug — older v1/v2 values would silently filter out every
  // offer.
  const [selectedStores, setSelectedStores] = useLocalStorage<string[]>(
    'scoutlgs:builder:stores:v3',
    ALL_STORE_KEYS,
  );
  const [conditions, setConditions] = useLocalStorage<string[]>(
    'scoutlgs:builder:conditions',
    [],
  );
  const [isAddingBestCards, setIsAddingBestCards] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryOptionsResponse | null>(null);
  const [selectedDeliveryMethods, setSelectedDeliveryMethods] = useState<Record<string, { label: string; handle?: string }>>({});
  const [deliveryAddress, setDeliveryAddress] = useState({ address1: '', city: '', province: '', postalCode: '', countryCode: 'CA' });
  const appliedUrlSelectionForListRef = useRef<string | null>(null);
  const syncSelectedCardUrl = useCallback(
    (name: string | null) => {
      void navigate({
        to: '/build/$listId/$slug',
        params: { listId, slug },
        search: name ? { card: name } : {},
        replace: true,
      });
    },
    [listId, navigate, slug],
  );
  const handleSelectCard = useCallback(
    (name: string | null) => {
      setSelectedName(name);
      syncSelectedCardUrl(name);
    },
    [setSelectedName, syncSelectedCardUrl],
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
      s.add(item.title.toLowerCase());
      s.add(item.title.replace(/\s*\[[^\]]+\]\s*$/, '').trim().toLowerCase());
    }
    return s;
  }, [cartItems]);

  const inCartByName = useCallback(
    (name: string) => cartCardKeys.has(name.toLowerCase()),
    [cartCardKeys],
  );

  // Editor: add/remove + history.
  const { history, addCard, removeCard, undo } = useListEditor(
    listId,
    inCartByName,
  );

  // Default selection: URL card, persisted card, then first alphabetical entry. Handles the case
  // where the selected card was removed from the list — auto-pick the next
  // entry in alphabetical order.
  useEffect(() => {
    if (entries.length === 0) {
      appliedUrlSelectionForListRef.current = listId;
      if (selectedName !== null) setSelectedName(null);
      if (search.card) syncSelectedCardUrl(null);
      return;
    }

    const entryNames = new Set(entries.map((entry) => entry.name));
    const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
    const urlName = search.card && entryNames.has(search.card) ? search.card : null;
    const selectedStillValid =
      selectedName && entryNames.has(selectedName) ? selectedName : null;
    const shouldApplyUrlSelection =
      appliedUrlSelectionForListRef.current !== listId;
    const nextName =
      shouldApplyUrlSelection && urlName
        ? urlName
        : selectedStillValid ?? urlName ?? sorted[0].name;

    appliedUrlSelectionForListRef.current = listId;
    if (selectedName !== nextName) {
      setSelectedName(nextName);
    }
    if (search.card !== nextName) {
      syncSelectedCardUrl(nextName);
    }
  }, [
    entries,
    listId,
    search.card,
    selectedName,
    setSelectedName,
    syncSelectedCardUrl,
  ]);

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
      current.length === ALL_STORE_KEYS.length ? [] : ALL_STORE_KEYS.slice(),
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

  const optimizationMinimumCondition = useMemo(
    () => minimumConditionFromFilter(conditions),
    [conditions],
  );

  useEffect(() => {
    if (!selectedName) return;

    const controller = new AbortController();
    setDetailedResults((prev) => ({
      ...prev,
      [selectedName]: { state: 'pending' },
    }));

    fetchCard(selectedName, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setDetailedResults((prev) => ({
          ...prev,
          [selectedName]: lookupFromOffers(response.results),
        }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Failed to fetch';
        setDetailedResults((prev) => ({
          ...prev,
          [selectedName]: { state: 'error', message },
        }));
      });

    return () => controller.abort();
  }, [selectedName]);

  const canAddBestCards =
    entries.length > 0 && selectedStores.length > 0 && !isAddingBestCards;

  const runOptimization = useCallback(async (delivery?: { quoteToken: string; selectedMethods: Record<string, { label: string; handle?: string }> }) => {
    if (selectedStores.length === 0) {
      enqueueSnackbar('Select at least one store before adding best cards', {
        variant: 'warning',
      });
      return;
    }

    setIsAddingBestCards(true);
    try {
      const created = await createListOptimization(listId, {
        stores: selectedStores,
        minimumCondition: optimizationMinimumCondition,
        conditionFlexibility: 'allow-if-needed',
        maxDowngradeSteps: 2,
        ...delivery,
      });
      const deadline = Date.now() + 60_000;
      let completed: Awaited<ReturnType<typeof fetchListOptimizationStatus>> | undefined;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const status = await fetchListOptimizationStatus(listId, created.jobId);
        if (status.status === 'queued' || status.status === 'running') continue;
        completed = status;
        break;
      }
      if (!completed) throw new Error('Optimization took too long. Please retry.');
      if (completed.status === 'failed') throw new Error(`${completed.error}. Please retry.`);
      if (completed.status === 'timed-out') throw new Error('Optimization timed out. Please retry.');
      if (completed.status !== 'completed') throw new Error('Optimization did not complete. Please retry.');
      const bestOption = completed.result.result;
      if (!bestOption || bestOption.selectedOffers.length === 0) {
        enqueueSnackbar('No purchasable cards were found for this list', {
          variant: 'warning',
        });
        return;
      }

      const result = addManyToCart(
        bestOption.selectedOffers.map((selectedOffer) => selectedOffer.offer),
      );
      const skipped =
        result.skippedDuplicate + result.skippedInvalid + result.skippedCapacity;
      const details = [
        bestOption.missingCards.length > 0
          ? `${bestOption.missingCards.length} missing`
          : null,
        skipped > 0 ? `${skipped} skipped` : null,
      ].filter(Boolean);

      if (result.added > 0) {
        openCart();
        enqueueSnackbar(
          `Added ${result.added} best ${result.added === 1 ? 'card' : 'cards'} to cart${
            details.length > 0 ? ` (${details.join(', ')})` : ''
          }`,
          { variant: bestOption.status === 'complete' ? 'success' : 'info' },
        );
        return;
      }

      enqueueSnackbar(
        skipped > 0
          ? `No new cards added (${details.join(', ')})`
          : 'No new cards were added',
        { variant: 'default' },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to optimize list';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setIsAddingBestCards(false);
    }
  }, [
    addManyToCart,
    enqueueSnackbar,
    listId,
    openCart,
    optimizationMinimumCondition,
    selectedStores,
  ]);

  const handleAddBestCards = useCallback(() => {
    if (selectedStores.length === 0) {
      enqueueSnackbar('Select at least one store before filling cards', { variant: 'warning' });
      return;
    }
    setDeliveryQuote(null);
    setDeliveryOpen(true);
  }, [enqueueSnackbar, selectedStores.length]);

  const loadDeliveryOptions = useCallback(async () => {
    setDeliveryLoading(true);
    try {
      const quote = await fetchDeliveryOptions(listId, deliveryAddress, selectedStores);
      setDeliveryQuote(quote);
      setSelectedDeliveryMethods(Object.fromEntries(Object.entries(quote.methods).map(([store, methods]) => {
        const method = methods.filter((item) => item.price > 0).sort((a, b) => a.price - b.price)[0] ?? methods[0];
        return [store, { label: method.label, ...(method.handle ? { handle: method.handle } : {}) }];
      })));
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Unable to quote delivery options', { variant: 'error' });
    } finally {
      setDeliveryLoading(false);
    }
  }, [deliveryAddress, enqueueSnackbar, listId, selectedStores]);

  const startQuotedFill = useCallback(() => {
    if (!deliveryQuote) return;
    setDeliveryOpen(false);
    void runOptimization({ quoteToken: deliveryQuote.quoteToken, selectedMethods: selectedDeliveryMethods });
  }, [deliveryQuote, runOptimization, selectedDeliveryMethods]);

  const selectedIndex = selectedName ? sortedNames.indexOf(selectedName) : -1;
  const selectedPosition =
    selectedIndex >= 0 ? `${selectedIndex + 1} of ${sortedNames.length}` : undefined;

  const handleSelectPrevious = useCallback(() => {
    if (selectedIndex <= 0) return;
    handleSelectCard(sortedNames[selectedIndex - 1]);
  }, [handleSelectCard, selectedIndex, sortedNames]);

  const handleSelectNext = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= sortedNames.length - 1) return;
    handleSelectCard(sortedNames[selectedIndex + 1]);
  }, [handleSelectCard, selectedIndex, sortedNames]);

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
      // ListsContext already toasted ("lists need at least one card") when the
      // removal was refused — skip the success/undo snackbar.
      if (!entryId) return null;
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

  if (!list && !loading) {
    return (
      <Container maxWidth={false} sx={{ maxWidth: 1100 }}>
        <EmptyState
          title="List not found"
          description="We couldn't find that list in your saved lists."
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
        allStores={ALL_STORE_KEYS}
        storeLabels={STORE_LABEL_BY_KEY}
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
            positionLabel={selectedPosition}
            canSelectPrevious={selectedIndex > 0}
            canSelectNext={selectedIndex >= 0 && selectedIndex < sortedNames.length - 1}
            onSelectPrevious={handleSelectPrevious}
            onSelectNext={handleSelectNext}
          />
        </Box>
        <CardListPanel
          entries={entries}
          selectedName={selectedName}
          onSelect={handleSelectCard}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          results={results}
          inCartByName={inCartByName}
          history={history}
          existingNames={existingNames}
          onAddCard={handleAddCard}
          onRemoveCard={handleRemoveCard}
          onUndoHistory={performUndo}
          onAddBestCards={handleAddBestCards}
          isAddingBestCards={isAddingBestCards}
          canAddBestCards={canAddBestCards}
          loadedPriceCount={loadedPriceCount}
          totalPriceCount={uniqueNames.length}
          hasMorePrices={false}
          isLoadingMorePrices={false}
          onLoadMorePrices={() => undefined}
        />
      </Box>
      <Dialog open={deliveryOpen} onClose={() => !deliveryLoading && setDeliveryOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Set up delivery for this fill</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5, pt: '12px !important' }}>
          {!deliveryQuote ? <>
            <Box sx={{ color: 'text.secondary', fontSize: 14 }}>
              Delivery prices are locked for this fill and may differ at merchant checkout. Your address is used only to request these quotes.
            </Box>
            <TextField required label="Street address" value={deliveryAddress.address1} onChange={(event) => setDeliveryAddress((value) => ({ ...value, address1: event.target.value }))} helperText="Use your browser's saved-address autofill or enter it manually" inputProps={{ autoComplete: 'street-address' }} />
            <TextField required label="City" value={deliveryAddress.city} onChange={(event) => setDeliveryAddress((value) => ({ ...value, city: event.target.value }))} inputProps={{ autoComplete: 'address-level2' }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField required select label="Province or territory" value={deliveryAddress.province} onChange={(event) => setDeliveryAddress((value) => ({ ...value, province: event.target.value }))} SelectProps={{ native: false }} inputProps={{ autoComplete: 'address-level1' }}>
                {CANADIAN_PROVINCES.map(([code, name]) => <MenuItem key={code} value={code}>{name}</MenuItem>)}
              </TextField>
              <TextField required label="Postal code" value={deliveryAddress.postalCode} onChange={(event) => setDeliveryAddress((value) => ({ ...value, postalCode: formatCanadianPostalCode(event.target.value) }))} error={deliveryAddress.postalCode.length > 0 && !/^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(deliveryAddress.postalCode)} helperText={deliveryAddress.postalCode && !/^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(deliveryAddress.postalCode) ? 'Use A1A 1A1' : ' '} inputProps={{ autoComplete: 'postal-code', maxLength: 7 }} />
            </Box>
          </> : <>
            <Box sx={{ color: 'text.secondary', fontSize: 14 }}>The lowest positive-priced method is selected by default. Pickup remains CA$0.</Box>
            {Object.entries(deliveryQuote.methods).map(([store, methods]) => {
              const selected = methods.find((method) => method.label === selectedDeliveryMethods[store]?.label && method.handle === selectedDeliveryMethods[store]?.handle);
              return <Box key={store} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
                <Box sx={{ fontWeight: 700 }}>{STORE_LABEL_BY_KEY[store] ?? store}</Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {methods.map((method) => <Button key={`${method.label}-${method.handle ?? ''}`} size="small" variant={selected === method ? 'contained' : 'outlined'} onClick={() => setSelectedDeliveryMethods((current) => ({ ...current, [store]: { label: method.label, ...(method.handle ? { handle: method.handle } : {}) } }))}>{method.label}: CA${method.price.toFixed(2)}</Button>)}
                </Box>
                <Box sx={{ fontSize: 14 }}>{selected ? `${selected.label} — CA$${selected.price.toFixed(2)}` : 'No quoted method available'}</Box>
              </Box>;
            })}
          </>}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={() => { setDeliveryOpen(false); void runOptimization(); }} disabled={deliveryLoading}>Skip (estimate CA$3/store)</Button>
          {!deliveryQuote
            ? <Button variant="contained" onClick={() => void loadDeliveryOptions()} disabled={deliveryLoading || !deliveryAddress.address1 || !deliveryAddress.city || !deliveryAddress.province || !deliveryAddress.postalCode}>{deliveryLoading ? 'Getting quotes…' : 'Get delivery options'}</Button>
            : <Button variant="contained" onClick={startQuotedFill}>Fill Best Cards</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
