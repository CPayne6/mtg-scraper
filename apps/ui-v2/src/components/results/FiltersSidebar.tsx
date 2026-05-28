import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import FilterAlt from '@mui/icons-material/FilterAlt';
import type { StoreInfo } from '@scoutlgs/shared';

type Props = {
  stores: StoreInfo[];
  selectedStores: string[];
  onToggleStore: (name: string) => void;
  conditions: string[];
  onToggleCondition: (cond: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  storeCounts?: Record<string, number>;
};

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

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
}: Props) {
  if (collapsed) {
    const activeCount = selectedStores.length + conditions.length;
    return (
      <Box component="aside" sx={{ display: 'flex', flexDirection: 'column' }}>
        <Tooltip title="Show filters">
          <IconButton
            onClick={onToggleCollapsed}
            aria-label="Show filters"
            sx={(theme) => ({
              position: 'relative',
              width: 40,
              height: 40,
              borderRadius: '10px',
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
              color: 'text.secondary',
              '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
            })}
          >
            <FilterAlt sx={{ fontSize: 18 }} />
            {activeCount > 0 && (
              <Box
                sx={(theme) => ({
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  px: '5px',
                  borderRadius: '999px',
                  bgcolor: theme.palette.honey.main,
                  color: '#fff',
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `2px solid ${theme.palette.background.paper}`,
                })}
              >
                {activeCount}
              </Box>
            )}
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
            sx={(theme) => ({
              width: 40,
              height: 40,
              borderRadius: '10px',
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
              color: 'text.secondary',
              '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
            })}
          >
            <ChevronLeft sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'text.secondary',
          }}
        >
          Filters
        </Typography>
      </Stack>

      <Box>
        <SidebarHeading>Condition</SidebarHeading>
        <Box
          sx={(theme) => ({
            display: 'inline-flex',
            width: '100%',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            overflow: 'hidden',
          })}
        >
          {CONDITIONS.map((c, i) => {
            const on = conditions.includes(c);
            return (
              <Box
                key={c}
                component="button"
                onClick={() => onToggleCondition(c)}
                aria-checked={on}
                role="checkbox"
                sx={(theme) => ({
                  flex: 1,
                  border: 0,
                  borderLeft:
                    i > 0 ? `1px solid ${theme.palette.divider}` : 'none',
                  bgcolor: on ? 'primary.main' : 'transparent',
                  color: on ? '#fff' : 'text.primary',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  cursor: 'pointer',
                  py: 0.75,
                  px: 0.5,
                  transition: 'background 200ms',
                  '&:hover': on
                    ? {}
                    : {
                        bgcolor:
                          theme.palette.mode === 'dark'
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(0,0,0,0.04)',
                      },
                })}
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
              <Box
                key={s.name}
                component="label"
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  px: 0.5,
                  py: 0.75,
                  fontSize: 14,
                  cursor: 'pointer',
                  borderRadius: 0.75,
                  '&:hover': {
                    bgcolor:
                      theme.palette.mode === 'dark'
                        ? 'rgba(255,255,255,0.04)'
                        : 'rgba(0,0,0,0.03)',
                  },
                })}
              >
                <Box
                  component="input"
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleStore(s.name)}
                  sx={(theme) => ({
                    accentColor: theme.palette.primary.main,
                    width: 16,
                    height: 16,
                  })}
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
        <TextField fullWidth size="small" placeholder="e.g. 50" helperText="Optional · CAD" />
      </Box>
    </Box>
  );
}
