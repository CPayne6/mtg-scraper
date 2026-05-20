import Box from '@mui/material/Box';
import Popper from '@mui/material/Popper';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Typography from '@mui/material/Typography';
import type { ListHistoryEntry } from '@/hooks/useListEditor';

type Props = {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  history: ListHistoryEntry[];
  onUndo: (id: string) => void;
};

function fmtAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function HistoryPopover({
  open,
  onClose,
  anchorEl,
  history,
  onUndo,
}: Props) {
  if (!open || !anchorEl) return null;

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
          aria-label="History"
          sx={(theme) => ({
            width: 300,
            bgcolor: 'background.paper',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
            boxShadow: theme.shadows[6],
            overflow: 'hidden',
          })}
        >
          <Box
            sx={(theme) => ({
              padding: '10px 12px',
              borderBottom: `1px solid ${theme.palette.divider}`,
            })}
          >
            <Typography
              component="h6"
              sx={{
                m: 0,
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'text.secondary',
              }}
            >
              Recent activity
            </Typography>
          </Box>

          <Box sx={{ maxHeight: 320, overflowY: 'auto', padding: '4px' }}>
            {history.length === 0 ? (
              <Box
                sx={{
                  padding: '20px 12px',
                  textAlign: 'center',
                  fontSize: '12px',
                  color: 'text.secondary',
                }}
              >
                No changes yet.
              </Box>
            ) : (
              history.map((entry) => (
                <Box
                  key={entry.id}
                  sx={(theme) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    transition:
                      'background 120ms cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      background: theme.palette.background.default,
                    },
                  })}
                >
                  <Box
                    aria-hidden="true"
                    sx={(theme) => ({
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background:
                        entry.type === 'add'
                          ? theme.palette.primary.main
                          : theme.palette.mode === 'dark'
                            ? theme.palette.honey.main
                            : theme.palette.honey.dark,
                    })}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        fontSize: '12px',
                        color: 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Box
                        component="strong"
                        sx={{ fontWeight: 600 }}
                      >
                        {entry.type === 'add' ? 'Added' : 'Removed'}
                      </Box>{' '}
                      {entry.cardName}
                    </Box>
                    <Box
                      sx={{
                        fontSize: '11px',
                        color: 'text.secondary',
                      }}
                    >
                      {fmtAgo(entry.at)}
                    </Box>
                  </Box>
                  <Box
                    component="button"
                    onClick={() => onUndo(entry.id)}
                    sx={(theme) => ({
                      padding: '4px 9px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.palette.divider}`,
                      background: theme.palette.background.paper,
                      color: 'text.primary',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      transition:
                        'background 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        background: theme.palette.background.default,
                        borderColor:
                          theme.palette.mode === 'dark'
                            ? 'rgba(36,135,33,0.5)'
                            : 'rgba(74,103,65,0.35)',
                      },
                    })}
                  >
                    Undo
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </Box>
      </ClickAwayListener>
    </Popper>
  );
}
