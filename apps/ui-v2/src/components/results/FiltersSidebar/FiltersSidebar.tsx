import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { ChevronLeft } from '@mui/icons-material';
import { FilterAlt } from '@mui/icons-material';
import type { FiltersSidebarProps } from './FiltersSidebar.types';
import { CONDITIONS } from './FiltersSidebar.utils';
import {
  collapsedBtnSx,
  collapsedBadgeSx,
  expandedBtnSx,
  filtersHeadingSx,
  conditionGroupSx,
  conditionBtnSx,
  storeLabelSx,
  checkboxSx,
} from './FiltersSidebar.styles';

function SidebarHeading({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: 12,
        fontWeight: 600,
        color: 'text.secondary',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        mb: 1.25,
      }}
    >
      {children}
    </Typography>
  );
}

export function FiltersSidebar({
  stores,
  selectedStores,
  onToggleStore,
  conditions,
  onToggleCondition,
  collapsed,
  onToggleCollapsed,
  storeCounts,
  maxPrice,
  onMaxPriceChange,
}: FiltersSidebarProps) {
  if (collapsed) {
    const storeFilterCount =
      selectedStores.length > 0 && selectedStores.length < stores.length ? selectedStores.length : 0;
    const activeCount = storeFilterCount + conditions.length + (maxPrice.trim() ? 1 : 0);
    return (
      <Box component="aside" sx={{ display: 'flex', flexDirection: 'column' }}>
        <Tooltip title="Show filters">
          <IconButton
            onClick={onToggleCollapsed}
            aria-label="Show filters"
            sx={collapsedBtnSx}
          >
            <FilterAlt sx={{ fontSize: 18 }} />
            {activeCount > 0 && <Box sx={collapsedBadgeSx}>{activeCount}</Box>}
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box component="aside" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: -1 }}>
        <Tooltip title="Hide filters">
          <IconButton
            onClick={onToggleCollapsed}
            aria-label="Hide filters"
            sx={expandedBtnSx}
          >
            <ChevronLeft sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Typography sx={filtersHeadingSx}>Filters</Typography>
      </Stack>

      <Box>
        <SidebarHeading>Condition</SidebarHeading>
        <Box sx={conditionGroupSx}>
          {CONDITIONS.map((c, i) => {
            const on = conditions.includes(c);
            return (
              <Box
                key={c}
                component="button"
                type="button"
                onClick={() => onToggleCondition(c)}
                aria-checked={on}
                role="checkbox"
                sx={conditionBtnSx(on, i === 0)}
              >
                {c}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box>
        <SidebarHeading>Stores</SidebarHeading>
        <Stack spacing={0.75}>
          {stores.map((s) => {
            const checked = selectedStores.includes(s.name);
            const count = storeCounts?.[s.name] ?? s.cardCount ?? 0;
            return (
              <Box key={s.name} component="label" sx={storeLabelSx}>
                <Box
                  component="input"
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleStore(s.name)}
                  sx={checkboxSx}
                />
                <Box component="span">{s.displayName ?? s.name}</Box>
                <Box
                  component="span"
                  sx={{
                    ml: 'auto',
                    fontSize: 12,
                    color: 'text.secondary',
                    fontFamily: '"JetBrains Mono", Menlo, monospace',
                  }}
                >
                  {count}
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Box>

      <Box>
        <SidebarHeading>Max price</SidebarHeading>
        <TextField
          fullWidth
          size="small"
          placeholder="e.g. 50"
          helperText="Optional - CAD"
          value={maxPrice}
          onChange={(event) => onMaxPriceChange(event.target.value)}
          inputMode="decimal"
          slotProps={{
            htmlInput: {
              'aria-label': 'Maximum price in Canadian dollars',
            },
          }}
        />
      </Box>
    </Box>
  );
}
