import { useCallback, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Box,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemText,
  IconButton,
  Divider,
  Typography,
} from '@mui/material'
import Delete from '@mui/icons-material/Delete'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { deleteList, getLists, type ListSummary } from '@/api/lists'

export function SavedDecklistsMenu() {
  const navigate = useNavigate()
  const [lists, setLists] = useState<ListSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingListId, setDeletingListId] = useState<string | null>(null)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const loadLists = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await getLists(signal)
      if (!signal?.aborted) {
        setLists(response.lists)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Unable to load saved lists'
      setError(message)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadLists(controller.signal)
    return () => controller.abort()
  }, [loadLists])

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
    void loadLists()
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleSelectList = (listId: string) => {
    navigate({
      to: '/list/$listName',
      params: { listName: listId },
      search: { page: undefined, name: undefined },
    })
    handleClose()
  }

  const handleDeleteList = async (event: MouseEvent, listId: string) => {
    event.stopPropagation()
    setDeletingListId(listId)
    setError(null)
    try {
      await deleteList(listId)
      setLists((prev) => prev.filter((list) => list.id !== listId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete list'
      setError(message)
    } finally {
      setDeletingListId(null)
    }
  }

  if (!loading && lists.length === 0 && !error) {
    return null
  }

  return (
    <>
      <Button
        variant="outlined"
        onClick={handleClick}
        disabled={loading && lists.length === 0}
        endIcon={loading && lists.length === 0 ? <CircularProgress size={16} /> : <ExpandMore />}
        sx={{
          textTransform: 'none',
          '&:hover': {
            bgcolor: 'action.hover',
            borderColor: 'currentColor'
          }
        }}
      >
        Saved Lists{lists.length > 0 ? ` (${lists.length})` : ''}
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
        {error ? (
          <MenuItem disabled>
            <ListItemText
              primary="Unable to load lists"
              secondary={error}
              slotProps={{
                secondary: {
                  sx: { whiteSpace: 'normal' }
                }
              }}
            />
          </MenuItem>
        ) : loading && lists.length === 0 ? (
          <MenuItem disabled>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2">Loading lists...</Typography>
            </Box>
          </MenuItem>
        ) : lists.length === 0 ? (
          <MenuItem disabled>
            <ListItemText primary="No saved lists" />
          </MenuItem>
        ) : (
          lists.map((list) => (
            <MenuItem
              key={list.id}
              onClick={() => handleSelectList(list.id)}
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
                primary={list.name}
                secondary={`${list.cardCount} cards`}
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
              <IconButton
                className="action-button"
                size="small"
                disabled={deletingListId === list.id}
                onClick={(e) => void handleDeleteList(e, list.id)}
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
                {deletingListId === list.id ? <CircularProgress size={16} /> : <Delete fontSize="small" />}
              </IconButton>
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  )
}
