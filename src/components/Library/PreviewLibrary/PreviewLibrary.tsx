"use client"

import { Box, Flex, Icon, IconButton } from "@chakra-ui/react"
import { useContext, useMemo, useState } from "react"
import { formatStorageName } from "../library.utils"
import { BsClipboard2CheckFill, BsClipboard2X, BsThreeDotsVertical } from 'react-icons/bs'
import { LibraryEntry, } from "../library.types"
import { Image, Menu, MenuItem } from '@/components'
import { Tooltip } from "@/components/Tooltip"
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
  }

  return (
    <Box style={{ position: 'relative' }} >

      <Flex gap="-1" direction="row" justify="center">
        <Tooltip
          showArrow
          positioning={{ placement: "top" }}
          content={!!item ? "Card is in your collection" : "Card not in collection"}
        >
          <Icon
            size="2xl"
            onMouseEnter={() => setShowImage(true)}
            onMouseLeave={() => setShowImage(false)}
            color={!!item ? 'black' : 'gray'}
          >
            {!!item ? <BsClipboard2CheckFill /> : <BsClipboard2X />}
          </Icon>
        </Tooltip>
        <Menu trigger={<IconButton variant="plain" disabled={!item}><BsThreeDotsVertical /></IconButton>}>
          <MenuItem value="remove-from-library" onClick={handleRemoveFromLibrary}>Delete</MenuItem>
        </Menu>
      </Flex>
      <Box
        width="200px"
        position="absolute"
        top="110%"
        right="100%"
        zIndex={10}
      >
        <Image
          src={formatScryfallImage(name, item)}
          hidden={item === undefined || !showImage}
        />
      </Box>
    </Box>
  )
}
