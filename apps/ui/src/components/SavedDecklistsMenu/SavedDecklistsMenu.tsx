import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Box,
  Button,
  Menu,
  MenuItem,
  ListItemText,
  IconButton,
  Divider,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import Delete from '@mui/icons-material/Delete'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Edit from '@mui/icons-material/Edit'
import { useLocalStorage } from '@/hooks'

export function SavedDecklistsMenu() {
  const navigate = useNavigate()
  const [listStorage, setListStorage] = useLocalStorage<Record<string, string[]>>('deck-lists', {})
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingList, setEditingList] = useState<string>('')
  const [newName, setNewName] = useState<string>('')
  const open = Boolean(anchorEl)

  const savedLists = Object.keys(listStorage)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleSelectList = (listName: string) => {
    navigate({ to: `/list/${listName}` })
    handleClose()
  }

  const handleDeleteList = (event: React.MouseEvent, listName: string) => {
    event.stopPropagation()
    const { [listName]: _, ...rest } = listStorage
    setListStorage(rest)
  }

  const handleEditClick = (event: React.MouseEvent, listName: string) => {
    event.stopPropagation()
    setEditingList(listName)
    setNewName(listName)
    setEditDialogOpen(true)
    handleClose()
  }

  const handleSaveEdit = () => {
    if (newName && newName !== editingList && newName.trim().length > 0) {
      const cleanedNewName = newName.replaceAll(/\W/g, '')
      if (cleanedNewName && !listStorage[cleanedNewName]) {
        const cards = listStorage[editingList]
        const { [editingList]: _, ...rest } = listStorage
        setListStorage({ ...rest, [cleanedNewName]: cards })
      }
    }
    setEditDialogOpen(false)
    setEditingList('')
    setNewName('')
  }

  const handleCancelEdit = () => {
    setEditDialogOpen(false)
    setEditingList('')
    setNewName('')
  }

  if (savedLists.length === 0) {
    return null
  }

  return (
    <>
      <Button
        variant="outlined"
        onClick={handleClick}
        endIcon={<ExpandMore />}
        sx={{
          textTransform: 'none',
          '&:hover': {
            bgcolor: 'action.hover',
            borderColor: 'currentColor'
          }
        }}
      >
        Saved Lists ({savedLists.length})
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        sx={{
          '& .MuiPaper-root': {
            minWidth: 250,
            maxWidth: 350,
            maxHeight: 400
          }
        }}
      >
        <Box sx={{ px: 2, py: 1, pb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Saved Decklists
          </Typography>
        </Box>
        <Divider />
        {savedLists.map((listName) => (
          <MenuItem
            key={listName}
            onClick={() => handleSelectList(listName)}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              py: 1.5,
              '&:hover .action-button': {
                opacity: 1
              }
            }}
          >
            <ListItemText
              primary={listName}
              secondary={`${listStorage[listName].length} cards`}
              slotProps={{
                primary: {
                  sx: {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500
                  },

                },
                secondary: {
                  sx: { fontSize: '0.75rem' }
                }
              }}
            />
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton
                className="action-button"
                size="small"
                onClick={(e) => handleEditClick(e, listName)}
                sx={{
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  color: 'text.secondary',
                  '&:hover': {
                    color: 'primary.main',
                    bgcolor: 'action.hover'
                  }
                }}
              >
                <Edit fontSize="small" />
              </IconButton>
              <IconButton
                className="action-button"
                size="small"
                onClick={(e) => handleDeleteList(e, listName)}
                sx={{
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  color: 'text.secondary',
                  '&:hover': {
                    color: 'error.main',
                    bgcolor: 'rgba(255, 0, 0, 0.08)'
                  }
                }}
              >
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          </MenuItem>
        ))}
      </Menu>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCancelEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Rename Decklist</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Decklist Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveEdit()
              }
            }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button
            onClick={handleCancelEdit}
            variant="outlined"
            sx={{
              '&:hover': {
                bgcolor: 'action.hover',
                borderColor: 'currentColor'
              }
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            variant="contained"
            disabled={!newName.trim() || newName === editingList}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
