import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Add from '@mui/icons-material/Add';
import { useLists } from '@/components/lists/ListsContext';
import { DeckCard } from '@/components/lists/DeckCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DECK_META } from '@/data/sample';

export const Route = createFileRoute('/lists')({
  component: ListsRoute,
});

function ListsRoute() {
  const navigate = useNavigate();
  const { names, count, totalCards, lists, remove } = useLists();

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
        <Box>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'primary.main',
              mb: 0.5,
            }}
          >
            Your library
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '2rem', md: '2.4rem' },
              fontWeight: 700,
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
              m: 0,
            }}
          >
            Card Lists
          </Typography>
          {count > 0 && (
            <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mt: 0.75 }}>
              {count} {count === 1 ? 'list' : 'lists'} · {totalCards} cards total
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'inline-flex', gap: 1 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Add />}
            onClick={() => navigate({ to: '/', search: { mode: 'deck' } })}
          >
            New List
          </Button>
        </Box>
      </Box>

      {count === 0 ? (
        <EmptyState
          title="No lists yet"
          description="Upload a list or paste one from Arena / MTGO and we'll scout every card across all 7 stores."
          action={
            <Button variant="outlined" color="primary" onClick={() => navigate({ to: '/', search: { mode: 'deck' } })}>
              Upload a List
            </Button>
          }
        />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 2,
          }}
        >
          {names.map((n) => {
            const meta = DECK_META[n] ?? {
              colors: '',
              archetype: 'Custom',
              updated: 'recently',
            };
            const cnt = lists[n].length;
            return (
              <DeckCard
                key={n}
                name={n}
                colors={meta.colors}
                archetype={meta.archetype}
                count={cnt}
                updated={meta.updated}
                onOpen={() => navigate({ to: '/list/$listName', params: { listName: n } })}
                onDelete={() => remove(n)}
              />
            );
          })}
        </Box>
      )}
    </Container>
  );
}
