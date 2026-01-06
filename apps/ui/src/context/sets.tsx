import type { Set } from '@scoutlgs/shared'
import React from 'react'

interface SetsContext {
  sets: Set[];
  loading: boolean;
  error: string | null;
  getSetByCode: (code: string) => Set | undefined;
  getSetName: (code: string) => string;
}

export const SetsContext = React.createContext<SetsContext>({
  sets: [],
  loading: true,
  error: null,
  getSetByCode: () => undefined,
  getSetName: (code: string) => code
})

const loadSets = async (): Promise<Set[]> => {
  const response = await fetch('https://api.scryfall.com/sets')
  const data: unknown = await response.json()
  return (data as { data: Set[] }).data
}

export const SetsProvider = (props: { children: React.ReactNode }) => {
  const [sets, setSets] = React.useState<Set[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const fetchSets = async () => {
      try {
        setLoading(true)
        const data = await loadSets()
        setSets(data)
        setError(null)
      } catch (err) {
        console.error('Failed to load MTG sets:', err)
        setError(err instanceof Error ? err.message : 'Failed to load sets')
      } finally {
        setLoading(false)
      }
    }

    fetchSets()
  }, [])

  const getSetByCode = React.useCallback((code: string): Set | undefined => {
    return sets.find(set =>
      set.code.toLowerCase() === code.toLowerCase()
    )
  }, [sets])

  const getSetName = React.useCallback((code: string): string => {
    const set = getSetByCode(code)
    return set?.name || code
  }, [getSetByCode])

  const contextValue = React.useMemo(
    () => ({ sets, loading, error, getSetByCode, getSetName }),
    [sets, loading, error, getSetByCode, getSetName]
  )

  return <SetsContext.Provider value={contextValue}>
    {props.children}
  </SetsContext.Provider>
}

export const useSets = () => {
  const context = React.useContext(SetsContext)
  if (!context) {
    throw new Error('useSets must be used within a SetsProvider')
  }
  return context
}
