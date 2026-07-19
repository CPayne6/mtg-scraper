import { useCallback, useState, type MouseEvent } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { KeyboardArrowDown } from '@mui/icons-material';
import { Edit as EditIcon } from '@mui/icons-material';
import { DeleteOutline as DeleteIcon } from '@mui/icons-material';
import { useNavigate } from '@tanstack/react-router';
import { useLists } from '@/components/lists/ListsContext';
import { useConfirm } from '@/components/feedback/ConfirmDialog';
import { slugifyName } from '@/utils/slugify';
import { ListRenameDialog } from '@/components/lists/ListRenameDialog';

export function SavedListsMenu() {
  const navigate = useNavigate();
  const { lists, count, remove } = useLists();
  const confirm = useConfirm();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const open = Boolean(anchor);

  const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);
  const handleClose = () => setAnchor(null);

  const startEdit = (e: MouseEvent<HTMLElement>, id: string, name: string) => {
    e.stopPropagation();
    setEditing({ id, name });
    setAnchor(null);
  };

  const handleDelete = useCallback(
    async (e: MouseEvent<HTMLElement>, id: string, name: string) => {
      e.stopPropagation();
      const ok = await confirm({
        title: `Delete ${name}?`,
        description: 'This removes the list from your account. This action cannot be undone.',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (ok) await remove(id);
    },
    [confirm, remove],
  );

  const handleOpenList = (id: string, name: string) => {
    setAnchor(null);
    navigate({
      to: '/list/$listId/$slug',
      params: { listId: id, slug: slugifyName(name) },
    });
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
        {lists.slice(0, 8).map((list) => (
          <MenuItem
            key={list.id}
            onClick={() => handleOpenList(list.id, list.name)}
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
                  {list.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  {list.cards.length} cards
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
                    aria-label={`Rename ${list.name}`}
                    onClick={(e) => startEdit(e, list.id, list.name)}
                    sx={{ width: 28, height: 28 }}
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    aria-label={`Delete ${list.name}`}
                    onClick={(e) => handleDelete(e, list.id, list.name)}
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

      <ListRenameDialog list={editing} open={editing != null} onClose={() => setEditing(null)} />
    </>
  );
}
