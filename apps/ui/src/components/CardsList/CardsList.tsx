import { CardWithStore } from "@scoutlgs/shared"
import { useContext, useRef, useEffect, useState, useCallback } from "react"
import { Box, Typography, Skeleton } from "@mui/material"
import { Card as DisplayCard } from "./Card"
import { formatStorageName } from "../Library/library.utils"
import { LibraryContext } from "@/context"

interface CardListProps {
  loading: boolean
  cards?: CardWithStore[] | null;
}

export function CardList({ cards, loading }: CardListProps) {
  const { library, addToLibrary } = useContext(LibraryContext)

  // Track which card indices are visible or have been visible
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const prefetchedImages = useRef<Set<string>>(new Set())

  // Dynamic prefetch count and buffer based on screen width
  // Matches the grid columns: xs=1, sm=2, md=3, lg=4, xl=5
  const [prefetchCount, setPrefetchCount] = useState(() => {
    const width = window.innerWidth
    if (width >= 1536) return 10 // xl: 5 cols × 2 rows
    if (width >= 1200) return 8  // lg: 4 cols × 2 rows
    if (width >= 900) return 6   // md: 3 cols × 2 rows
    if (width >= 600) return 4   // sm: 2 cols × 2 rows
    return 3                      // xs: 1 col × 3 rows
  })

  const [rootMargin, setRootMargin] = useState(() => {
    const width = window.innerWidth
    if (width >= 1200) return "800px" // Desktop: larger buffer
    if (width >= 600) return "600px"  // Tablet: medium buffer
    return "400px"                    // Mobile: smaller buffer (save bandwidth)
  })

  // Update prefetch count and root margin on window resize
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      let newCount: number
      let newMargin: string

      if (width >= 1536) {
        newCount = 10      // xl
        newMargin = "800px"
      } else if (width >= 1200) {
        newCount = 8       // lg
        newMargin = "800px"
      } else if (width >= 900) {
        newCount = 6       // md
        newMargin = "600px"
      } else if (width >= 600) {
        newCount = 4       // sm
        newMargin = "600px"
      } else {
        newCount = 3       // xs
        newMargin = "400px"
      }

      setPrefetchCount(newCount)
      setRootMargin(newMargin)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Set up intersection observer
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const currentlyInView = new Set<number>()
        let hasChanges = false

        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-index') || '-1')
          if (index >= 0 && entry.isIntersecting) {
            currentlyInView.add(index)
            hasChanges = true
          }
        })

        // Update visible cards using functional update to avoid stale closure
        if (hasChanges) {
          setVisibleCards((prev) => {
            const newVisible = new Set(prev)
            currentlyInView.forEach(index => newVisible.add(index))
            return newVisible
          })
        }

        // Prefetch images for cards currently in view
        if (currentlyInView.size > 0) {
          if (!cards) return

          currentlyInView.forEach((index) => {
            // Prefetch current card's image
            const currentImageUrl = cards[index]?.image
            if (currentImageUrl && !prefetchedImages.current.has(currentImageUrl)) {
              const link = document.createElement("link")
              link.rel = "prefetch"
              link.as = "image"
              link.href = currentImageUrl
              document.head.appendChild(link)
              prefetchedImages.current.add(currentImageUrl)
            }

            // Prefetch upcoming cards
            const count = prefetchCount
            for (let i = 1; i <= count; i++) {
              const nextIndex = index + i
              if (nextIndex < cards.length) {
                const imageUrl = cards[nextIndex].image
                if (!prefetchedImages.current.has(imageUrl)) {
                  const link = document.createElement("link")
                  link.rel = "prefetch"
                  link.as = "image"
                  link.href = imageUrl
                  document.head.appendChild(link)
                  prefetchedImages.current.add(imageUrl)
                }
              }
            }
          })
        }
      },
      {
        rootMargin: rootMargin, // Dynamic buffer based on screen size
        threshold: 0.01,
      }
    )

    return () => {
      observerRef.current?.disconnect()
    }
  }, [cards, prefetchCount, rootMargin])

  // Observe card elements
  const setCardRef = useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) {
      cardRefs.current.set(index, element)
      observerRef.current?.observe(element)
    } else {
      const oldElement = cardRefs.current.get(index)
      if (oldElement) {
        observerRef.current?.unobserve(oldElement)
        cardRefs.current.delete(index)
      }
    }
  }, [])

  const renderContent = () => {
    if (loading) {
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
            Loading cards...
          </Typography>
        </Box>
      )
    }

    if (!cards) {
      return (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8
        }}>
          <Typography variant="h6" color="error">
            Cannot get card data
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
            No cards found
          </Typography>
        </Box>
      )
    }

    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
            xl: 'repeat(5, 1fr)'
          },
          gap: { xs: 2, md: 3 },
          justifyItems: 'center',
          width: '100%'
        }}
      >
        {cards.map((card, index) => {
          const shouldRender = visibleCards.has(index)
          return (
            <Box
              key={card.title + card.store + index}
              ref={(el) => setCardRef(index, el as HTMLDivElement | null)}
              data-index={index}
              sx={{
                width: '100%',
                maxWidth: 300,
                margin: '0 auto'
              }}
            >
              {shouldRender ? (
                <DisplayCard
                  {...card}
                  inLibrary={!!library?.[formatStorageName(card.title)]}
                  addToLibrary={() => addToLibrary({
                    name: card.title,
                    set: card.set,
                    card_number: card.card_number
                  })}
                />
              ) : (
                <Box
                  sx={{
                    width: '100%',
                    maxWidth: 300,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '8px',
                    boxShadow: 2,
                    position: 'relative'
                  }}
                >
                  {/* Preload image hidden behind skeleton */}
                  <Box sx={{
                    width: '100%',
                    aspectRatio: '5/7',
                    bgcolor: 'background.default',
                    borderRadius: '8px 8px 0 0',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    <img
                      src={card.image}
                      alt=""
                      loading="eager"
                      style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0,
                        pointerEvents: 'none'
                      }}
                    />
                    <Skeleton
                      variant="rectangular"
                      width="100%"
                      height="100%"
                      sx={{ aspectRatio: '5/7' }}
                    />
                  </Box>
                  {/* Content area skeleton - matches CardContent with pb: 1 */}
                  <Box sx={{
                    p: 2,
                    pb: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    flex: 1
                  }}>
                    {/* Store name - h6 variant, 1rem, fontWeight 600 */}
                    <Skeleton variant="text" width="60%" sx={{ fontSize: '1rem', height: '1.5rem' }} />
                    {/* Set name - body2, 0.875rem */}
                    <Skeleton variant="text" width="80%" sx={{ fontSize: '0.875rem', height: '1.25rem' }} />
                    {/* Price/condition - mt: auto, pt: 0.5 */}
                    <Box sx={{ mt: 'auto', pt: 0.5 }}>
                      <Skeleton variant="text" width="50%" sx={{ fontSize: '1rem', height: '1.5rem' }} />
                    </Box>
                  </Box>
                  {/* Actions area skeleton - matches CardActions with p: 2, pt: 0 */}
                  <Box sx={{ p: 2, pt: 0 }}>
                    <Skeleton
                      variant="rectangular"
                      width="100%"
                      height={32}
                      sx={{ borderRadius: '4px' }}
                    />
                  </Box>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%' }}>
      {renderContent()}
    </Box>
  )
}
