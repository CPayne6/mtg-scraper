import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useParams } from '@tanstack/react-router';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Add from '@mui/icons-material/Add';
import type { CardSearchResponse, StoreInfo } from '@scoutlgs/shared';
import { fetchCard } from '@/api/cards';
import { FiltersSidebar } from '@/components/results/FiltersSidebar';
import { ProductTile } from '@/components/results/ProductTile';
import { StaleNotice } from '@/components/results/StaleNotice';
import { STORE_FACETS } from '@/data/sample';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useRecentSearches } from '@/hooks/useRecentSearches';

export const Route = createFileRoute('/card/$name')({
  component: CardRoute,
});

function CardRoute() {
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

  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
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

  const conditionMap: Record<string, string> = {
    NM: 'nm',
    LP: 'pl',
    MP: 'mp',
    HP: 'hp',
    DMG: 'unknown',
  };

  const visibleResults = useMemo(() => {
    if (!response) return [];
    const condFilter = new Set(conditions.map((c) => conditionMap[c]).filter(Boolean));
    return [...response.results]
      .filter((r) => selectedStores.length === 0 || selectedStores.includes(r.store_key))
      .filter((r) => condFilter.size === 0 || condFilter.has(r.condition))
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, selectedStores, conditions]);

  const toggleStore = (n: string) =>
    setSelectedStores((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const toggleCondition = (c: string) =>
    setConditions((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

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
          <Button variant="outlined" color="primary" startIcon={<Add />}>
            Add to Deck
          </Button>
        </Box>

        {loading ? (
          <Box>
            <LinearProgress
              sx={(theme) => ({
                height: 4,
                borderRadius: 999,
                bgcolor:
                  theme.palette.mode === 'dark'
                    ? 'rgba(36,135,33,0.18)'
                    : 'rgba(74,103,65,0.12)',
                '& .MuiLinearProgress-bar': { bgcolor: 'primary.main', borderRadius: 999 },
              })}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Scouting {Math.min(7, stores.length)} of 7 stores… streaming results in.
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
    </Container>
  );
}
