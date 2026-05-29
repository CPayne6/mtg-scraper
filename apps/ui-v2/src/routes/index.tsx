import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import { useSnackbar } from 'notistack';
import { SkryfallAutocomplete } from '@/components/search/SkryfallAutocomplete';
import { SavedListsMenu } from '@/components/lists/SavedListsMenu';
import { ProductTile } from '@/components/results/ProductTile';
import { Tip } from '@/components/feedback/Tip';
import { useLists } from '@/components/lists/ListsContext';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { parseDeckList } from '@/utils/parseDeckList';

type HomeSearch = { mode?: 'card' | 'deck' };

export const Route = createFileRoute('/')({
  component: HomeRoute,
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    mode: search.mode === 'deck' || search.mode === 'card' ? search.mode : undefined,
  }),
});

function HomeRoute() {
  const navigate = useNavigate();
  const { mode: initialMode } = Route.useSearch();
  const { count, save } = useLists();
  const { recents, clear: clearRecents } = useRecentSearches();
  const { enqueueSnackbar } = useSnackbar();
  const [mode, setMode] = useState<'card' | 'deck'>(initialMode ?? 'card');
  const [cardName, setCardName] = useState('');
  const [deckText, setDeckText] = useState('');

  const handleScoutCard = (name: string) => {
    if (!name.trim()) return;
    navigate({ to: '/card/$name', params: { name: name.trim() } });
  };

  const handleScoutDeck = () => {
    const cards = parseDeckList(deckText);
    if (cards.length === 0) {
      enqueueSnackbar("Couldn't find any cards in that list", { variant: 'warning' });
      return;
    }
    const listName = `CardList${count + 1}`;
    const key = save(listName, cards);
    navigate({ to: '/list/$listName', params: { listName: key } });
  };

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1100 }}>
      <Box sx={{ textAlign: 'center', py: { xs: 7, md: 8 } }}>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: '2.5rem', md: '3rem', lg: '4rem' },
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
          }}
        >
          Find the cheapest copy at your LGS.
        </Typography>
        <Typography
          sx={{
            fontSize: '1.125rem',
            color: 'text.secondary',
            mt: 2,
            mx: 'auto',
            maxWidth: 600,
            lineHeight: 1.5,
          }}
        >
          Paste a card or a card list. We'll check seven Greater Toronto game stores in seconds.
        </Typography>
        <Box sx={{ mt: 2.5, display: 'inline-flex', position: 'relative' }}>
          <SavedListsMenu />
        </Box>
      </Box>

      <Paper
        sx={{
          borderRadius: 3,
          boxShadow: 2,
          p: { xs: 3, md: 4 },
          mt: 3,
        }}
      >
        <Stack direction="row" spacing={0.5} sx={{ mb: 1.75 }}>
          <Button
            disableRipple
            onClick={() => setMode('card')}
            sx={(theme) => ({
              px: 1.75,
              py: 1,
              borderRadius: 1,
              fontSize: 14,
              fontWeight: 500,
              minWidth: 0,
              color: mode === 'card' ? 'primary.main' : 'text.secondary',
              bgcolor:
                mode === 'card'
                  ? theme.palette.mode === 'dark'
                    ? 'rgba(36,135,33,0.18)'
                    : 'rgba(74,103,65,0.12)'
                  : 'transparent',
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark'
                    ? 'rgba(36,135,33,0.14)'
                    : 'rgba(74,103,65,0.06)',
                color: 'text.primary',
              },
            })}
          >
            Single card
          </Button>
          <Button
            disableRipple
            onClick={() => setMode('deck')}
            sx={(theme) => ({
              px: 1.75,
              py: 1,
              borderRadius: 1,
              fontSize: 14,
              fontWeight: 500,
              minWidth: 0,
              color: mode === 'deck' ? 'primary.main' : 'text.secondary',
              bgcolor:
                mode === 'deck'
                  ? theme.palette.mode === 'dark'
                    ? 'rgba(36,135,33,0.18)'
                    : 'rgba(74,103,65,0.12)'
                  : 'transparent',
              '&:hover': {
                bgcolor:
                  theme.palette.mode === 'dark'
                    ? 'rgba(36,135,33,0.14)'
                    : 'rgba(74,103,65,0.06)',
                color: 'text.primary',
              },
            })}
          >
            Card list
          </Button>
        </Stack>

        {mode === 'card' ? (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr auto' },
                gap: 1.5,
                alignItems: 'stretch',
              }}
            >
              <SkryfallAutocomplete
                placeholder="e.g., Lightning Bolt, Black Lotus"
                onSelect={(name) => {
                  setCardName(name);
                  handleScoutCard(name);
                }}
                onSubmit={(name) => {
                  setCardName(name);
                  handleScoutCard(name);
                }}
              />
              <Button
                variant="contained"
                size="large"
                color="primary"
                startIcon={<SearchIcon />}
                onClick={() => handleScoutCard(cardName || 'Atraxa, Grand Unifier')}
              >
                Scout Prices
              </Button>
            </Box>
            <Box sx={{ mt: 1.75 }}>
              <Tip>Try "Atraxa, Grand Unifier" or "Sol Ring".</Tip>
            </Box>
          </>
        ) : (
          <>
            <TextField
              fullWidth
              multiline
              rows={6}
              placeholder={`1 Atraxa, Grand Unifier\n4 Lightning Bolt\n1 Sol Ring\n…`}
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              slotProps={{
                input: {
                  sx: {
                    fontFamily: '"JetBrains Mono", Menlo, monospace',
                    fontSize: 13,
                    lineHeight: 1.5,
                  },
                },
              }}
            />
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mt: 2,
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Tip>Paste a Commander list — Arena, MTGO, or plain. We'll figure out the format.</Tip>
              <Button variant="contained" size="large" color="primary" onClick={handleScoutDeck}>
                Scout Deck
              </Button>
            </Box>
          </>
        )}
      </Paper>

      {recents.length > 0 && (
        <Box sx={{ mt: 7 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h3">Recently scouted</Typography>
            <Button color="primary" onClick={clearRecents}>
              Clear
            </Button>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 2,
            }}
          >
            {recents.map((c) => (
              <ProductTile key={`${c.title}-${c.store}-${c.set}`} card={c} />
            ))}
          </Box>
        </Box>
      )}
    </Container>
  );
}
