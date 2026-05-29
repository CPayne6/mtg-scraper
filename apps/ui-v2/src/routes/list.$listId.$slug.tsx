import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { slugifyName } from '@/utils/slugify';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import ArrowForward from '@mui/icons-material/ArrowForward';
import FilterAlt from '@mui/icons-material/FilterAlt';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import Construction from '@mui/icons-material/Construction';
import { useSnackbar } from 'notistack';
import type { CardWithStore } from '@scoutlgs/shared';
import { useLists } from '@/components/lists/ListsContext';
import { useCart } from '@/components/cart/CartContext';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useConfirm } from '@/components/feedback/ConfirmDialog';
import { ColorPips } from '@/components/lists/ColorPips';
import { KpiTile } from '@/components/results/KpiTile';
import { DecklistRow } from '@/components/results/DecklistRow';
import { DECK_META } from '@/data/sample';
import { colorIdentityName } from '@/data/colors';
import { groupByName } from '@/utils/parseDeckList';
import { fetchCard } from '@/api/cards';

export const Route = createFileRoute('/list/$listId/$slug')({
  component: ListDetailRoute,
});

type CardState =
  | { state: 'pending' }
  | { state: 'success'; cheapest: CardWithStore | null }
  | { state: 'error'; message: string };

const CONDITION_LABELS: Record<string, string> = {
  nm: 'NM',
  lp: 'LP',
  mp: 'MP',
  hp: 'HP',
  dmg: 'DMG',
  unknown: 'Unknown',
};

function ListDetailRoute() {
  const { listId } = useParams({ from: '/list/$listId/$slug' });
  const navigate = useNavigate();
  const { get, getList, remove: removeList, loading } = useLists();
  const { add: addToCart } = useCart();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const cards = get(listId);
  const list = getList(listId);
  const listName = list?.name ?? '';
  const entries = useMemo(() => groupByName(cards), [cards]);
  const entryKey = useMemo(() => entries.map((e) => e.name).join('\n'), [entries]);
  const [lookupResults, setLookupResults] = useState<{
    key: string;
    results: Record<string, CardState>;
  }>({ key: '', results: {} });
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const results = useMemo<Record<string, CardState>>(() => {
    if (entries.length === 0) return {};
    const pending = Object.fromEntries(
      entries.map((e) => [e.name, { state: 'pending' } as CardState]),
    );
    if (lookupResults.key !== entryKey) return pending;
    return { ...pending, ...lookupResults.results };
  }, [entries, entryKey, lookupResults]);

  useEffect(() => {
    if (entries.length === 0) return;
    const controller = new AbortController();
    const elapsedStart = Date.now();
    const nextResults: Record<string, CardState> = {};
    let remaining = entries.length;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0 && !controller.signal.aborted) {
        setElapsedMs(Date.now() - elapsedStart);
      }
    };
    for (const entry of entries) {
      fetchCard(entry.name, controller.signal)
        .then((resp) => {
          if (controller.signal.aborted) return;
          const cheapest =
            resp.results.length > 0
              ? [...resp.results].sort((a, b) => a.price - b.price)[0]
              : null;
          nextResults[entry.name] = { state: 'success', cheapest };
          setLookupResults({ key: entryKey, results: { ...nextResults } });
          tick();
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          const message = err instanceof Error ? err.message : 'Failed to fetch';
          nextResults[entry.name] = { state: 'error', message };
          setLookupResults({ key: entryKey, results: { ...nextResults } });
          tick();
        });
    }
    return () => controller.abort();
  }, [entries, entryKey]);

  const loadedCount = Object.values(results).filter((r) => r.state !== 'pending').length;
  const isLoaded = entries.length > 0 && loadedCount === entries.length;
  const anyErrors = Object.values(results).some((r) => r.state === 'error');

  const { deckTotal, inStockCount, uniqueStoreCount } = useMemo(() => {
    let total = 0;
    let inStock = 0;
    const stores = new Set<string>();
    for (const entry of entries) {
      const r = results[entry.name];
      if (r && r.state === 'success' && r.cheapest) {
        total += entry.qty * r.cheapest.price;
        inStock += 1;
        stores.add(r.cheapest.store);
      }
    }
    return { deckTotal: total, inStockCount: inStock, uniqueStoreCount: stores.size };
  }, [entries, results]);

  const handleDeleteList = useCallback(async () => {
    const ok = await confirm({
      title: `Delete ${listName || 'this list'}?`,
      description: 'This removes the list from your account. This action cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    await removeList(listId);
    navigate({ to: '/lists' });
  }, [confirm, listName, listId, navigate, removeList]);

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

  const meta = DECK_META[listName] ?? { colors: '', archetype: 'Custom', updated: 'recently' };
  const checkoutStores = uniqueStoreCount || 0;

  const handleAddRowToCart = (cardName: string) => {
    const r = results[cardName];
    if (!r || r.state !== 'success' || !r.cheapest) {
      enqueueSnackbar(`No price yet for "${cardName}"`, { variant: 'warning' });
      return;
    }
    const added = addToCart(r.cheapest);
    enqueueSnackbar(
      added ? `Added "${cardName}" to cart` : `"${cardName}" is already in your cart`,
      { variant: added ? 'success' : 'default' },
    );
  };

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1100 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 3,
          mb: 3.5,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Button
            onClick={() => navigate({ to: '/lists' })}
            startIcon={<ChevronLeft sx={{ fontSize: 14 }} />}
            sx={{
              alignSelf: 'flex-start',
              py: 0.5,
              px: 1.25,
              fontSize: '0.78rem',
              color: 'text.secondary',
              minWidth: 0,
              mb: 0.75,
              '&:hover': { color: 'primary.main', bgcolor: 'transparent' },
            }}
          >
            All lists
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, flexWrap: 'wrap' }}>
            <ColorPips colors={meta.colors} size={32} />
            <Typography
              sx={{
                fontSize: { xs: '2rem', md: '2.4rem' },
                fontWeight: 700,
                letterSpacing: '-0.01em',
                lineHeight: 1,
                m: 0,
                wordBreak: 'break-word',
              }}
            >
              {listName}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mt: 0.75 }}>
            {colorIdentityName(meta.colors)} · {cards.length} cards
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Construction sx={{ fontSize: 18 }} />}
            onClick={() =>
              navigate({
                to: '/build/$listId/$slug',
                params: { listId, slug: slugifyName(listName || listId) },
              })
            }
          >
            Build Cart
          </Button>
          <Button
            variant="outlined"
            color="primary"
            onClick={handleDeleteList}
          >
            Delete
          </Button>
          <Button
            variant="contained"
            color="primary"
            endIcon={<ArrowForward />}
            disabled={!isLoaded || checkoutStores === 0}
          >
            {checkoutStores > 0
              ? `Check Out at ${checkoutStores} ${checkoutStores === 1 ? 'Store' : 'Stores'}`
              : 'Check Out'}
          </Button>
        </Stack>
      </Box>

      {!isLoaded && entries.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress
            variant="determinate"
            value={Math.round((loadedCount / entries.length) * 100)}
            sx={{
              height: 4,
              borderRadius: 999,
              bgcolor: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'rgba(36,135,33,0.18)'
                  : 'rgba(74,103,65,0.12)',
              '& .MuiLinearProgress-bar': { bgcolor: 'primary.main' },
            }}
          />
          <Typography sx={{ mt: 1, fontSize: '0.875rem', color: 'text.secondary' }}>
            Scouting {loadedCount} of {entries.length} cards…
          </Typography>
        </Box>
      )}

      {isLoaded && anyErrors && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 1.5 }}>
          Some cards couldn't be priced — they're shown with a dash below.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 2,
          mb: 4,
        }}
      >
        <KpiTile
          label="Deck total"
          value={isLoaded ? `CA$${deckTotal.toFixed(2)}` : `…`}
          delta={isLoaded ? `${inStockCount} of ${entries.length} priced` : `scouting`}
          deltaTone={isLoaded && inStockCount === entries.length ? 'good' : 'muted'}
        />
        <KpiTile
          label="Stores searched"
          value={isLoaded ? `${uniqueStoreCount} ${uniqueStoreCount === 1 ? 'store' : 'stores'}` : `…`}
          delta={isLoaded && elapsedMs != null ? `in ${(elapsedMs / 1000).toFixed(1)}s` : `in progress`}
        />
        <KpiTile
          label="In stock"
          value={isLoaded ? `${inStockCount} / ${entries.length}` : `${loadedCount} / ${entries.length}`}
          delta={
            isLoaded
              ? inStockCount === entries.length
                ? 'all available'
                : `${entries.length - inStockCount} not found`
              : 'fetching prices'
          }
          deltaTone={isLoaded && inStockCount === entries.length ? 'good' : 'muted'}
        />
      </Box>

      <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: 2 }}>
        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}
        >
          <Typography variant="h3">Cards · {entries.length}</Typography>
          <Button color="primary" startIcon={<FilterAlt sx={{ fontSize: 14 }} />}>
            Filter
          </Button>
        </Box>
        <Stack spacing={1}>
          {entries.map(({ name, qty }) => {
            const r = results[name];
            let meta = '—';
            let price = 0;
            let store = '—';
            if (r?.state === 'success' && r.cheapest) {
              const { set, condition } = r.cheapest;
              meta = `${set || `—`} · ${CONDITION_LABELS[condition] ?? condition}`;
              price = qty * r.cheapest.price;
              store = r.cheapest.store;
            } else if (r?.state === 'pending') {
              meta = 'Scouting…';
            } else if (r?.state === 'error') {
              meta = 'Lookup failed';
            } else if (r?.state === 'success' && !r.cheapest) {
              meta = 'No copies found';
            }
            return (
              <DecklistRow
                key={name}
                qty={qty}
                name={name}
                meta={meta}
                price={price}
                store={store}
                onStoreChange={() => handleAddRowToCart(name)}
                onRemove={() => enqueueSnackbar(`Removed ${name}`, { variant: `default` })}
              />
            );
          })}
        </Stack>
      </Paper>
    </Container>
  );
}
