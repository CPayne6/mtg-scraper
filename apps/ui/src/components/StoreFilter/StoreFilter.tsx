import { useMemo, useState } from 'react'
import { Box, Button, Checkbox, Collapse, FormControl, FormControlLabel, FormGroup, FormLabel, IconButton, Typography } from '@mui/material'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'

export interface StoreCountEntry {
  storeSlug: string;
  storeName: string;
  count: number;
}

interface StoreFilterProps {
  storeCounts: StoreCountEntry[];
  selectedSlugs: string[];
  onStoresChange: (slugs: string[]) => void;
}

const STORAGE_KEY = 'store-filter-expanded';

export function StoreFilter({ storeCounts, selectedSlugs, onStoresChange }: StoreFilterProps) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  const handleToggleExpanded = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newExpanded));
  };

  const handleToggleStore = (slug: string) => {
    if (selectedSlugs.includes(slug)) {
      onStoresChange(selectedSlugs.filter(s => s !== slug));
    } else {
      onStoresChange([...selectedSlugs, slug]);
    }
  };

  const handleClearAll = () => {
    onStoresChange([]);
  };

  const totalCount = useMemo(
    () => storeCounts.reduce((sum, s) => sum + s.count, 0),
    [storeCounts]
  );

  const selectedCount = useMemo(
    () => selectedSlugs.length === 0
      ? totalCount
      : storeCounts
          .filter(s => selectedSlugs.includes(s.storeSlug))
          .reduce((sum, s) => sum + s.count, 0),
    [storeCounts, selectedSlugs, totalCount]
  );

  const displayText = useMemo(
    () => selectedSlugs.length === 0
      ? 'All Stores'
      : `${selectedSlugs.length} store${selectedSlugs.length !== 1 ? 's' : ''}`,
    [selectedSlugs.length]
  );

  const hasStores = storeCounts.length > 0;

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: hasStores ? 'pointer' : 'default',
        }}
        onClick={hasStores ? handleToggleExpanded : undefined}
      >
        <Box>
          <FormLabel
            component="legend"
            sx={{
              fontWeight: 600,
              fontSize: '1rem',
              color: 'text.primary',
              cursor: hasStores ? 'pointer' : 'default',
            }}
          >
            Filter by Store
          </FormLabel>
          <Typography variant="caption" color="text.secondary">
            {hasStores ? `${displayText} (${selectedCount} cards)` : 'No stores available'}
          </Typography>
        </Box>
        {hasStores && (
          <IconButton size="small">
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        )}
      </Box>

      {hasStores && (
        <Collapse in={expanded}>
          <FormControl component="fieldset" fullWidth sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={handleClearAll} disabled={selectedSlugs.length === 0}>
                Clear
              </Button>
            </Box>

            <FormGroup>
              {storeCounts.map((store) => {
                const isSelected = selectedSlugs.length > 0 && selectedSlugs.includes(store.storeSlug);
                return (
                  <FormControlLabel
                    key={store.storeSlug}
                    control={
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleToggleStore(store.storeSlug)}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">{store.storeName}</Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            fontWeight: 600,
                          }}
                        >
                          {store.count}
                        </Typography>
                      </Box>
                    }
                  />
                );
              })}
            </FormGroup>
          </FormControl>
        </Collapse>
      )}
    </Box>
  );
}
