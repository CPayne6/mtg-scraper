import { CardSearchResponse, CardWithStore } from "@scoutlgs/shared"
import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Box, Grid, Stack, Typography } from "@mui/material"
import { CardList } from "../CardsList"
import { StoreFilter } from "../StoreFilter"
import { PreviewLibrary } from ".."
import SkryfallAutocomplete from "../SkryfallAutocomplete/SkryfallAutocomplete"

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const fetchCardData = async (name: string) => {
  const response = await fetch(`${API_URL}/card/${encodeURIComponent(name)}`)
  return await response.json() as CardSearchResponse
}

// Filter operation types
type FilterOperation = 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'contains' | 'in' | 'custom';

// Filter configuration interface
interface FilterConfig<T = any> {
  filterKey: string; // Unique identifier for this filter
  key?: keyof CardWithStore;
  operation?: FilterOperation;
  value?: T;
  // Custom filter function for complex logic
  filterFn?: (card: CardWithStore) => boolean;
}

// Default filter configuration - Store filter (empty array = show all stores)
const DEFAULT_FILTERS = new Map<string, FilterConfig>([
  ['stores', { filterKey: 'stores', key: 'store', operation: 'in', value: [] }],
]);

interface CardDisplayProps {
  cardName: string;
}

// Apply a single filter to a card
function applyFilter(card: CardWithStore, filter: FilterConfig): boolean {
  // If custom filter function is provided, use it
  if (filter.filterFn) {
    return filter.filterFn(card);
  }

  // If no key specified, pass through
  if (!filter.key || filter.value === null || filter.value === undefined) {
    return true;
  }

  const cardValue = card[filter.key];
  const filterValue = filter.value;

  switch (filter.operation) {
    case 'equals':
      return cardValue === filterValue;
    case 'notEquals':
      return cardValue !== filterValue;
    case 'greaterThan':
      return typeof cardValue === 'number' && typeof filterValue === 'number' && cardValue > filterValue;
    case 'lessThan':
      return typeof cardValue === 'number' && typeof filterValue === 'number' && cardValue < filterValue;
    case 'greaterThanOrEqual':
      return typeof cardValue === 'number' && typeof filterValue === 'number' && cardValue >= filterValue;
    case 'lessThanOrEqual':
      return typeof cardValue === 'number' && typeof filterValue === 'number' && cardValue <= filterValue;
    case 'contains':
      return typeof cardValue === 'string' && typeof filterValue === 'string' &&
             cardValue.toLowerCase().includes(filterValue.toLowerCase());
    case 'in':
      // For array values - check if cardValue is in the array
      return Array.isArray(filterValue) && filterValue.includes(cardValue);
    default:
      return true;
  }
}

// Apply all filters to cards
function applyFilters(cards: CardWithStore[], filters: FilterConfig[]): CardWithStore[] {
  return cards.filter(card => {
    // Card must pass ALL filters to be included
    return filters.every(filter => applyFilter(card, filter));
  });
}

export function CardDisplay(props: CardDisplayProps) {
  const cardName = decodeURIComponent(props.cardName)
  const navigate = useNavigate()

  const [data, setData] = useState<CardSearchResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // Extensible filter configuration array - use Map for O(1) lookup by filterKey
  const [filterConfigs, setFilterConfigs] = useState<Map<string, FilterConfig>>(DEFAULT_FILTERS);

  useEffect(() => {
    async function fetchCard() {
      setLoading(true)
      setData(null) // Clear stale data immediately
      try {
        const responseData = await fetchCardData(cardName)
        setData(responseData)
        // Reset filters to default
        setFilterConfigs(new Map(DEFAULT_FILTERS))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchCard()
  }, [cardName])

  // Apply all active filters to cards
  const filteredCards = useMemo(() => {
    if (!data) return undefined

    // Only apply filters that have values set
    const activeFilters = Array.from(filterConfigs.values()).filter(filter => {
      if (filter.filterFn) return true; // Custom filters are always active
      if (Array.isArray(filter.value)) return filter.value.length > 0; // Array filters must have items
      return filter.value !== null && filter.value !== undefined;
    });

    // If no active filters, return all results
    if (activeFilters.length === 0) {
      return data.results;
    }

    return applyFilters(data.results, activeFilters);
  }, [data, filterConfigs])

  // Helper function to update a specific filter by filterKey
  const updateFilter = (filterKey: string, newValue: any) => {
    setFilterConfigs(prev => {
      const filter = prev.get(filterKey);
      if (!filter) return prev;

      const updated = new Map(prev);
      updated.set(filterKey, { ...filter, value: newValue });
      return updated;
    });
  }

  // Helper function to add a new filter
  const addFilter = (filter: FilterConfig) => {
    setFilterConfigs(prev => {
      const updated = new Map(prev);
      updated.set(filter.filterKey, filter);
      return updated;
    });
  }

  // Helper function to remove a filter
  const removeFilter = (filterKey: string) => {
    setFilterConfigs(prev => {
      const updated = new Map(prev);
      updated.delete(filterKey);
      return updated;
    });
  }

  // Helper function to get filter value by key
  const getFilterValue = (filterKey: string) => {
    return filterConfigs.get(filterKey)?.value;
  }

  // Specific filter handlers (wrapper functions for common filters)
  const handleStoreFilterChange = (storeNames: string[]) => {
    updateFilter('stores', storeNames);
  }


  const onSubmitCardName = (cardName: string) => {
    if (cardName.length > 0) {
      navigate({ to: `/card/${encodeURIComponent(cardName)}` })
    } else {
      alert("Enter a value to search")
    }
  }

  return (
    <Grid container spacing={3}>
      {/* Left Sidebar - Filters */}
      {!loading && data && data.stores.length > 0 && (
        <Grid item xs={12} md={3} lg={2}>
          <Stack spacing={2}>
            <StoreFilter
              stores={data.stores}
              selectedStores={getFilterValue('stores') || []}
              onStoresChange={handleStoreFilterChange}
            />
          </Stack>
        </Grid>
      )}

      {/* Main Content */}
      <Grid item xs={12} md={data && data.stores.length > 0 ? 9 : 12} lg={data && data.stores.length > 0 ? 10 : 12}>
        <Box sx={{ width: '100%' }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 2, md: 3 }}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
            sx={{
              mb: { xs: 3, md: 4 },
              p: { xs: 2, md: 3 },
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: 1
            }}
          >
            <Box>
              <Typography
                variant="h4"
                sx={{
                  fontSize: { xs: '1.5rem', md: '2rem' },
                  fontWeight: 600,
                  mb: 1
                }}
              >
                {cardName}
              </Typography>
              {loading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading price data...
                </Typography>
              ) : data ? (
                <Typography variant="body2" color="text.secondary">
                  {filteredCards?.length || 0} / {data.priceStats.count} results • ${data.priceStats.min.toFixed(2)} - ${data.priceStats.max.toFixed(2)}
                </Typography>
              ) : null}
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems="center"
              sx={{ width: { xs: '100%', md: 'auto' } }}
            >
              <Box sx={{ flex: { xs: 1, sm: 0 }, minWidth: { sm: 300 } }}>
                <SkryfallAutocomplete
                  initialValue={cardName}
                  placeholder="Search another card"
                  onSelect={onSubmitCardName}
                />
              </Box>
              <PreviewLibrary name={cardName} />
            </Stack>
          </Stack>
          <CardList cards={filteredCards} loading={loading} />
        </Box>
      </Grid>
    </Grid>
  )
}