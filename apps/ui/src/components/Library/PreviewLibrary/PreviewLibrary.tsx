import { useContext, useMemo, useState } from "react"
import { Box, IconButton, Menu, MenuItem, Stack, Tooltip } from "@mui/material"
import AssignmentTurnedIn from '@mui/icons-material/AssignmentTurnedIn'
import AssignmentLate from '@mui/icons-material/AssignmentLate'
import MoreVert from '@mui/icons-material/MoreVert'
import { Image } from '@/components/Image'
import { LibraryContext } from "@/context"
import { formatStorageName } from "../library.utils"
import { LibraryEntry } from "../library.types"

function formatScryfallImage(name: string, item?: LibraryEntry) {
  const params = new URLSearchParams();
  params.set('format', 'image')
  if (item?.scryfall_id) {
    return `https://api.scryfall.com/cards/${item.scryfall_id}?${params.toString()}`
  }
  if (item?.set && item.card_number){
    return `https://api.scryfall.com/cards/${item.set}/${item.card_number}?${params.toString()}`
  }
  if (item?.set) {
    params.set('set', item.set)
  }
  params.set('fuzzy', name.toLocaleLowerCase());
  return `https://api.scryfall.com/cards/named?${params.toString()}`
}

interface PreviewLibraryProps {
  name: string
}

export const PreviewLibrary = ({ name }: PreviewLibraryProps) => {
  const [showImage, setShowImage] = useState(false)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const { library, setLibrary } = useContext(LibraryContext)
  const item = useMemo<LibraryEntry | undefined>(() => {
    const storageName = formatStorageName(name)
    return library[storageName]
  }, [name, library])

  const handleRemoveFromLibrary = () => {
    if(!item) {
      return
    }
    const { [formatStorageName(name)]: removed, ...newLibrary } = library
    setLibrary(newLibrary)
    setAnchorEl(null)
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Stack direction="row" spacing={0} justifyContent="center" alignItems="center">
        <Tooltip title={!!item ? "Card is in your collection" : "Card not in collection"} placement="top" enterDelay={500}>
          <Box
            onMouseEnter={() => setShowImage(true)}
            onMouseLeave={() => setShowImage(false)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 1,
              color: !!item ? 'success.main' : 'text.disabled',
            }}
          >
            {!!item ? <AssignmentTurnedIn /> : <AssignmentLate />}
          </Box>
        </Tooltip>
        <IconButton
          disabled={!item}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
        >
          <MoreVert />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem onClick={handleRemoveFromLibrary}>Delete</MenuItem>
        </Menu>
      </Stack>
      {item && showImage && (
        <Box
          sx={{
            width: '200px',
            position: 'absolute',
            top: '110%',
            right: { xs: 'auto', sm: '100%' },
            left: { xs: '50%', sm: 'auto' },
            transform: { xs: 'translateX(-50%)', sm: 'none' },
            zIndex: 10,
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: 3,
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Image
            src={formatScryfallImage(name, item)}
            style={{ borderRadius: '8px' }}
          />
        </Box>
      )}
    </Box>
  )
}
