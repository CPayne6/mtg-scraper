import { useRef, useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Popover from '@mui/material/Popover';
import type { BuilderFilterBarProps } from './BuilderFilterBar.types';
import { CONDITION_LABELS, CONDITION_TOOLTIPS } from './BuilderFilterBar.utils';
import {
  containerSx,
  innerSx,
  sectionLabelSx,
  conditionLabelSx,
  toggleAllChipSx,
  storeStripSx,
  emptyStoresHintSx,
  selectedChipSx,
  addBtnSx,
  popoverPaperSx,
  popoverHeadingSx,
  popoverOptionSx,
  popoverDotSx,
  dividerSx,
  conditionGroupSx,
  conditionChipSx,
} from './BuilderFilterBar.styles';

export function BuilderFilterBar({
  allStores,
  storeLabels,
  selectedStores,
  onToggleStore,
  onToggleAll,
  conditions,
  onToggleCondition,
}: BuilderFilterBarProps) {
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
    <Box sx={containerSx}>
      <Box sx={innerSx}>
        <Typography component="span" sx={sectionLabelSx}>
          Stores
        </Typography>

        {/* Toggle-all chip */}
        <Box
          component="button"
          type="button"
          onClick={onToggleAll}
          title={allOn ? 'Deselect all stores' : 'Select all stores'}
          sx={toggleAllChipSx(allOn)}
        >
          {allOn ? 'All on' : noneOn ? 'All off' : 'All'}
        </Box>

        {/* Scrollable selected-stores strip */}
        <Box role="list" sx={storeStripSx}>
          {selectedStores.length === 0 ? (
            <Typography component="span" sx={emptyStoresHintSx}>
              No stores selected — pick one to start scouting.
            </Typography>
          ) : (
            allStores
              .filter((s) => selectedStores.includes(s))
              .map((s) => (
                <Box
                  key={s}
                  component="button"
                  type="button"
                  role="listitem"
                  onClick={() => onToggleStore(s)}
                  title={`Remove ${labelFor(s)}`}
                  aria-label={`Remove ${labelFor(s)}`}
                  sx={selectedChipSx}
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
              type="button"
              ref={addBtnRef}
              onClick={() => setAddOpen((o) => !o)}
              title="Add a store"
              aria-expanded={addOpen}
              sx={addBtnSx}
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
                paper: { sx: popoverPaperSx },
              }}
            >
              <Typography component="h6" sx={popoverHeadingSx}>
                Add store
              </Typography>
              {unselected.map((s) => (
                <Box
                  key={s}
                  component="button"
                  type="button"
                  onClick={() => onToggleStore(s)}
                  sx={popoverOptionSx}
                >
                  <Box component="span" sx={popoverDotSx} />
                  <span>{labelFor(s)}</span>
                </Box>
              ))}
            </Popover>
          </>
        )}

        {/* Vertical divider between Stores and Condition. */}
        <Box aria-hidden="true" sx={dividerSx} />

        <Typography component="span" sx={conditionLabelSx}>
          Condition
        </Typography>

        {/* Segmented control */}
        <Box role="group" aria-label="Condition filter" sx={conditionGroupSx}>
          {CONDITION_LABELS.map((c) => {
            const on = conditions.includes(c);
            return (
              <Box
                key={c}
                component="button"
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggleCondition(c)}
                title={CONDITION_TOOLTIPS[c]}
                sx={conditionChipSx(on)}
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
