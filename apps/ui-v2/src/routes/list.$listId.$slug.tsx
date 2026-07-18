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
import { FilterAlt } from '@mui/icons-material';
import { ChevronLeft } from '@mui/icons-material';
import { Construction } from '@mui/icons-material';
import { MoreVert } from '@mui/icons-material';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
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
  const { get, getList, remove: removeList, removeCardFromList, loading } = useLists();
  const { add: addToCart, items: cartItems } = useCart();
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
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [showNeedsAttentionOnly, setShowNeedsAttentionOnly] = useState(false);
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
    const nextResults: Record<string, CardState> = {};
    let remaining = entries.length;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0 && !controller.signal.aborted) {
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
  const displayedEntries = useMemo(
    () =>
      showNeedsAttentionOnly
        ? entries.filter((entry) => {
            const result = results[entry.name];
            return !result || result.state !== 'success' || !result.cheapest;
          })
        : entries,
    [entries, results, showNeedsAttentionOnly],
  );

  const { deckTotal, inStockCount } = useMemo(() => {
    let total = 0;
    let inStock = 0;
    for (const entry of entries) {
      const r = results[entry.name];
      if (r && r.state === 'success' && r.cheapest) {
        total += entry.qty * r.cheapest.price;
        inStock += 1;
      }
    }
    return { deckTotal: total, inStockCount: inStock };
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

  const handleRemoveCard = useCallback(
    async (cardName: string) => {
      const ok = await confirm({
        title: `Remove ${cardName}?`,
        description: 'This removes one copy from the list.',
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!ok) return;
      await removeCardFromList(listId, cardName);
    },
    [confirm, listId, removeCardFromList],
  );
  const listSlug = useMemo(
    () => slugifyName(listName || listId),
    [listId, listName],
  );
  const handleOpenBuilderCard = useCallback(
    (cardName: string) => {
      navigate({
        to: '/build/$listId/$slug',
        params: { listId, slug: listSlug },
        search: { card: cardName },
      });
    },
    [listId, listSlug, navigate],
  );

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

  const handleBuildCart = () => navigate({ to: '/build/$listId/$slug', params: { listId, slug: listSlug } });

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
            <IconButton size="small" aria-label="List actions" onClick={(event) => setMenuAnchor(event.currentTarget)}><MoreVert /></IconButton>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}><MenuItem onClick={() => { setMenuAnchor(null); void handleDeleteList(); }}>Delete list</MenuItem></Menu>
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
            onClick={handleBuildCart}
          >
            Build Cart
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
              bgcolor: (theme) => theme.palette.primarySoft,
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
          label="Lowest possible price"
          value={isLoaded ? `CA$${deckTotal.toFixed(2)}` : `…`}
          delta={isLoaded ? `${inStockCount} of ${entries.length} priced` : `scouting`}
          deltaTone={isLoaded && inStockCount === entries.length ? 'good' : 'muted'}
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
          <Typography variant="h3">
            Cards - {displayedEntries.length}
            {showNeedsAttentionOnly ? ` / ${entries.length}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
            <Button
              color="primary"
              variant={showNeedsAttentionOnly ? 'contained' : 'text'}
              startIcon={<FilterAlt sx={{ fontSize: 14 }} />}
              onClick={() => setShowNeedsAttentionOnly((value) => !value)}
            >
              {showNeedsAttentionOnly ? 'Show All' : 'Needs Attention'}
            </Button>
          </Box>
        </Box>
        <Stack spacing={1}>
          {displayedEntries.map(({ name, qty }) => {
            const r = results[name];
            let meta = '—';
            let price = 0;
            const inCart = cartItems.some((item) => item.title === name || item.title.startsWith(`${name} [`));
            let store = inCart ? 'In cart' : 'Not in cart';
            if (r?.state === 'success' && r.cheapest) {
              const { set, condition } = r.cheapest;
              meta = `${set || `—`} · ${CONDITION_LABELS[condition] ?? condition}`;
              price = qty * r.cheapest.price;
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
                storeActionDisabled
                storeActionStatic
                onOpenBuilder={() => handleOpenBuilderCard(name)}
                onRemove={() => handleRemoveCard(name)}
              />
            );
          })}
        </Stack>
      </Paper>
    </Container>
  );
}
