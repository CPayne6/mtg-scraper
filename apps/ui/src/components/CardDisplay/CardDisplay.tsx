import { CardWithStore, Condition } from "@scoutlgs/shared"
import { useEffect, useState, useRef, useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Box, CircularProgress, Stack, Typography } from "@mui/material"
import { CardList } from "../CardsList"
import { StoreFilter, StoreFilterSkeleton } from "../StoreFilter"
import type { StoreCountEntry } from "../StoreFilter"
import { ConditionFilter, ConditionFilterSkeleton } from "../ConditionFilter"
import type { ConditionCountEntry } from "../ConditionFilter"
import { PreviewLibrary } from "../Library/PreviewLibrary"
import SkryfallAutocomplete from "../SkryfallAutocomplete/SkryfallAutocomplete"

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// v1 API response types — flat list sorted by price from DB
interface V1ListingResult {
  id: number
  printingId: number | null
  scryfallId: string | null
  cardName: string
  setCode: string
  setName: string
  collectorNumber: string
  rarity?: string
  imageUri?: string
  store: string
  storeSlug: string
  price: number
  currency: string
  condition: string
  foil: boolean
  quantity?: number
  productLink: string
  imageUrl?: string
}

interface V1SearchResponse {
  query: string
  totalListings: number
  priceStats: { min: number; max: number; avg: number }
  pagination: {
    page: number
    limit: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  storeCounts: StoreCountEntry[]
  conditionCounts: ConditionCountEntry[]
  results: V1ListingResult[]
}

interface SearchMetadata {
  priceStats: { min: number; max: number; avg: number }
  pagination: V1SearchResponse['pagination']
  storeCounts: StoreCountEntry[]
  conditionCounts: ConditionCountEntry[]
  totalListings: number
}

function mapResults(results: V1ListingResult[]): CardWithStore[] {
  return results.map((r) => ({
    title: r.cardName,
    store: r.store,
    // Prefer the store's product photo over the canonical Scryfall art —
    // it reflects the actual variant being sold (foils, alt arts, etc.) and
    // makes matching errors visible (e.g. a mis-matched spirit token shows up
    // as a spirit token image rather than the printing it got attached to).
    image: r.imageUrl ?? r.imageUri ?? '',
    price: r.price,
    condition: (r.condition as Condition) || Condition.UNKNOWN,
    foil: r.foil,
    currency: r.currency,
    link: r.productLink,
    set: r.setCode,
    card_number: r.collectorNumber,
    scryfall_id: r.scryfallId ?? undefined,
  }))
}

function buildSearchUrl(
  name: string,
  page: number,
  limit: number,
  stores: string[],
  conditions: string[],
): string {
  const params = new URLSearchParams()
  params.set('name', name)
  params.set('page', String(page))
  params.set('limit', String(limit))
  if (stores.length > 0) params.set('stores', stores.join(','))
  if (conditions.length > 0) params.set('conditions', conditions.join(','))
  return `${API_URL}/v1/cards/search?${params.toString()}`
}

interface CardDisplayProps {
  cardName: string;
}

export function CardDisplay(props: CardDisplayProps) {
  const cardName = decodeURIComponent(props.cardName)
  const navigate = useNavigate()

  // Accumulated cards across pages
  const [cards, setCards] = useState<CardWithStore[]>([])
  // Metadata from first fetch (stats, pagination, sidebar counts)
  const [metadata, setMetadata] = useState<SearchMetadata | null>(null)
  const [page, setPage] = useState(1)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [selectedConditions, setSelectedConditions] = useState<string[]>([])

  const sentinelRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // Refs so the page-load effect can read current values without re-triggering
  const selectedStoresRef = useRef(selectedStores)
  selectedStoresRef.current = selectedStores
  const selectedConditionsRef = useRef(selectedConditions)
  selectedConditionsRef.current = selectedConditions
  const fetchPageRef = useRef<typeof fetchPage>(null!)
  const limit = 50

  // Fetch a page of data
  const fetchPage = useCallback(async (
    pageNum: number,
    stores: string[],
    conditions: string[],
    signal: AbortSignal,
  ): Promise<V1SearchResponse | null> => {
    const url = buildSearchUrl(cardName, pageNum, limit, stores, conditions)
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) return null
      return await response.json() as V1SearchResponse
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      console.error(err)
      return null
    }
  }, [cardName])
  fetchPageRef.current = fetchPage

  // Track whether this is a fresh card search vs a filter change
  const isFilterChange = useRef(false)
  const prevCardName = useRef(cardName)

  // Initial fetch + filter changes: reset and load page 1
  useEffect(() => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const cardChanged = prevCardName.current !== cardName
    prevCardName.current = cardName
    isFilterChange.current = !cardChanged && !initialLoading

    // Only show full loading state for new card searches, not filter changes
    if (cardChanged || !metadata) {
      setInitialLoading(true)
      setCards([])
      setMetadata(null)
    }
    setPage(1)

    fetchPage(1, selectedStores, selectedConditions, controller.signal).then(data => {
      if (controller.signal.aborted) return
      if (data) {
        setCards(mapResults(data.results))
        setMetadata({
          priceStats: data.priceStats,
          pagination: data.pagination,
          storeCounts: data.storeCounts,
          conditionCounts: data.conditionCounts,
          totalListings: data.totalListings,
        })
      }
      setInitialLoading(false)
    })

    return () => controller.abort()
  }, [cardName, selectedStores, selectedConditions, fetchPage])

  // Load more pages (page > 1).
  // Only depends on `page` — reads filters/fetchPage from refs to avoid
  // double-fetching when filters change (the initial-fetch effect handles resets).
  useEffect(() => {
    if (page <= 1) return

    const controller = new AbortController()
    setLoadingMore(true)

    fetchPageRef.current(page, selectedStoresRef.current, selectedConditionsRef.current, controller.signal).then(data => {
      if (controller.signal.aborted) return
      if (data) {
        setCards(prev => [...prev, ...mapResults(data.results)])
        setMetadata(prev => prev ? {
          ...prev,
          pagination: data.pagination,
        } : null)
      }
      setLoadingMore(false)
    })

    return () => controller.abort()
  }, [page])

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !metadata?.pagination.hasNextPage) return

    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && !initialLoading) {
        setPage(prev => prev + 1)
      }
    }, { threshold: 0.1 })

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [metadata?.pagination.hasNextPage, loadingMore, initialLoading])

  const handleStoresChange = useCallback((slugs: string[]) => {
    setSelectedStores(slugs)
  }, [])

  const handleConditionsChange = useCallback((codes: string[]) => {
    setSelectedConditions(codes)
  }, [])

  const onSubmitCardName = (newCardName: string) => {
    if (newCardName.length > 0) {
      navigate({ to: `/card/${encodeURIComponent(newCardName)}` })
    } else {
      alert("Enter a value to search")
    }
  }

  const showCards = initialLoading ? undefined : (cards.length > 0 ? cards : (metadata ? [] : undefined))

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, width: '100%' }}>
      {/* Left Sidebar - Filters */}
      <Box sx={{ width: { xs: '100%', md: '200px' }, flexShrink: 0, position: { md: 'sticky' }, top: { md: 120 }, alignSelf: 'flex-start' }}>
        <Stack spacing={2}>
          {initialLoading || !metadata ? (
            <>
              <StoreFilterSkeleton />
              <ConditionFilterSkeleton />
            </>
          ) : (
            <>
              <StoreFilter
                storeCounts={metadata.storeCounts}
                selectedSlugs={selectedStores}
                onStoresChange={handleStoresChange}
              />
              <ConditionFilter
                conditionCounts={metadata.conditionCounts}
                selectedConditions={selectedConditions}
                onConditionsChange={handleConditionsChange}
              />
            </>
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
          <Box sx={{ flex: 1, minWidth: { xs: '100%', md: 280 }, mb: { xs: 0, md: 0 } }}>
            <Typography
              variant="h4"
              sx={{
                fontSize: cardName.length > 40
                  ? { xs: '1.1rem', md: '1.4rem' }
                  : cardName.length > 25
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
              title={cardName}
            >
              {cardName}
            </Typography>
            {initialLoading ? (
              <Typography variant="body2" color="text.secondary">
                Loading price data...
              </Typography>
            ) : metadata ? (
              <Typography variant="body2" color="text.secondary">
                {cards.length} / {metadata.totalListings} results • ${metadata.priceStats.min.toFixed(2)} - ${metadata.priceStats.max.toFixed(2)}
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
            <Box sx={{ flex: { xs: 1, sm: 0 }, minWidth: { sm: 300 } }}>
              <SkryfallAutocomplete
                initialValue={cardName}
                placeholder="Search another card"
                onSelect={onSubmitCardName}
              />
            </Box>
            <PreviewLibrary name={cardName} />
          </Stack>
        </Stack>
        <CardList cards={showCards} loading={initialLoading} />

        {/* Sentinel element for infinite scroll */}
        <Box
          ref={sentinelRef}
          sx={{ height: '1px', width: '100%' }}
        />

        {/* Loading more indicator */}
        {loadingMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={32} />
          </Box>
        )}
      </Box>
    </Box>
  )
}
