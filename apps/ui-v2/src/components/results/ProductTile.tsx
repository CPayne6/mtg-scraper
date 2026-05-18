import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import AddShoppingCart from '@mui/icons-material/AddShoppingCart';
import CheckIcon from '@mui/icons-material/Check';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { useSnackbar } from 'notistack';
import type { CardWithStore } from '@scoutlgs/shared';
import { useCart, cartItemId } from '@/components/cart/CartContext';

const ART_GRADIENTS = [
  'linear-gradient(135deg, #1a3a2a 0%, #4a6741 60%, #2a4a3a 100%)',
  'linear-gradient(135deg, #5a1a1a 0%, #8a3a2a 60%, #3a1010 100%)',
  'linear-gradient(135deg, #2a2a4a 0%, #4a5a8a 60%, #1a1a3a 100%)',
  'linear-gradient(135deg, #3a2a4a 0%, #6a4a8a 60%, #2a1a3a 100%)',
  'linear-gradient(135deg, #4a3a1a 0%, #8a6a2a 60%, #3a2a10 100%)',
  'linear-gradient(135deg, #1a4a4a 0%, #3a8a8a 60%, #1a3a3a 100%)',
  'linear-gradient(135deg, #4a1a3a 0%, #8a2a6a 60%, #3a1028 100%)',
];

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

type Props = {
  card: CardWithStore;
  isCheapest?: boolean;
};

export function ProductTile({ card, isCheapest }: Props) {
  const { add, has } = useCart();
  const { enqueueSnackbar } = useSnackbar();
  const id = cartItemId(card);
  const inCart = has(id);

  const gradient = useMemo(() => {
    const key = card.scryfall_id ?? card.title ?? '';
    return ART_GRADIENTS[hashIndex(key, ART_GRADIENTS.length)];
  }, [card.scryfall_id, card.title]);

  const handleArtClick = () => {
    if (inCart) return;
    const added = add(card);
    if (added) {
      enqueueSnackbar(`Added "${card.title}" to cart`, { variant: 'default' });
    }
  };

  return (
    <Box
      sx={(theme) => ({
        bgcolor: 'background.paper',
        borderRadius: 1.5,
        boxShadow: theme.shadows[2],
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'transform 200ms, box-shadow 200ms',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: theme.shadows[3],
        },
      })}
    >
      <Box
        onClick={handleArtClick}
        role="button"
        aria-label={inCart ? `${card.title} in cart` : `Add ${card.title} to cart`}
        sx={{
          aspectRatio: '5 / 7',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          p: 1.5,
          background: gradient,
          '&:hover .add-overlay': { opacity: 1 },
        }}
      >
        {isCheapest && (
          <Box
            sx={(theme) => ({
              position: 'absolute',
              top: 10,
              right: 10,
              bgcolor: theme.palette.honey.main,
              color: '#3d2a14',
              fontSize: 10,
              fontWeight: 700,
              px: 1,
              py: 0.5,
              borderRadius: '999px',
              zIndex: 2,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            })}
          >
            Cheapest
          </Box>
        )}
        <Typography
          sx={{
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
            lineHeight: 1.2,
            position: 'relative',
            zIndex: 3,
          }}
        >
          {card.title}
        </Typography>

        <Box
          className="add-overlay"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
            background: inCart
              ? 'linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.22))'
              : 'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.35))',
            color: 'rgba(255,255,255,0.88)',
            opacity: inCart ? 1 : 0,
            transition: 'opacity 220ms',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <Box
            sx={{
              color: inCart ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.92)',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
              opacity: inCart ? 0.75 : 0.85,
              display: 'inline-flex',
            }}
          >
            {inCart ? <CheckIcon sx={{ fontSize: 26 }} /> : <AddShoppingCart sx={{ fontSize: 26 }} />}
          </Box>
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textShadow: '0 1px 4px rgba(0,0,0,0.55)',
              opacity: 0.85,
              color: 'rgba(255,255,255,0.92)',
            }}
          >
            {inCart ? 'In Cart' : 'Add to Cart'}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ p: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{card.store}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{card.set}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mt: 0.5 }}>
          <Typography
            sx={{
              fontWeight: 700,
              color: 'primary.main',
              fontSize: 17,
              letterSpacing: '-0.01em',
            }}
          >
            CA${(card.price ?? 0).toFixed(2)}
          </Typography>
          <Box component="span" sx={{ color: 'divider' }}>
            |
          </Box>
          <Typography sx={{ color: 'text.secondary', fontSize: 13, textTransform: 'uppercase' }}>
            {card.condition}
          </Typography>
        </Box>
        {card.link && (
          <Box
            component="a"
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 1,
              fontSize: '0.78rem',
              fontWeight: 500,
              color: 'primary.main',
              cursor: 'pointer',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            View at {card.store} <OpenInNew sx={{ fontSize: 13 }} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
