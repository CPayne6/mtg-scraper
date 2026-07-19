import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { fetchScryfallCard } from '@/api/cards';

export const Route = createFileRoute('/card/$name')({
  component: LegacyCardRoute,
});

function LegacyCardRoute() {
  const navigate = useNavigate();
  const { name } = Route.useParams();

  useEffect(() => {
    const controller = new AbortController();
    let cardName = name;
    try {
      cardName = decodeURIComponent(name);
    } catch {
      // The route parameter is still usable if it was not valid URI encoding.
    }

    void fetchScryfallCard(cardName, controller.signal)
      .then((card) =>
        navigate({
          to: '/card/$oracleId/$name',
          params: { oracleId: card.oracleId, name: card.name },
          replace: true,
        }),
      )
      .catch(() => undefined);

    return () => controller.abort();
  }, [name, navigate]);

  return (
    <Box sx={{ minHeight: '50vh', display: 'grid', placeItems: 'center', gap: 1 }}>
      <CircularProgress size={28} />
      <Typography variant="body2" color="text.secondary">
        Looking up card…
      </Typography>
    </Box>
  );
}
