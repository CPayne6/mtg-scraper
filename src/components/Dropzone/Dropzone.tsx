import { Box, FileUpload, Icon } from '@chakra-ui/react'
import { ChangeEventHandler } from 'react'
import { BsUpload } from 'react-icons/bs'

interface DropzoneProps {
  onFileUpload: (files: FileList | null) => void;
  maxFileCount?: number;
}

export function Dropzone({ 
  onFileUpload, 
  maxFileCount = 1
 }: DropzoneProps) {

  const handleFileUpload: ChangeEventHandler<HTMLInputElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const fileContent = e.target.files
    onFileUpload(fileContent)
  }

  return (
    <FileUpload.Root maxW="xl" alignItems="stretch" maxFiles={maxFileCount} >
      <FileUpload.HiddenInput onChange={handleFileUpload} />
      <FileUpload.Dropzone cursor="pointer">
        <Icon size="md" color="fg.muted" pointerEvents="none" >
          <BsUpload />
        </Icon>
        <FileUpload.DropzoneContent pointerEvents="none">
          <Box>Drag and drop manabox file here (more to be supported soon)</Box>
          <Box color="fg.muted" >.csv and .txt</Box>
        </FileUpload.DropzoneContent>
      </FileUpload.Dropzone>
    </FileUpload.Root>
  )
}