import { useRef, useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Popover from '@mui/material/Popover';

type Props = {
  // Store slugs (e.g. "face-to-face-games"), not displayNames.
  allStores: string[];
  // slug -> human label, used for rendering only.
  storeLabels: Record<string, string>;
  selectedStores: string[];
  onToggleStore: (name: string) => void;
  onToggleAll: () => void;
  conditions: string[];
  onToggleCondition: (c: string) => void;
};

const CONDITION_LABELS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const CONDITION_TOOLTIPS: Record<string, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

export function BuilderFilterBar({
  allStores,
  storeLabels,
  selectedStores,
  onToggleStore,
  onToggleAll,
  conditions,
  onToggleCondition,
}: Props) {
  const labelFor = (slug: string) => storeLabels[slug] ?? slug;
  const allOn = selectedStores.length === allStores.length && allStores.length > 0;
  const noneOn = selectedStores.length === 0;
  const unselected = allStores.filter((s) => !selectedStores.includes(s));

  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // If user removes all stores and then re-adds them, close popover if nothing remains.
  useEffect(() => {
    if (unselected.length === 0) setAddOpen(false);
  }, [unselected.length]);

  return (
    <Box
      sx={(theme) => ({
        bgcolor: 'background.paper',
        borderBottom: `1px solid ${theme.palette.divider}`,
        position: 'sticky',
        top: 64,
        zIndex: 40,
        boxShadow: theme.shadows[1],
      })}
    >
      <Box
        sx={{
          maxWidth: 1600,
          mx: 'auto',
          px: '20px',
          py: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'text.secondary',
            mr: '4px',
          }}
        >
          Stores
        </Typography>

        {/* Toggle-all chip */}
        <Box
          component="button"
          onClick={onToggleAll}
          title={allOn ? 'Deselect all stores' : 'Select all stores'}
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 999,
            border: `1px solid ${allOn ? theme.palette.primary.main : theme.palette.divider}`,
            background: allOn ? theme.palette.primary.main : theme.palette.background.paper,
            color: allOn ? '#fff' : theme.palette.text.secondary,
            fontFamily: 'inherit',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            flexShrink: 0,
            transition:
              'background 120ms cubic-bezier(0.4, 0, 0.2, 1), color 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background: allOn
                ? theme.palette.primary.main
                : theme.palette.mode === 'dark'
                  ? 'rgba(36,135,33,0.16)'
                  : 'rgba(74,103,65,0.08)',
              color: allOn ? '#fff' : theme.palette.text.primary,
            },
          })}
        >
          {allOn ? 'All on' : noneOn ? 'All off' : 'All'}
        </Box>

        {/* Scrollable selected-stores strip */}
        <Box
          role="list"
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: 1,
            minWidth: 0,
            overflowX: 'auto',
            overflowY: 'visible',
            padding: '4px 2px',
            scrollbarWidth: 'thin',
            scrollbarColor: `${theme.palette.divider} transparent`,
            '&::-webkit-scrollbar': { height: 6 },
            '&::-webkit-scrollbar-thumb': {
              background: theme.palette.divider,
              borderRadius: 99,
            },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
          })}
        >
          {selectedStores.length === 0 ? (
            <Typography
              component="span"
              sx={{
                fontSize: '12px',
                color: 'text.secondary',
                px: '6px',
                fontStyle: 'italic',
              }}
            >
              No stores selected — pick one to start scouting.
            </Typography>
          ) : (
            allStores
              .filter((s) => selectedStores.includes(s))
              .map((s) => (
                <Box
                  key={s}
                  component="button"
                  role="listitem"
                  onClick={() => onToggleStore(s)}
                  title={`Remove ${labelFor(s)}`}
                  aria-label={`Remove ${labelFor(s)}`}
                  sx={(theme) => ({
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 11px',
                    borderRadius: 999,
                    border: `1px solid ${theme.palette.primary.main}`,
                    background: theme.palette.primary.main,
                    color: '#fff',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition:
                      'background 120ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms cubic-bezier(0.4, 0, 0.2, 1)',
                    '& .chip-dot': {
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#fff',
                      border: '1.5px solid #fff',
                      flexShrink: 0,
                    },
                    '& .chip-x': {
                      ml: '2px',
                      opacity: 0.7,
                      fontSize: '13px',
                      lineHeight: 1,
                      fontWeight: 700,
                    },
                    '&:hover .chip-x': { opacity: 1 },
                  })}
                >
                  <Box component="span" className="chip-dot" aria-hidden="true" />
                  <Box component="span">{labelFor(s)}</Box>
                  <Box component="span" className="chip-x" aria-hidden="true">
                    {'×'}
                  </Box>
                </Box>
              ))
          )}
        </Box>

        {/* + Add unselected stores */}
        {unselected.length > 0 && (
          <>
            <Box
              component="button"
              ref={addBtnRef}
              onClick={() => setAddOpen((o) => !o)}
              title="Add a store"
              aria-expanded={addOpen}
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 11px',
                borderRadius: 999,
                border: `1px dashed ${
                  theme.palette.mode === 'dark'
                    ? 'rgba(36,135,33,0.45)'
                    : 'rgba(74,103,65,0.3)'
                }`,
                background: theme.palette.background.paper,
                color: theme.palette.primary.main,
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
                transition:
                  'background 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
                '& > span:first-of-type': {
                  fontSize: '14px',
                  fontWeight: 700,
                  lineHeight: 1,
                },
                '&:hover': {
                  background:
                    theme.palette.mode === 'dark'
                      ? 'rgba(36,135,33,0.12)'
                      : 'rgba(74,103,65,0.08)',
                  borderColor: theme.palette.primary.main,
                },
              })}
            >
              <span aria-hidden="true">+</span>
              <span>Add</span>
            </Box>
            <Popover
              open={addOpen}
              anchorEl={addBtnRef.current}
              onClose={() => setAddOpen(false)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: (theme) => ({
                    minWidth: 240,
                    bgcolor: 'background.paper',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: '12px',
                    boxShadow: theme.shadows[6],
                    p: '12px',
                    mt: '8px',
                  }),
                },
              }}
            >
              <Typography
                component="h6"
                sx={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'text.secondary',
                  m: 0,
                  mb: '8px',
                }}
              >
                Add store
              </Typography>
              {unselected.map((s) => (
                <Box
                  key={s}
                  component="button"
                  onClick={() => onToggleStore(s)}
                  sx={(theme) => ({
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '7px 8px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: theme.palette.text.primary,
                    background: 'transparent',
                    border: 0,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    '&:hover': { background: theme.palette.background.default },
                  })}
                >
                  <Box
                    component="span"
                    sx={(theme) => ({
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: theme.palette.primary.main,
                      opacity: 0.18,
                    })}
                  />
                  <span>{labelFor(s)}</span>
                </Box>
              ))}
            </Popover>
          </>
        )}

        {/* Vertical divider between Stores and Condition. width must be '1px';
            sx={{ width: 1 }} would resolve to 100% and render a full-width bar
            when the flex row wraps to a new line. */}
        <Box
          aria-hidden="true"
          sx={(theme) => ({
            display: 'inline-block',
            width: '1px',
            alignSelf: 'stretch',
            background: theme.palette.divider,
            mx: '4px',
            minHeight: 24,
            flexShrink: 0,
          })}
        />

        <Typography
          component="span"
          sx={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'text.secondary',
          }}
        >
          Condition
        </Typography>

        {/* Segmented control */}
        <Box
          role="group"
          aria-label="Condition filter"
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            background: theme.palette.background.default,
            padding: '3px',
            borderRadius: 999,
            flexShrink: 0,
          })}
        >
          {CONDITION_LABELS.map((c) => {
            const on = conditions.includes(c);
            return (
              <Box
                key={c}
                component="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggleCondition(c)}
                title={CONDITION_TOOLTIPS[c]}
                sx={(theme) => ({
                  minWidth: 36,
                  padding: '6px 12px',
                  border: 0,
                  background: on
                    ? theme.palette.mode === 'dark'
                      ? '#248721'
                      : theme.palette.primary.main
                    : 'transparent',
                  color: on ? '#fff' : theme.palette.text.secondary,
                  fontWeight: 600,
                  fontSize: '11px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition:
                    'background 120ms cubic-bezier(0.4, 0, 0.2, 1), color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': { color: on ? '#fff' : theme.palette.text.primary },
                })}
              >
                {c}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
