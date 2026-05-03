import { CardWithStore, Condition } from "@scoutlgs/shared"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Box, Button, FormControl, MenuItem, Select, Stack, TextField, Typography } from "@mui/material"
import { CardList } from "../CardsList"
import { StoreFilter, StoreFilterSkeleton } from "../StoreFilter"
import type { StoreCountEntry } from "../StoreFilter"
import { PreviewLibrary } from "../Library"
import { getList, updateListFilters, type CheapestVariant, type ListWithPricesResponse } from "@/api/lists"
import { toaster } from "../ui/toaster"

interface DeckListProps {
  listName: string
  pagination?: boolean
}

function pageToIndex(page: number, cardCount: number): number {
  if (!Number.isFinite(page) || page <= 1 || cardCount <= 0) return 0
  return Math.min(page - 1, cardCount - 1)
}

function parseStoreFilter(filterStores: string | null | undefined): string[] {
  return filterStores
    ? filterStores.split(',').map((store) => store.trim()).filter(Boolean)
    : []
}

function buildStoreCounts(cards: CheapestVariant[]): StoreCountEntry[] {
  const counts = new Map<string, StoreCountEntry>()

  for (const card of cards) {
    if (!card.storeSlug || !card.store) continue

    const current = counts.get(card.storeSlug)
    if (current) {
      current.count += 1
    } else {
      counts.set(card.storeSlug, {
        storeSlug: card.storeSlug,
        storeName: card.store,
        count: 1,
      })
    }
  }

  return Array.from(counts.values()).sort((a, b) => a.storeName.localeCompare(b.storeName))
}

function buildProductLink(card: CheapestVariant): string {
  if (!card.storeBaseUrl) return ''
  const baseUrl = card.storeBaseUrl.replace(/\/$/, '')
  return card.productHandle ? `${baseUrl}/products/${card.productHandle}` : baseUrl
}

function mapCheapestVariant(card: CheapestVariant | undefined): CardWithStore | null {
  if (!card || card.price == null || !card.store) return null

  return {
    title: card.cardName,
    store: card.store,
    image: card.imageUri ?? card.imageUrl ?? '',
    price: card.price,
    condition: (card.condition?.toLowerCase() as Condition) || Condition.UNKNOWN,
    foil: card.foil ?? false,
    currency: card.currency ?? 'CAD',
    link: buildProductLink(card),
    set: card.setCode ?? '',
    card_number: card.collectorNumber ?? '',
    scryfall_id: card.scryfallId ?? undefined,
  }
}

function formatListings(count: number): string {
  return `${count} listing${count === 1 ? '' : 's'}`
}

export function DeckDisplay({ listName, pagination = true }: DeckListProps) {
  const listId = listName
  const navigate = useNavigate({ from: '/list/$listName' })
  const searchParams = useSearch({ from: '/list/$listName' })
  const page = Number(searchParams.page || 0)

  const [list, setList] = useState<ListWithPricesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingFilters, setUpdatingFilters] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [cardIndex, setCardIndex] = useState(0)

  const loadList = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await getList(listId, signal)
      if (signal?.aborted) return
      setList(response)
      setSelectedStores(parseStoreFilter(response.filterStores))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Unable to load list'
      setError(message)
      toaster.error({ title: message })
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [listId])

  useEffect(() => {
    setList(null)
    setCardIndex(0)
    const controller = new AbortController()
    void loadList(controller.signal)
    return () => controller.abort()
  }, [loadList])

  useEffect(() => {
    if (!list) return
    setCardIndex(pageToIndex(page, list.cards.length))
  }, [page, list])

  const cards = list?.cards ?? []
  const currentCard = cards[cardIndex]
  const currentCardResult = useMemo(() => mapCheapestVariant(currentCard), [currentCard])
  const storeCounts = useMemo(() => buildStoreCounts(cards), [cards])

  const sortedCardNames = useMemo(() =>
    cards.map((card, index) => ({ label: card.cardName, value: (index + 1).toString() }))
      .sort((a, b) => a.label.toLocaleLowerCase().localeCompare(b.label.toLocaleLowerCase()))
    , [cards])

  const updatePage = (index: number) => {
    const cardName = cards[index]?.cardName ?? 'Unknown'
    setCardIndex(index)
    navigate({
      search: (prev) => ({
        ...prev,
        page: (index + 1).toString(),
        name: cardName
      })
    })
  }

  const onPageChange = (pageStr: string) => {
    if (cards.length === 0) return
    const nextPage = Math.max(Math.min(Number(pageStr), cards.length), 1)
    updatePage(nextPage - 1)
  }

  const onNextPage = () => {
    updatePage(cardIndex + 1)
  }

  const onPreviousPage = () => {
    updatePage(cardIndex - 1)
  }

  const handleStoreFilterChange = async (storeSlugs: string[]) => {
    setSelectedStores(storeSlugs)
    setUpdatingFilters(true)
    setError(null)
    try {
      await updateListFilters(listId, {
        filterStores: storeSlugs.join(','),
        filterConditions: list?.filterConditions ?? undefined,
        filterSetCode: list?.filterSetCode ?? undefined,
      })
      const refreshed = await getList(listId)
      setList(refreshed)
      setSelectedStores(parseStoreFilter(refreshed.filterStores))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update store filter'
      setError(message)
      toaster.error({ title: message })
    } finally {
      setUpdatingFilters(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        py: 8
      }}>
        <Typography variant="h6" color="text.secondary">
          Loading card list...
        </Typography>
      </Box>
    )
  }

  if (error && !list) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        gap: 2
      }}>
        <Typography variant="h6" color="error">
          Unable to load this list
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {error}
        </Typography>
      </Box>
    )
  }

  if (cards.length === 0) {
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

  if (!currentCard) {
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

  const showCards = currentCardResult ? [currentCardResult] : []
  const totalListings = currentCard.totalListings ?? 0
  const hasPrice = currentCard.price != null

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, width: '100%' }}>
      {/* Left Sidebar - Filters */}
      <Box sx={{ width: { xs: '100%', md: '200px' }, flexShrink: 0, position: { md: 'sticky' }, top: { md: 120 }, alignSelf: 'flex-start' }}>
        <Stack spacing={2}>
          {updatingFilters ? (
            <StoreFilterSkeleton />
          ) : (
            <StoreFilter
              storeCounts={storeCounts}
              selectedSlugs={selectedStores}
              onStoresChange={(slugs) => void handleStoreFilterChange(slugs)}
            />
          )}
        </Stack>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 2, md: 3 }}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
            sx={{
              mb: { xs: 3, md: 4 },
              p: { xs: 2, md: 3 },
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: 1,
              flexWrap: 'wrap',
              rowGap: 2
            }}
          >
            <Box sx={{ flex: 1, minWidth: { xs: '100%', md: 280 } }}>
              <Typography
                variant="h4"
                sx={{
                  fontSize: currentCard.cardName.length > 40
                    ? { xs: '1.1rem', md: '1.4rem' }
                    : currentCard.cardName.length > 25
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
                title={currentCard.cardName}
              >
                {currentCard.cardName}
              </Typography>
              {updatingFilters ? (
                <Typography variant="body2" color="text.secondary">
                  Updating store filter...
                </Typography>
              ) : hasPrice ? (
                <Typography variant="body2" color="text.secondary">
                  Best price ${currentCard.price?.toFixed(2)} at {currentCard.store} - {formatListings(totalListings)}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No current listings found
                </Typography>
              )}
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent="flex-end"
              sx={{ flexWrap: 'wrap' }}
            >
              {currentCard.cardName && (
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
                    inputProps={{ min: 1, max: cards.length }}
                    sx={{ width: '70px' }}
                  />
                  <Typography variant="body2">of {cards.length}</Typography>
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
                  disabled={cardIndex >= cards.length - 1}
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
              <PreviewLibrary name={currentCard.cardName} />
            </Stack>
          </Stack>
        <CardList cards={showCards} loading={updatingFilters} />
      </Box>
    </Box>
  )
}
