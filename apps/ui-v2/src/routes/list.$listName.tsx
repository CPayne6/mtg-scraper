import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import ArrowForward from '@mui/icons-material/ArrowForward';
import FilterAlt from '@mui/icons-material/FilterAlt';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import { useSnackbar } from 'notistack';
import { useLists } from '@/components/lists/ListsContext';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ColorPips } from '@/components/lists/ColorPips';
import { KpiTile } from '@/components/results/KpiTile';
import { DecklistRow } from '@/components/results/DecklistRow';
import { DECK_META } from '@/data/sample';
import { colorIdentityName } from '@/data/colors';

export const Route = createFileRoute('/list/$listName')({
  component: ListDetailRoute,
});

function ListDetailRoute() {
  const { listName } = useParams({ from: '/list/$listName' });
  const navigate = useNavigate();
  const { get } = useLists();
  const { enqueueSnackbar } = useSnackbar();
  const cards = get(listName);

  if (cards.length === 0) {
    return (
      <Container maxWidth={false} sx={{ maxWidth: 1100 }}>
        <EmptyState
          title="List not found"
          description={`We couldn't find "${listName}" in your saved lists.`}
          action={
            <Button variant="outlined" color="primary" onClick={() => navigate({ to: '/lists' })}>
              Back to Lists
            </Button>
          }
        />
      </Container>
    );
  }

  const meta = DECK_META[listName] ?? { colors: '', archetype: 'Custom', updated: 'recently' };
  const checkoutStores = 3;

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1100 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 3,
          mb: 3.5,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Button
            onClick={() => navigate({ to: '/lists' })}
            startIcon={<ChevronLeft sx={{ fontSize: 14 }} />}
            sx={{
              alignSelf: 'flex-start',
              py: 0.5,
              px: 1.25,
              fontSize: '0.78rem',
              color: 'text.secondary',
              minWidth: 0,
              mb: 0.75,
              '&:hover': { color: 'primary.main', bgcolor: 'transparent' },
            }}
          >
            All lists
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, flexWrap: 'wrap' }}>
            <ColorPips colors={meta.colors} size={32} />
            <Typography
              sx={{
                fontSize: { xs: '2rem', md: '2.4rem' },
                fontWeight: 700,
                letterSpacing: '-0.01em',
                lineHeight: 1,
                m: 0,
              }}
            >
              {listName}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mt: 0.75 }}>
            {colorIdentityName(meta.colors)} · {cards.length} cards
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => enqueueSnackbar(`Deck saved as ${listName}`, { variant: 'default' })}
          >
            Save Deck
          </Button>
          <Button variant="contained" color="primary" endIcon={<ArrowForward />}>
            Check Out at {checkoutStores} Stores
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 2,
          mb: 4,
        }}
      >
        <KpiTile label="Deck total" value="CA$0.00" delta="↓ CA$0.00" deltaTone="good" />
        <KpiTile label="Stores searched" value="7 / 7" delta="in 2.4s" />
        <KpiTile
          label="In stock"
          value={`${cards.length} / ${cards.length}`}
          delta="all available"
        />
      </Box>

      <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Typography variant="h3">Cards · {cards.length}</Typography>
          <Button color="primary" startIcon={<FilterAlt sx={{ fontSize: 14 }} />}>
            Filter
          </Button>
        </Box>
        <Stack spacing={1}>
          {cards.map((cardName, i) => (
            <DecklistRow
              key={`${cardName}-${i}`}
              qty={1}
              name={cardName}
              meta="—"
              price={0}
              store="—"
              onStoreChange={() =>
                enqueueSnackbar(`Swapped store for ${cardName}`, { variant: 'default' })
              }
              onRemove={() => enqueueSnackbar(`Removed ${cardName}`, { variant: 'default' })}
            />
          ))}
        </Stack>
      </Paper>
    </Container>
  );
}
