import { useState } from 'react';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import FormGroup from '@mui/material/FormGroup';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Button from '@mui/material/Button';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { StoreInfo } from '@mtg-scraper/shared';

interface StoreFilterProps {
  stores: StoreInfo[];
  selectedStores: string[];
  onStoresChange: (storeNames: string[] | null) => void;
}

export function StoreFilter({ stores, selectedStores, onStoresChange }: StoreFilterProps) {
  const [expanded, setExpanded] = useState(true);

  const handleToggleStore = (storeName: string) => {
    const currentSelection = selectedStores || [];
    const isSelected = currentSelection.includes(storeName);

    if (isSelected) {
      // Remove from selection
      const newSelection = currentSelection.filter(s => s !== storeName);
      onStoresChange(newSelection.length > 0 ? newSelection : null);
    } else {
      // Add to selection
      onStoresChange([...currentSelection, storeName]);
    }
  };

  const handleSelectAll = () => {
    onStoresChange(null); // null means show all stores
  };

  const handleClearAll = () => {
    onStoresChange([]); // empty array means clear selection
  };

  const isAllSelected = !selectedStores || selectedStores.length === 0;
  const selectedCount = isAllSelected
    ? stores.reduce((sum, s) => sum + s.cardCount, 0)
    : stores
        .filter(s => selectedStores.includes(s.displayName))
        .reduce((sum, s) => sum + s.cardCount, 0);

  const displayText = isAllSelected
    ? 'All Stores'
    : `${selectedStores.length} store${selectedStores.length !== 1 ? 's' : ''}`;

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
            <Button size="small" onClick={handleSelectAll} disabled={isAllSelected}>
              All
            </Button>
            <Button size="small" onClick={handleClearAll} disabled={isAllSelected}>
              Clear
            </Button>
          </Box>

          <FormGroup>
            {stores.map((store) => {
              const isSelected = isAllSelected || selectedStores.includes(store.displayName);
              return (
                <FormControlLabel
                  key={store.id}
                  control={
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleToggleStore(store.displayName)}
                      disabled={isAllSelected}
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
