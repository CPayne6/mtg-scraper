import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import { Add } from '@mui/icons-material';
import { useLists } from '@/components/lists/ListsContext';
import { DeckCard } from '@/components/lists/DeckCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useConfirm } from '@/components/feedback/ConfirmDialog';
import { DECK_META } from '@/data/sample';
import { getListColorIdentity } from '@/components/lists/colorIdentity';
import { slugifyName } from '@/utils/slugify';

export const Route = createFileRoute('/lists')({
  component: ListsRoute,
});

function ListsRoute() {
  const navigate = useNavigate();
  const { count, totalCards, lists, remove, loading, error } = useLists();
  const confirm = useConfirm();

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      const ok = await confirm({
        title: `Delete ${name}?`,
        description: 'This removes the list from your account. This action cannot be undone.',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (ok) await remove(id);
    },
    [confirm, remove],
  );

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

      {loading ? (
        <Box sx={{ mb: 3 }}>
          <LinearProgress
            sx={{
              height: 4,
              borderRadius: 999,
              bgcolor: (theme) => theme.palette.primarySoft,
              '& .MuiLinearProgress-bar': { bgcolor: 'primary.main' },
            }}
          />
          <Typography sx={{ mt: 1, fontSize: '0.875rem', color: 'text.secondary' }}>
            Loading card lists...
          </Typography>
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ borderRadius: 1.5 }}>
          {error}
        </Alert>
      ) : count === 0 ? (
        <EmptyState
          title="No lists yet"
          description="Upload a list or paste one from Arena / MTGO and we'll scout available offers."
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
          {lists.map((list) => {
            const meta = DECK_META[list.name] ?? { archetype: 'Custom', updated: 'recently' };
            const identity = getListColorIdentity(list.cardRecords);
            return (
              <DeckCard
                key={list.id}
                name={list.name}
                colors={identity.colors}
                archetype={meta.archetype}
                count={list.cards.length}
                updated={meta.updated}
                onOpen={() =>
                  navigate({
                    to: '/list/$listId/$slug',
                    params: { listId: list.id, slug: slugifyName(list.name) },
                  })
                }
                onDelete={() => handleDelete(list.id, list.name)}
              />
            );
          })}
        </Box>
      )}
    </Container>
  );
}
