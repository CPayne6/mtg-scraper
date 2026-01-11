import { useState } from 'react'
import { Box, Collapse, FormLabel, IconButton, Skeleton, Stack } from '@mui/material'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'

const STORAGE_KEY = 'store-filter-expanded';

export function StoreFilterSkeleton() {
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
        onClick={handleToggleExpanded}
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
          <Skeleton variant="text" width={120} height={20} />
        </Box>
        <IconButton size="small">
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 2 }}>
          <Skeleton variant="rectangular" width="100%" height={32} sx={{ mb: 1, borderRadius: 1 }} />
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Skeleton variant="text" width="100%" height={40} />
            <Skeleton variant="text" width="100%" height={40} />
            <Skeleton variant="text" width="100%" height={40} />
            <Skeleton variant="text" width="100%" height={40} />
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}
