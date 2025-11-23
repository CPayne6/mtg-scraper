"use client"

import { LibraryEntry, LibraryStorage } from '@/components'
import { formatStorageName, LIBRARY_KEY } from '@/components/Library/library.utils';
import { useLocalStorage } from '@/hooks';
import React from 'react'

interface LibraryContext {
  library: LibraryStorage;
  setLibrary: (library: LibraryStorage) => void;
  addToLibrary: (items: LibraryEntry | LibraryEntry[]) => void;
}

export const LibraryContext = React.createContext<LibraryContext>({
  library: {},
  setLibrary: () => console.warn('setLibrary not set in context'),
  addToLibrary: () => console.warn('addToLibrary not set in context')
})

export const LibraryProvider = (props: { children: React.ReactNode }) => {
  const [library, setLibrary] = useLocalStorage<LibraryStorage>(LIBRARY_KEY, {})

  const addToLibrary = (items: LibraryEntry | LibraryEntry[]) => {
    if (Array.isArray(items)) {
      setLibrary(
        items.reduce(
          (prev, curr) => ({ ...prev, [formatStorageName(curr.name)]: curr }),
          { ...library }
        )
      )
      return
    }
    setLibrary({ ...library, [formatStorageName(items.name)]: items })
  }

  return <LibraryContext.Provider value={{ library, setLibrary, addToLibrary }}>
    {props.children}
  </LibraryContext.Provider>
}
