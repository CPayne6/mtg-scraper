"use client"

import { Button } from "@chakra-ui/react"
import { parseFile, supportedFileTypes } from "../library.utils"
import { LibraryEntry } from "../library.types"
import { Popover } from "@/components/Popover"
import { Dropzone } from "@/components/Dropzone"
import { useContext, useState } from "react"
import { LibraryContext } from "@/context"

export const UploadLibrary = () => {

  const { setLibrary, addToLibrary } = useContext(LibraryContext)
  const [open, setOpen] = useState(false)

  const handleSetLibrary = () => {
    setLibrary({
      'sol ring': {
        name: 'Sol Ring',
        foil: false,
        scryfall_id: 'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad'
      }
    })
  }

  const handleClearLibrary = () => {
    setLibrary({})
  }

  const handleFileUpload = async (files: FileList | null ) => {
    if(!files){ return alert("Unable to read file") }

    const newEntries: LibraryEntry[] = []
    for(const file of files){
      if(!supportedFileTypes.includes(file.type as typeof supportedFileTypes[0])) {
        alert("Unsupported file type encountered: " + file.type)
        return
      }
      const entries = await parseFile(file)
      newEntries.push(...entries)
    }

    console.log(newEntries)
    addToLibrary(newEntries)
    alert("Uploaded file to library")
  }

  const closePopover = () => { setOpen(false) }
  const openPopover = () => { setOpen(true) }

  return <>
    <Button onClick={handleClearLibrary}>
      CLEAR LIBRARY
    </Button>
    <Popover
      open={open}
      onEscapeKeyDown={closePopover}
      onInteractOutside={closePopover}
      trigger={<Button onClick={openPopover}>ADD TO LIBRARY</Button>}
    >
      <Dropzone onFileUpload={handleFileUpload} />
    </Popover>
  </>
}
