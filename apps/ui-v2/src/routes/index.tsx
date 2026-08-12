import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Search as SearchIcon } from '@mui/icons-material';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useSnackbar } from 'notistack';
import { SkryfallAutocomplete } from '@/components/search/SkryfallAutocomplete';
import { ProductTile } from '@/components/results/ProductTile';
import { Tip } from '@/components/feedback/Tip';
import { useLists } from '@/components/lists/ListsContext';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { parseDeckList } from '@/utils/parseDeckList';
import { slugifyName } from '@/utils/slugify';
import { fetchScryfallCard, type ScryfallCardOption } from '@/api/cards';
import { previewDeckImport, type DeckImportPreview } from '@/api/lists';

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
  const { count, save, listLimit, canCreateList } = useLists();
  const { recents, clear: clearRecents } = useRecentSearches();
  const { enqueueSnackbar } = useSnackbar();
  const [mode, setMode] = useState<'card' | 'deck'>(initialMode ?? 'card');
  const [cardName, setCardName] = useState('');
  const [listName, setListName] = useState('');
  const [deckText, setDeckText] = useState('');
  const [deckUrl, setDeckUrl] = useState('');
  const [importPreview, setImportPreview] = useState<DeckImportPreview | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [ignoreBasicLands, setIgnoreBasicLands] = useState(false);
  const [importing, setImporting] = useState(false);

  const previewCards = useMemo(() => importPreview?.sections.filter((section) => selectedSections.includes(section.id)).flatMap((section) => section.cards.flatMap((card) => Array.from({ length: card.quantity }, () => `${card.name}${card.setCode ? ` [${card.setCode}]` : ''}`))) ?? [], [importPreview, selectedSections]);

  const handleScoutCard = async (card: ScryfallCardOption | string) => {
    const resolved = typeof card === 'string' ? await fetchScryfallCard(card) : card;
    navigate({ to: '/card/$oracleId/$name', params: { oracleId: resolved.oracleId, name: resolved.name } });
  };

  const handleScoutDeck = async () => {
    if (!canCreateList) {
      enqueueSnackbar(
        `You can save up to ${listLimit} card lists. Delete one before creating another.`,
        { variant: 'warning' },
      );
      return;
    }
    const trimmedListName = listName.trim();
    if (!trimmedListName) {
      enqueueSnackbar('Name your card list before continuing', { variant: 'warning' });
      return;
    }
    const cards = parseDeckList(deckText);
    if (cards.length === 0) {
      enqueueSnackbar("Couldn't find any cards in that list", { variant: 'warning' });
      return;
    }
    const id = await save(trimmedListName, cards);
    if (!id) return;
    navigate({
      to: '/build/$listId/$slug',
      params: { listId: id, slug: slugifyName(trimmedListName) },
    });
  };

  const handleImportPreview = async () => {
    if (!deckUrl.trim()) return enqueueSnackbar('Paste a supported deck link first', { variant: 'warning' });
    setImporting(true);
    try {
      const preview = await previewDeckImport(deckUrl.trim());
      setImportPreview(preview); setListName(preview.name); setSelectedSections(preview.sections.filter((section) => section.selectedByDefault).map((section) => section.id));
    } catch (error) { enqueueSnackbar(error instanceof Error ? error.message : 'Could not import that link', { variant: 'error' }); }
    finally { setImporting(false); }
  };

  const handleImportedDeck = async () => {
    const name = listName.trim();
    const cards = ignoreBasicLands ? previewCards.filter((card) => !/^(Plains|Island|Swamp|Mountain|Forest)( \[[^\]]+\])?$/i.test(card)) : previewCards;
    if (!name) return enqueueSnackbar('Name your card list before continuing', { variant: 'warning' });
    if (!cards.length) return enqueueSnackbar('Select at least one non-basic card', { variant: 'warning' });
    if (cards.length > 150) return enqueueSnackbar('Selected sections contain more than the 150-card limit', { variant: 'warning' });
    const id = await save(name, cards); if (id) navigate({ to: '/build/$listId/$slug', params: { listId: id, slug: slugifyName(name) } });
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
          Find the Magic cards you need
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
          Source cards from local Toronto stores, more locations coming soon
        </Typography>
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
              bgcolor: mode === 'card' ? theme.palette.primarySoft : 'transparent',
              '&:hover': {
                bgcolor: theme.palette.primarySoftHover,
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
              bgcolor: mode === 'deck' ? theme.palette.primarySoft : 'transparent',
              '&:hover': {
                bgcolor: theme.palette.primarySoftHover,
                color: 'text.primary',
              },
            })}
          >
            Build list
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
                onSelect={(card) => {
                  setCardName(card.name);
                  void handleScoutCard(card);
                }}
                onSubmit={(name) => {
                  setCardName(name);
                  void handleScoutCard(name);
                }}
              />
              <Button
                variant="contained"
                size="large"
                color="primary"
                startIcon={<SearchIcon />}
                onClick={() => void handleScoutCard(cardName || 'Atraxa, Grand Unifier')}
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
            <TextField fullWidth label="Import from deck link" placeholder="Archidekt, Deckstats, MTGGoldfish, or Moxfield" value={deckUrl} onChange={(e) => setDeckUrl(e.target.value)} sx={{ mb: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}><Button variant="outlined" onClick={() => void handleImportPreview()} disabled={importing || !canCreateList}>{importing ? 'Importing…' : 'Import link'}</Button></Box>
            {importPreview && (
              <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                <Typography variant="subtitle1">Preview from {importPreview.provider}</Typography>
                {importPreview.warnings.map((warning) => <Typography key={warning} variant="body2" color="warning.main">{warning}</Typography>)}
                {importPreview.sections.map((section) => <FormControlLabel key={section.id} control={<Checkbox checked={selectedSections.includes(section.id)} onChange={(event) => setSelectedSections((previous) => event.target.checked ? [...previous, section.id] : previous.filter((id) => id !== section.id))} />} label={`${section.label} (${section.cards.reduce((total, card) => total + card.quantity, 0)} cards)`} />)}
                <FormControlLabel control={<Checkbox checked={ignoreBasicLands} onChange={(event) => setIgnoreBasicLands(event.target.checked)} />} label="Ignore basic lands" />
                <Typography variant="body2" color={previewCards.length > 150 ? 'error.main' : 'text.secondary'}>{previewCards.length} selected cards{previewCards.length > 150 ? ' — exceeds the 150-card limit' : ''}</Typography>
              </Paper>
            )}
            <TextField
              fullWidth
              label="List name"
              placeholder={`Card List ${count + 1}`}
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
              sx={{ mb: 1.5 }}
            />
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
              {!canCreateList && (
                <Tip>
                  You have reached the {listLimit} card list limit. Delete a list
                  to create another.
                </Tip>
              )}
              <Button
                variant="contained"
                size="large"
                color="primary"
                disabled={!canCreateList}
                onClick={handleScoutDeck}
              >
                Continue
              </Button>
              {importPreview && <Button variant="contained" size="large" color="primary" disabled={!canCreateList || previewCards.length > 150} onClick={() => void handleImportedDeck()}>Create imported list</Button>}
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
