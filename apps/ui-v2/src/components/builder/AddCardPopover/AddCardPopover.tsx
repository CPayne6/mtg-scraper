import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Popper from '@mui/material/Popper';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import CircularProgress from '@mui/material/CircularProgress';
import { Search as SearchIcon } from '@mui/icons-material';
import { Add as AddIcon } from '@mui/icons-material';
import { fetchScryfallAutocomplete } from '@/api/cards';
import type { AddCardPopoverProps } from './AddCardPopover.types';
import { MAX_RESULTS, artUrl } from './AddCardPopover.utils';
import {
  dialogSx,
  emptyResultsSx,
  inListBadgeSx,
  inputSx,
  optionRowSx,
  optionSubtitleSx,
  optionThumbSx,
  optionTitleSx,
  resultsListSx,
  searchRowSx,
} from './AddCardPopover.styles';

export function AddCardPopover({
  open,
  onClose,
  anchorEl,
  onAdd,
  existingNames,
}: AddCardPopoverProps) {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const existingSet = useMemo(
    () => new Set(existingNames.map((n) => n.toLowerCase())),
    [existingNames],
  );

  useEffect(() => {
    if (!open) return;
    setQ('');
    setMatches([]);
    setLoading(false);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (!trimmed) {
      setMatches([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetchScryfallAutocomplete(trimmed, controller.signal)
        .then((names) => {
          if (controller.signal.aborted) return;
          setMatches(names.slice(0, MAX_RESULTS));
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setMatches([]);
          setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, open]);

  if (!open || !anchorEl) return null;

  const firstAddable = matches.find((m) => !existingSet.has(m.toLowerCase()));

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom-end"
      modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
      sx={{ zIndex: 1300 }}
    >
      <ClickAwayListener onClickAway={onClose}>
        <Box role="dialog" aria-label="Add card to list" sx={dialogSx}>
          <Box sx={searchRowSx}>
            <SearchIcon sx={{ fontSize: 16, opacity: 0.6 }} />
            <Box
              component="input"
              ref={inputRef}
              value={q}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setQ(e.target.value)
              }
              placeholder="Search a card to add…"
              aria-label="Search cards"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                } else if (e.key === 'Enter' && firstAddable) {
                  e.preventDefault();
                  onAdd(firstAddable);
                  onClose();
                }
              }}
              sx={inputSx}
            />
            {loading && <CircularProgress size={14} sx={{ flexShrink: 0 }} />}
          </Box>

          <Box role="listbox" sx={resultsListSx}>
            {matches.length === 0 ? (
              <Box sx={emptyResultsSx}>
                {q.trim()
                  ? 'No matches in pool. Try a different name.'
                  : 'Start typing to search the Scryfall catalog.'}
              </Box>
            ) : (
              matches.map((name) => {
                const already = existingSet.has(name.toLowerCase());
                return (
                  <Box
                    key={name}
                    component="button"
                    type="button"
                    role="option"
                    aria-selected={false}
                    disabled={already}
                    onClick={() => {
                      if (already) return;
                      onAdd(name);
                      onClose();
                    }}
                    sx={optionRowSx(already)}
                  >
                    <Box aria-hidden="true" sx={optionThumbSx(name, artUrl)} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={optionTitleSx}>{name}</Box>
                      <Box sx={optionSubtitleSx}>
                        {already ? 'Already in list' : 'Add to list'}
                      </Box>
                    </Box>
                    {already ? (
                      <Box component="span" sx={inListBadgeSx}>
                        In list
                      </Box>
                    ) : (
                      <AddIcon sx={{ fontSize: 16, opacity: 0.5, flexShrink: 0 }} />
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        </Box>
      </ClickAwayListener>
    </Popper>
  );
}
