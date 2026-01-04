import { useMemo, useState } from 'react'
import { Box, Button, Checkbox, Collapse, FormControl, FormControlLabel, FormGroup, FormLabel, IconButton, Typography } from '@mui/material'
import { ExpandLess, ExpandMore } from '@mui/icons-material'
import { StoreInfo } from '@mtg-scraper/shared'

interface StoreFilterProps {
  stores: StoreInfo[];
  selectedStores: string[];
  onStoresChange: (storeNames: string[]) => void;
}

export function StoreFilter({ stores, selectedStores, onStoresChange }: StoreFilterProps) {
  const [expanded, setExpanded] = useState(true);

  const handleToggleStore = (storeName: string) => {
    const isSelected = selectedStores.includes(storeName);

    if (isSelected) {
      // Remove from selection
      const newSelection = selectedStores.filter(s => s !== storeName);
      onStoresChange(newSelection);
    } else {
      // Add to selection
      onStoresChange([...selectedStores, storeName]);
    }
  };

  const handleClearAll = () => {
    onStoresChange([]);
  };

  const selectedCount = useMemo(
    () => selectedStores.length === 0
      ? stores.reduce((sum, s) => sum + s.cardCount, 0)
      : stores
          .filter(s => selectedStores.includes(s.displayName))
          .reduce((sum, s) => sum + s.cardCount, 0),
    [stores, selectedStores]
  );

  const displayText = useMemo(
    () => selectedStores.length === 0
      ? 'All Stores'
      : `${selectedStores.length} store${selectedStores.length !== 1 ? 's' : ''}`,
    [selectedStores.length]
  );

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
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box>
          <FormLabel
            component="legend"
            sx={{
              fontWeight: 600,
              fontSize: '1rem',
              color: 'text.primary',
              cursor: 'pointer',
            }}
          >
            Filter by Store
          </FormLabel>
          <Typography variant="caption" color="text.secondary">
            {displayText} ({selectedCount} cards)
          </Typography>
        </Box>
        <IconButton size="small">
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <FormControl component="fieldset" fullWidth sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <Button size="small" onClick={handleClearAll} disabled={selectedStores.length === 0}>
              Clear
            </Button>
          </Box>

          <FormGroup>
            {stores.map((store) => {
              const isSelected = selectedStores.length > 0 && selectedStores.includes(store.displayName);
              return (
                <FormControlLabel
                  key={store.id}
                  control={
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleToggleStore(store.displayName)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">{store.displayName}</Typography>
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
                        {store.cardCount}
                      </Typography>
                    </Box>
                  }
                />
              );
            })}
          </FormGroup>
        </FormControl>
      </Collapse>
    </Box>
  );
}
