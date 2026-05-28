import { useMemo, useState, type MouseEvent } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { useNavigate } from '@tanstack/react-router';
import { useLists } from '@/components/lists/ListsContext';

export function SavedListsMenu() {
  const navigate = useNavigate();
  const { lists, names, count, rename, remove } = useLists();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const open = Boolean(anchor);

  const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);
  const handleClose = () => setAnchor(null);

  const startEdit = (e: MouseEvent<HTMLElement>, name: string) => {
    e.stopPropagation();
    setEditing(name);
    setDraft(name);
    setAnchor(null);
  };

  const handleDelete = (e: MouseEvent<HTMLElement>, name: string) => {
    e.stopPropagation();
    remove(name);
  };

  const cleaned = useMemo(() => draft.replace(/\W/g, ''), [draft]);
  const canSave =
    editing != null &&
    cleaned.length > 0 &&
    cleaned !== editing &&
    !lists[cleaned];

  const handleSave = () => {
    if (!editing || !canSave) return;
    rename(editing, draft);
    setEditing(null);
  };

  const handleOpenList = (name: string) => {
    setAnchor(null);
    navigate({ to: '/list/$listName', params: { listName: name } });
  };

  if (count === 0) return null;

  return (
    <>
      <Button
        variant="outlined"
        color="primary"
        onClick={handleOpen}
        endIcon={<KeyboardArrowDown />}
        sx={{ fontSize: 14 }}
      >
        Saved Lists ({count})
      </Button>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={handleClose}
        slotProps={{ paper: { sx: { minWidth: 260, maxWidth: 350, maxHeight: 400 } } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ px: 2, py: 1, fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          Saved Decklists
        </Box>
        <Box sx={{ height: '1px', bgcolor: 'divider' }} />
        {names.slice(0, 8).map((n) => (
          <MenuItem
            key={n}
            onClick={() => handleOpenList(n)}
            sx={{
              py: 1.25,
              px: 1.75,
              '&:hover .row-actions': { opacity: 1 },
            }}
          >
            <Stack direction="row" sx={{ flex: 1, alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontWeight: 500,
                    fontSize: 14,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {n}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  {lists[n].length} cards
                </Typography>
              </Box>
              <Stack
                direction="row"
                className="row-actions"
                sx={{ gap: 0.25, opacity: 0, transition: 'opacity 200ms' }}
              >
                <Tooltip title="Rename">
                  <IconButton
                    size="small"
                    aria-label={`Rename ${n}`}
                    onClick={(e) => startEdit(e, n)}
                    sx={{ width: 28, height: 28 }}
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    aria-label={`Delete ${n}`}
                    onClick={(e) => handleDelete(e, n)}
                    sx={{
                      width: 28,
                      height: 28,
                      '&:hover': { color: 'error.main', bgcolor: 'rgba(244,67,54,0.08)' },
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={editing != null} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>Rename Decklist</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Decklist name"
            fullWidth
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) handleSave();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="primary" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button variant="contained" color="primary" disabled={!canSave} onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
