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

  const addToLibrary = React.useCallback((items: LibraryEntry | LibraryEntry[]) => {
    if (Array.isArray(items)) {
      setLibrary((prev) =>
        items.reduce(
          (acc, curr) => ({ ...acc, [formatStorageName(curr.name)]: curr }),
          { ...prev }
        )
      )
      return
    }
    setLibrary((prev) => ({ ...prev, [formatStorageName(items.name)]: items }))
  }, [setLibrary])

  const contextValue = React.useMemo(
    () => ({ library, setLibrary, addToLibrary }),
    [library, setLibrary, addToLibrary]
  )

  return <LibraryContext.Provider value={contextValue}>
    {props.children}
  </LibraryContext.Provider>
}
