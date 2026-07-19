import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import { Add } from '@mui/icons-material';
import type { CardSearchResponse, StoreInfo } from '@scoutlgs/shared';
import { fetchCard } from '@/api/cards';
import { FiltersSidebar } from '@/components/results/FiltersSidebar';
import { ProductTile } from '@/components/results/ProductTile';
import { StaleNotice } from '@/components/results/StaleNotice';
import { DEFAULT_STORE_KEYS, STORE_FACETS } from '@/data/sample';
import { useLists } from '@/components/lists/ListsContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { slugifyName } from '@/utils/slugify';
import { useSnackbar } from 'notistack';
import { AdSlot } from '@/components/ads';
import { adsConfig } from '@/config/ads';

export const Route = createFileRoute('/card/$name')({
  component: CardRoute,
});

const CONDITION_ORDER = ['NM', 'LP', 'MP', 'HP', 'DMG'];

function conditionsFromDefault(defaultCondition: string): string[] {
  const index = CONDITION_ORDER.indexOf(defaultCondition);
  if (index < 0) return [];
  return CONDITION_ORDER.slice(0, index + 1);
}

function CardRoute() {
  const navigate = useNavigate();
  const { name } = useParams({ from: '/card/$name' });
  const decoded = useMemo(() => {
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }, [name]);

  const [response, setResponse] = useState<CardSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { push: pushRecent } = useRecentSearches();
  const { lists, save, addCardToList, canCreateList } = useLists();
  const { enqueueSnackbar } = useSnackbar();

  const [defaultStoreKeys] = useLocalStorage<string[]>(
    'scoutlgs:default-stores',
    DEFAULT_STORE_KEYS,
  );
  const [defaultCondition] = useLocalStorage<string>(
    'scoutlgs:default-condition',
    'LP',
  );
  const [selectedStores, setSelectedStores] = useState<string[]>(() =>
    defaultStoreKeys.length > 0 ? defaultStoreKeys : DEFAULT_STORE_KEYS,
  );
  const [conditions, setConditions] = useState<string[]>(() =>
    conditionsFromDefault(defaultCondition),
  );
  const [maxPrice, setMaxPrice] = useState('');
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const [createListOpen, setCreateListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [filtersCollapsed, setFiltersCollapsed] = useLocalStorage<boolean>(
    'scoutlgs:filters-collapsed',
    false,
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCard(decoded, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResponse(data);
        if (data.results.length > 0) {
          const cheapest = [...data.results].sort((a, b) => a.price - b.price)[0];
          pushRecent(cheapest);
        }
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Failed to load card');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [decoded, reloadKey, pushRecent]);

  const stores: StoreInfo[] = useMemo(() => {
    if (response?.stores?.length) return response.stores;
    return STORE_FACETS.map((s, i) => ({
      id: i,
      uuid: String(i),
      name: s.key,
      displayName: s.label,
      cardCount: s.count,
    }));
  }, [response]);

  // Counts are keyed by store slug (`store_key`), to match the filter values
  // passed to FiltersSidebar via `selectedStores` / `onToggleStore`.
  const storeCounts = useMemo<Record<string, number>>(() => {
    if (!response) return {};
    const counts: Record<string, number> = {};
    for (const r of response.results) {
      counts[r.store_key] = (counts[r.store_key] ?? 0) + 1;
    }
    return counts;
  }, [response]);

  // Maps the displayed filter label to the offer's condition slug. Keep aligned
  // with packages/shared Condition + FiltersSidebar.utils CONDITIONS.
  const conditionMap: Record<string, string> = {
    NM: 'nm',
    LP: 'lp',
    MP: 'mp',
    HP: 'hp',
    DMG: 'dmg',
    Unknown: 'unknown',
  };

  const visibleResults = useMemo(() => {
    if (!response) return [];
    const condFilter = new Set(conditions.map((c) => conditionMap[c]).filter(Boolean));
    const parsedMax = Number(maxPrice);
    const maxPriceFilter = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null;
    return [...response.results]
      .filter((r) => selectedStores.includes(r.store_key))
      .filter((r) => condFilter.size === 0 || condFilter.has(r.condition))
      .filter((r) => maxPriceFilter == null || r.price <= maxPriceFilter)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, selectedStores, conditions, maxPrice]);

  const toggleStore = (n: string) =>
    setSelectedStores((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const toggleCondition = (c: string) =>
    setConditions((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const handleAddMenuOpen = (event: MouseEvent<HTMLElement>) => {
    setAddMenuAnchor(event.currentTarget);
  };

  const handleAddMenuClose = () => setAddMenuAnchor(null);

  const handleAddToList = async (listId: string, listName: string) => {
    setAddMenuAnchor(null);
    await addCardToList(listId, decoded);
    enqueueSnackbar(`Added "${decoded}" to ${listName}`, { variant: 'success' });
  };

  const handleCreateList = async () => {
    setAddMenuAnchor(null);
    setNewListName(decoded);
    setCreateListOpen(true);
  };

  const handleConfirmCreateList = async () => {
    const listName = newListName.trim();
    if (!listName) {
      enqueueSnackbar('Name your card list before continuing', { variant: 'warning' });
      return;
    }
    const id = await save(listName, [decoded]);
    if (!id) return;
    setCreateListOpen(false);
    enqueueSnackbar(`Created "${listName}"`, { variant: 'success' });
    navigate({
      to: '/list/$listId/$slug',
      params: { listId: id, slug: slugifyName(listName) },
    });
  };

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1100 }}>
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'primary.main',
                mb: 0.5,
              }}
            >
              Search
            </Typography>
            <Typography variant="h2">{decoded}</Typography>
          </Box>
          <Button variant="outlined" color="primary" startIcon={<Add />} onClick={handleAddMenuOpen}>
            Add to List
          </Button>
          <Menu
            anchorEl={addMenuAnchor}
            open={Boolean(addMenuAnchor)}
            onClose={handleAddMenuClose}
            slotProps={{ paper: { sx: { minWidth: 240, maxWidth: 320 } } }}
          >
            {lists.map((list) => (
              <MenuItem key={list.id} onClick={() => handleAddToList(list.id, list.name)}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
                    {list.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {list.cards.length} {list.cards.length === 1 ? 'card' : 'cards'}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
            {lists.length > 0 && <Divider />}
            <MenuItem disabled={!canCreateList} onClick={handleCreateList}>
              {canCreateList ? 'Create new list from this card' : 'List limit reached'}
            </MenuItem>
          </Menu>
        </Box>
        <Dialog
          open={createListOpen}
          onClose={() => setCreateListOpen(false)}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Create Card List</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="List name"
              fullWidth
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleConfirmCreateList();
              }}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => setCreateListOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={!newListName.trim()}
              onClick={handleConfirmCreateList}
            >
              Create
            </Button>
          </DialogActions>
        </Dialog>

        {loading ? (
          <Box>
            <LinearProgress
              sx={(theme) => ({
                height: 4,
                borderRadius: 999,
                bgcolor: theme.palette.primarySoft,
                '& .MuiLinearProgress-bar': { bgcolor: 'primary.main', borderRadius: 999 },
              })}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Scouting available offers... streaming results in.
            </Typography>
          </Box>
        ) : error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        ) : (
          <StaleNotice />
        )}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: filtersCollapsed
            ? { xs: '1fr', md: '56px 1fr' }
            : { xs: '1fr', md: '240px 1fr' },
          gap: { xs: 4, md: filtersCollapsed ? 4 : 6 },
        }}
      >
        <FiltersSidebar
          stores={stores}
          selectedStores={selectedStores}
          onToggleStore={toggleStore}
          conditions={conditions}
          onToggleCondition={toggleCondition}
          collapsed={filtersCollapsed}
          onToggleCollapsed={() => setFiltersCollapsed((v) => !v)}
          storeCounts={storeCounts}
          maxPrice={maxPrice}
          onMaxPriceChange={setMaxPrice}
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 2,
          }}
        >
          {visibleResults.map((c, i) => (
            <ProductTile
              key={`${c.title}-${c.store}-${c.set}-${i}`}
              card={c}
              isCheapest={i === 0 && visibleResults.length > 1}
            />
          ))}
        </Box>
      </Box>
      {!loading && !error && visibleResults.length > 0 && (
        <AdSlot slot={adsConfig.cardResultsSlot} ariaLabel="Advertisement after card search results" />
      )}
    </Container>
  );
}
