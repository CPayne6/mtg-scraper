"use client"

import Button from "@mui/material/Button"
import Popover from "@mui/material/Popover"
import { parseFile, supportedFileTypes } from "../library.utils"
import { LibraryEntry } from "../library.types"
import { Dropzone } from "@/components/Dropzone"
import { useContext, useState } from "react"
import { LibraryContext } from "@/context"

export const UploadLibrary = () => {

  const { setLibrary, addToLibrary } = useContext(LibraryContext)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

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

    addToLibrary(newEntries)
    alert("Uploaded file to library")
    setAnchorEl(null)
  }

  return (
    <>
      <Button onClick={handleClearLibrary} variant="outlined">
        CLEAR LIBRARY
      </Button>
      <Button onClick={(e) => setAnchorEl(e.currentTarget)} variant="contained">
        ADD TO LIBRARY
      </Button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
      >
        <Dropzone onFileUpload={handleFileUpload} />
      </Popover>
    </>
  )
}
