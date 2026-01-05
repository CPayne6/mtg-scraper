import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Box, Button, FormControl, FormHelperText, FormLabel, Stack, TextField, Typography } from '@mui/material'
import { UploadLibrary } from '../components'
import SkryfallAutocomplete from '../components/SkryfallAutocomplete/SkryfallAutocomplete'
import { useLocalStorage } from '../hooks'
import { generateRandomName } from '../utils/randomNameGenerator'

export const cardNameRegex = /^\d*\s*([\w ,'-]+)(?: \()*.*$/i

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [listName, setListName] = useState<string>('')
  const [cardsList, setCardsList] = useState<string>('')
  const [cardName, setCardName] = useState<string>('')

  const [deckListHelperText, setMoxHelperText] = useState<string>()
  const [nameHelperText, setNameHelperText] = useState<string>()
  const [listStorage, setListStorage] = useLocalStorage<Record<string, string[]>>('deck-lists', {})

  const navigate = useNavigate()

  const onSubmitCardList = () => {
    if (!cardsList || cardsList.length === 0) {
      setMoxHelperText("Enter a deck list to get started")
      return
    }
    const cardsListArr = []
    for (const cardNameRaw of cardsList.split('\n')) {
      if (cardNameRaw.trim() === '') {
        continue;
      }

      const cardName = cardNameRegex.exec(cardNameRaw)?.[1].trim()
      if (cardName && cardName.length !== 0) {
        cardsListArr.push(cardName)
      }
    }

    if (cardsListArr.length === 0) {
      setMoxHelperText("Unable to read link")
      return
    }

    const cleanedListName = listName.replaceAll(/\W/g, '')
    const storageName = cleanedListName.length > 0 ? cleanedListName : generateRandomName()
    setListStorage({ ...listStorage, [storageName]: cardsListArr })
    navigate({ to: `/list/${storageName}` })
  }

  const onSubmitCardName = (name: string) => {
    if (!name || name.length === 0) {
      setNameHelperText("Enter the entire name")
      return
    }
    navigate({ to: `/card/${encodeURIComponent(name)}` })
  }

  return <Box sx={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    width: '100%',
    bgcolor: 'background.default',
    py: { xs: 4, md: 8 },
    px: { xs: 2, sm: 3, md: 4 }
  }}>
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '100%',
      maxWidth: { xs: '100%', sm: '600px', md: '900px', lg: '1100px' }
    }}>
      <Stack direction="column" spacing={{ xs: 6, md: 10 }} sx={{ width: '100%' }}>
        {/* Header Section */}
        <Stack direction="column" spacing={{ xs: 3, md: 4 }} alignItems="center">
          <Box
            component="img"
            src="/ScoutLGS-logo-transparent.png"
            alt="ScoutLGS Logo"
            sx={{
              height: { xs: 150, md: 180, lg: 220 },
              width: 'auto',
              objectFit: 'contain'
            }}
          />
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem', lg: '4rem' },
              fontWeight: 700,
              textAlign: 'center',
              letterSpacing: '-0.02em'
            }}
          >
            ScoutLGS
          </Typography>
          <Typography
            variant="h6"
            sx={{
              textAlign: 'center',
              color: 'text.secondary',
              fontSize: { xs: '0.9rem', md: '1.1rem', lg: '1.25rem' },
              fontWeight: 400,
              maxWidth: '700px',
              lineHeight: 1.6
            }}
          >
            Scout your local game stores - Search across Hobbiesville, 401 Games and FacetoFace Games
          </Typography>
        </Stack>

        {/* Two Column Layout for Desktop */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: { xs: 4, md: 4, lg: 5 },
          width: '100%'
        }}>
          {/* Deck List Search Card */}
          <Stack
            spacing={3}
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 3,
              p: { xs: 2.5, md: 3.5, lg: 4 },
              boxShadow: 2,
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: 4,
                transform: 'translateY(-2px)'
              },
              height: 'fit-content'
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 600,
                fontSize: { xs: '1.25rem', md: '1.4rem' }
              }}
            >
              Batch Search
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                mb: 1
              }}
            >
              Upload a file or paste your entire deck list to find all cards at once
            </Typography>
            <UploadLibrary />
            <FormControl fullWidth>
              <FormLabel sx={{ mb: 1, fontWeight: 500 }}>Paste your cards list here</FormLabel>
              <TextField
                multiline
                rows={8}
                placeholder="4x Lightning Bolt&#10;2x Counterspell&#10;1x Black Lotus&#10;3x Brainstorm"
                value={cardsList}
                onChange={(e) => setCardsList(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    onSubmitCardList()
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'background.default'
                  }
                }}
              />
              {deckListHelperText && deckListHelperText.length > 0 && (
                <FormHelperText error>{deckListHelperText}</FormHelperText>
              )}
            </FormControl>
            <TextField
              size="small"
              placeholder="Optional: Name your list"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'background.default'
                }
              }}
            />
            <Button
              variant="contained"
              onClick={onSubmitCardList}
              size="large"
              fullWidth
              sx={{
                py: 1.5,
                fontWeight: 600,
                fontSize: '1rem',
                textTransform: 'none',
                mt: 1
              }}
            >
              Search Deck List
            </Button>
          </Stack>

          {/* Single Card Search Card */}
          <Stack
            spacing={3}
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 3,
              p: { xs: 2.5, md: 3.5, lg: 4 },
              boxShadow: 2,
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: 4,
                transform: 'translateY(-2px)'
              },
              height: 'fit-content'
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 600,
                fontSize: { xs: '1.25rem', md: '1.4rem' }
              }}
            >
              Single Card Search
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                mb: 1
              }}
            >
              Search for a specific card to compare prices across all stores
            </Typography>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <FormLabel sx={{ mb: 1, fontWeight: 500 }}>Enter card name</FormLabel>
              <SkryfallAutocomplete
                placeholder="e.g., Lightning Bolt, Black Lotus"
                onSelect={onSubmitCardName}
              />
              {nameHelperText && nameHelperText.length > 0 && (
                <FormHelperText error>{nameHelperText}</FormHelperText>
              )}
            </FormControl>

            {/* Optional: Add some tips or popular searches */}
            <Box sx={{
              mt: 'auto',
              pt: 3,
              borderTop: 1,
              borderColor: 'divider'
            }}>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  display: 'block',
                  mb: 1
                }}
              >
                💡 Tip: Start typing and select from autocomplete suggestions
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </Box>
  </Box>
}
