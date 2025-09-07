"use client"

import { ReactEventHandler, useState } from "react"
import { Image as ChakraImage, ImageProps, Skeleton } from '@chakra-ui/react'

export const Image = (props: ImageProps) => {
  const [loading, setLoading] = useState(true)

  const onLoad: ReactEventHandler<HTMLImageElement> | undefined = (e) => {
    setLoading(false)
    props?.onLoad?.(e)
  }

  return <>
    <Skeleton hidden={!loading} />
    <ChakraImage {...props} hidden={loading} onLoad={onLoad} />
  </>
}
