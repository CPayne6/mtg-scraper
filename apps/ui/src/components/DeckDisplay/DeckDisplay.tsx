import { CardSearchResponse } from "@scoutlgs/shared"
import { SetStateAction, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Box, Button, FormControl, MenuItem, Select, Stack, TextField, Typography } from "@mui/material"
import { CardList } from "../CardsList"
import { StoreFilter, StoreFilterSkeleton } from "../StoreFilter"
import { PreviewLibrary } from "../Library"
import { useLocalStorage } from "@/hooks"
import { toaster } from "../ui/toaster"

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface DataState {
  cardName: string;
  data: null | CardSearchResponse;
  loading: boolean;
  selectedStores: string[];
  error?: string;
}

const fetchCardData = async (name: string): Promise<CardSearchResponse> => {
  const response = await fetch(`${API_URL}/card/${encodeURIComponent(name)}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Card "${name}" not found`)
    }
    throw new Error(`Failed to fetch card: ${response.status}`)
  }
  return await response.json() as CardSearchResponse
}

interface DeckListProps {
  listName: string;
  pagination?: boolean;
}

export function DeckDisplay({ listName, pagination = true }: DeckListProps) {
  const navigate = useNavigate({ from: '/list/$listName' })
  const searchParams = useSearch({ from: '/list/$listName' })
  const page = Number(searchParams.page || 0)
  const [listStorage] = useLocalStorage<Record<string, string[]>>('deck-lists', {})
  const cardNames = listStorage[listName] ?? []
  const [cardIndex, setCardIndex] = useState((isNaN(page) || page > cardNames.length || page <= 1) ? 0 : page - 1)

  const [data, setDataState] = useState<DataState[]>(cardNames.map(name => ({
    cardName: name,
    loading: true,
    data: null,
    selectedStores: []
  })))

  // Track which cards are currently being fetched to prevent duplicate requests
  const fetchingRef = useRef<Set<number>>(new Set())

  const setDataStateByIndex = (index: number, data: SetStateAction<DataState>) => {
    setDataState((prev) =>
      prev.map(
        (prevData, idx) => idx !== index
          ? prevData
          : typeof data === 'function'
            ? data(prevData)
            : data
      )
    )
  }

  const fetchCardFromIndex = async (index: number) => {
    // Check if already fetching
    if (fetchingRef.current.has(index)) {
      return
    }

    // Check current state from data
    const cardState = data[index]
    if (!cardState || cardState.data !== null) {
      return
    }

    // Mark as fetching
    fetchingRef.current.add(index)

    // Mark as loading in state and clear old data
    setDataStateByIndex(index, (prev) => ({
      ...prev,
      loading: true,
      data: null
    }))

    try {
      // Fetch the card data
      const response = await fetchCardData(cardState.cardName)
      setDataStateByIndex(index, (prev) => ({
        ...prev,
        loading: false,
        data: response,
        selectedStores: []
      }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch card data'
      console.error(err)
      toaster.error({ title: errorMessage })
      setDataStateByIndex(index, (prev) => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))
    } finally {
      fetchingRef.current.delete(index)
    }
  }

  const preloadPage = (index: number) => {
    // Check if already fetching
    if (fetchingRef.current.has(index)) {
      return
    }

    // Bounds check will happen in fetchCardFromIndex
    fetchCardFromIndex(index)
  }

  const updatePage = (index: number) => {
    const cardName = cardNames[index] ?? 'Unknown'
    setCardIndex(index)
    navigate({
      search: (prev) => ({
        ...prev,
        page: (index + 1).toString(),
        name: cardName
      })
    })
    fetchCardFromIndex(index)
  }

  const onPageChange = (pageStr: string) => {
    const page = Math.max(Math.min(Number(pageStr), cardNames.length), 1)
    preloadPage(page - 2)
    preloadPage(page)
    updatePage(page - 1)
  }

  const onNextPage = () => {
    preloadPage(cardIndex + 2)
    updatePage(cardIndex + 1)
  }

  const onPreviousPage = () => {
    preloadPage(cardIndex - 2)
    updatePage(cardIndex - 1)
  }

  useEffect(() => {
    // Initialize the data before and after the page number
    fetchCardFromIndex(cardIndex)
    preloadPage(cardIndex + 1)
    preloadPage(cardIndex - 1)
  }, [])

  const currentCardData: DataState | undefined = data[cardIndex]
  const sortedCardNames = useMemo(() =>
    cardNames.map((name, index) => ({ label: name, value: (index + 1).toString() }))
      .sort((a, b) => a.label.toLocaleLowerCase().localeCompare(b.label.toLocaleLowerCase()))
    , [cardNames])

  // Filter cards by selected stores
  const filteredCards = useMemo(() => {
    if (!currentCardData?.data) return undefined

    const { selectedStores, data: cardData } = currentCardData

    // If no stores selected or all stores selected, return all cards
    if (selectedStores.length === 0 || selectedStores.length === (cardData.stores?.length ?? 0)) {
      return cardData.results
    }

    // Filter cards by selected stores
    return cardData.results.filter(card => selectedStores.includes(card.store))
  }, [currentCardData])

  // Handler for store filter changes
  const handleStoreFilterChange = (storeNames: string[]) => {
    setDataStateByIndex(cardIndex, (prev) => ({
      ...prev,
      selectedStores: storeNames
    }))
  }

  if (cardNames.length === 0) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        gap: 2
      }}>
        <Typography variant="h6" color="text.secondary">
          No cards found in this list
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The list appears to be empty
        </Typography>
      </Box>
    )
  }

  if (!currentCardData) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        py: 8
      }}>
        <Typography variant="h6" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, width: '100%' }}>
      {/* Left Sidebar - Filters */}
      <Box sx={{ width: { xs: '100%', md: '200px' }, flexShrink: 0 }}>
        <Stack spacing={2}>
          {currentCardData.loading || !currentCardData.data ? (
            <StoreFilterSkeleton />
          ) : (
            <StoreFilter
              stores={currentCardData.data.stores}
              selectedStores={currentCardData.selectedStores || []}
              onStoresChange={handleStoreFilterChange}
            />
          )}
        </Stack>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={{ xs: 2, md: 3 }}
            alignItems={{ xs: 'stretch', lg: 'center' }}
            justifyContent="space-between"
            sx={{
              mb: { xs: 3, md: 4 },
              p: { xs: 2, md: 3 },
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: 1
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h4"
                sx={{
                  fontSize: currentCardData.cardName.length > 40
                    ? { xs: '1.1rem', md: '1.4rem' }
                    : currentCardData.cardName.length > 25
                      ? { xs: '1.3rem', md: '1.7rem' }
                      : { xs: '1.5rem', md: '2rem' },
                  fontWeight: 600,
                  mb: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: 1.2,
                  minHeight: { xs: '1.8rem', md: '2.4rem' }
                }}
                title={currentCardData.cardName}
              >
                {currentCardData.cardName}
              </Typography>
              {currentCardData.loading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading price data...
                </Typography>
              ) : currentCardData.data?.priceStats ? (
                <Typography variant="body2" color="text.secondary">
                  {filteredCards?.length || 0} / {currentCardData.data.priceStats.count} results • ${currentCardData.data.priceStats.min.toFixed(2)} - ${currentCardData.data.priceStats.max.toFixed(2)}
                </Typography>
              ) : null}
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent="flex-end"
              sx={{ flexWrap: 'wrap' }}
            >
              {currentCardData.cardName && (
                <FormControl sx={{ minWidth: { xs: '100%', sm: 200 }, maxWidth: 300 }}>
                  <Select
                    value={(cardIndex + 1).toString()}
                    onChange={(e) => onPageChange(e.target.value)}
                    size="small"
                  >
                    {sortedCardNames.map((item) => (
                      <MenuItem key={item.value} value={item.value}>
                        {item.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              {pagination && (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    bgcolor: 'background.default',
                    borderRadius: 1,
                    px: 2,
                    py: 0.5
                  }}
                >
                  <Typography variant="body2">Page</Typography>
                  <TextField
                    type="number"
                    size="small"
                    value={cardIndex + 1}
                    onChange={(e) => onPageChange(e.target.value)}
                    inputProps={{ min: 1, max: cardNames.length }}
                    sx={{ width: '70px' }}
                  />
                  <Typography variant="body2">of {cardNames.length}</Typography>
                </Stack>
              )}
              <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                <Button
                  onClick={onPreviousPage}
                  disabled={cardIndex === 0}
                  variant="outlined"
                  size="small"
                  sx={{
                    flex: { xs: 1, sm: 0 },
                    minWidth: { sm: '85px' },
                    '&:hover': {
                      bgcolor: 'action.hover'
                    }
                  }}
                >
                  Previous
                </Button>
                <Button
                  onClick={onNextPage}
                  variant="outlined"
                  size="small"
                  disabled={cardIndex >= cardNames.length - 1}
                  sx={{
                    flex: { xs: 1, sm: 0 },
                    '&:hover': {
                      bgcolor: 'action.hover'
                    }
                  }}
                >
                  Next
                </Button>
              </Stack>
              <PreviewLibrary name={currentCardData.cardName} />
            </Stack>
          </Stack>
        <CardList cards={filteredCards} loading={currentCardData.loading} />
      </Box>
    </Box>
  )
}
