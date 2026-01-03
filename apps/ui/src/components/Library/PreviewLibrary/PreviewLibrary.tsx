"use client"

import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import IconButton from "@mui/material/IconButton"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Tooltip from "@mui/material/Tooltip"
import { useContext, useMemo, useState } from "react"
import { formatStorageName } from "../library.utils"
import { BsClipboard2CheckFill, BsClipboard2X, BsThreeDotsVertical } from 'react-icons/bs'
import { LibraryEntry, } from "../library.types"
import { Image } from '@/components'
import { LibraryContext } from "@/context"

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
      <Stack direction="row" spacing={0} justifyContent="center">
        <Tooltip title={!!item ? "Card is in your collection" : "Card not in collection"}>
          <IconButton
            size="large"
            onMouseEnter={() => setShowImage(true)}
            onMouseLeave={() => setShowImage(false)}
            sx={{ color: !!item ? 'black' : 'grey.500' }}
          >
            {!!item ? <BsClipboard2CheckFill /> : <BsClipboard2X />}
          </IconButton>
        </Tooltip>
        <IconButton
          disabled={!item}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
        >
          <BsThreeDotsVertical />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem onClick={handleRemoveFromLibrary}>Delete</MenuItem>
        </Menu>
      </Stack>
      <Box
        sx={{
          width: '200px',
          position: 'absolute',
          top: '110%',
          right: '100%',
          zIndex: 10
        }}
      >
        <Image
          src={formatScryfallImage(name, item)}
          hidden={item === undefined || !showImage}
        />
      </Box>
    </Box>
  )
}
