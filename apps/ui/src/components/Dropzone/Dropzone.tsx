import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import { useDropzone } from 'react-dropzone'
import { BsUpload } from 'react-icons/bs'

interface DropzoneProps {
  onFileUpload: (files: FileList | null) => void;
  maxFileCount?: number;
}

export function Dropzone({
  onFileUpload,
  maxFileCount = 1
 }: DropzoneProps) {

  const onDrop = (acceptedFiles: File[]) => {
    // Convert File[] to FileList-like object
    const dataTransfer = new DataTransfer()
    acceptedFiles.forEach(file => dataTransfer.items.add(file))
    onFileUpload(dataTransfer.files)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: maxFileCount,
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt']
    }
  })

  return (
    <Paper
      {...getRootProps()}
      sx={{
        maxWidth: '600px',
        p: 4,
        border: '2px dashed',
        borderColor: isDragActive ? 'primary.main' : 'grey.400',
        bgcolor: isDragActive ? 'action.hover' : 'background.paper',
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover'
        }
      }}
      elevation={0}
    >
      <input {...getInputProps()} />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <BsUpload size={32} style={{ color: 'inherit', opacity: 0.6 }} />
        <Typography variant="body1">
          Drag and drop manabox file here (more to be supported soon)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          .csv and .txt
        </Typography>
      </Box>
    </Paper>
  )
}