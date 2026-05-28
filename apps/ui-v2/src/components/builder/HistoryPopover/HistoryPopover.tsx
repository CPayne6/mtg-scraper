import Box from '@mui/material/Box';
import Popper from '@mui/material/Popper';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Typography from '@mui/material/Typography';
import type { HistoryPopoverProps } from './HistoryPopover.types';
import { fmtAgo } from './HistoryPopover.utils';
import {
  dialogSx,
  headerSx,
  headingSx,
  emptySx,
  entryRowSx,
  entryDotSx,
  undoBtnSx,
} from './HistoryPopover.styles';

export function HistoryPopover({
  open,
  onClose,
  anchorEl,
  history,
  onUndo,
}: HistoryPopoverProps) {
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
        <Box role="dialog" aria-label="History" sx={dialogSx}>
          <Box sx={headerSx}>
            <Typography component="h6" sx={headingSx}>
              Recent activity
            </Typography>
          </Box>

          <Box sx={{ maxHeight: 320, overflowY: 'auto', padding: '4px' }}>
            {history.length === 0 ? (
              <Box sx={emptySx}>No changes yet.</Box>
            ) : (
              history.map((entry) => (
                <Box key={entry.id} sx={entryRowSx}>
                  <Box aria-hidden="true" sx={entryDotSx(entry.type === 'add')} />
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
                      <Box component="strong" sx={{ fontWeight: 600 }}>
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
                    type="button"
                    onClick={() => onUndo(entry.id)}
                    sx={undoBtnSx}
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
