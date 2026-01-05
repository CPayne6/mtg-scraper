import { CardWithStore } from "@scoutlgs/shared"
import { useContext } from "react"
import { Box, Typography } from "@mui/material"
import { Card as DisplayCard } from "./Card"
import { formatStorageName } from "../Library/library.utils"
import { LibraryContext } from "@/context"

interface CardListProps {
  loading: boolean
  cards?: CardWithStore[] | null;
}

export function CardList({ cards, loading }: CardListProps) {
  const { library, addToLibrary } = useContext(LibraryContext)

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
          <Typography variant="body2" color="text.secondary">
            Try a different search term
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
        {cards.map((card, index) => (
          <DisplayCard
            key={card.title + card.store + index}
            {...card}
            inLibrary={!!library?.[formatStorageName(card.title)]}
            addToLibrary={() => addToLibrary({
              name: card.title,
              set: card.set,
              card_number: card.card_number
            })}
          />
        ))}
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%' }}>
      {renderContent()}
    </Box>
  )
}
