import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Popper from '@mui/material/Popper';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import CircularProgress from '@mui/material/CircularProgress';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { fetchScryfallAutocomplete } from '@/api/cards';

type Props = {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  onAdd: (cardName: string) => void;
  existingNames: string[];
};

const MAX_RESULTS = 8;

function artUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(
    name,
  )}&format=image&version=art_crop`;
}

export function AddCardPopover({
  open,
  onClose,
  anchorEl,
  onAdd,
  existingNames,
}: Props) {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const existingSet = useMemo(
    () => new Set(existingNames.map((n) => n.toLowerCase())),
    [existingNames],
  );

  // Reset state and focus on open.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setMatches([]);
    setLoading(false);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced autocomplete.
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
        <Box
          role="dialog"
          aria-label="Add card to list"
          sx={(theme) => ({
            width: 320,
            bgcolor: 'background.paper',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
            boxShadow: theme.shadows[6],
            overflow: 'hidden',
          })}
        >
          {/* Search row */}
          <Box
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderBottom: `1px solid ${theme.palette.divider}`,
              color: 'text.secondary',
            })}
          >
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
              sx={{
                flex: 1,
                border: 0,
                background: 'transparent',
                color: 'text.primary',
                fontFamily: 'inherit',
                fontSize: '13px',
                outline: 'none',
                minWidth: 0,
              }}
            />
            {loading && <CircularProgress size={14} sx={{ flexShrink: 0 }} />}
          </Box>

          {/* Results list */}
          <Box
            role="listbox"
            sx={{
              maxHeight: 320,
              overflowY: 'auto',
              padding: '6px',
            }}
          >
            {matches.length === 0 ? (
              <Box
                sx={{
                  padding: '20px 12px',
                  textAlign: 'center',
                  fontSize: '12px',
                  color: 'text.secondary',
                }}
              >
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
                    role="option"
                    aria-selected={false}
                    disabled={already}
                    onClick={() => {
                      if (already) return;
                      onAdd(name);
                      onClose();
                    }}
                    sx={(theme) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 0,
                      borderRadius: '8px',
                      cursor: already ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      color: 'text.primary',
                      opacity: already ? 0.5 : 1,
                      transition: 'background 120ms cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        background: already
                          ? 'transparent'
                          : theme.palette.background.default,
                      },
                    })}
                  >
                    <Box
                      aria-hidden="true"
                      sx={(theme) => ({
                        width: 32,
                        height: 32,
                        borderRadius: '5px',
                        backgroundColor: theme.palette.background.default,
                        backgroundImage: `url("${artUrl(name)}")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        flexShrink: 0,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      })}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          fontSize: '13px',
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name}
                      </Box>
                      <Box
                        sx={{
                          fontSize: '11px',
                          color: 'text.secondary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {already ? 'Already in list' : 'Add to list'}
                      </Box>
                    </Box>
                    {already ? (
                      <Box
                        component="span"
                        sx={(theme) => ({
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'text.secondary',
                          background: theme.palette.background.default,
                          padding: '2px 6px',
                          borderRadius: '999px',
                          flexShrink: 0,
                        })}
                      >
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
