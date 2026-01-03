"use client"

import { ReactEventHandler, useState } from "react"
import Skeleton from '@mui/material/Skeleton'
import Box from '@mui/material/Box'

export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  hidden?: boolean;
}

export const Image = (props: ImageProps) => {
  const { hidden, onLoad, ...rest } = props
  const [loading, setLoading] = useState(true)

  const handleLoad: ReactEventHandler<HTMLImageElement> = (e) => {
    setLoading(false)
    onLoad?.(e)
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && !hidden && (
        <Skeleton
          variant="rectangular"
          width="100%"
          height="100%"
          sx={{ aspectRatio: '5/7' }}
        />
      )}
      <img
        {...rest}
        onLoad={handleLoad}
        style={{
          ...rest.style,
          display: loading || hidden ? 'none' : 'block',
          width: '100%',
          height: 'auto'
        }}
      />
    </Box>
  )
}
