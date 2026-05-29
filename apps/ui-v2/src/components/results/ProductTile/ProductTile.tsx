import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import AddShoppingCart from '@mui/icons-material/AddShoppingCart';
import CheckIcon from '@mui/icons-material/Check';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { useSnackbar } from 'notistack';
import { useCart, cartItemId } from '@/components/cart/CartContext';
import { gradientForCard } from '@/utils/cardGradient';
import type { ProductTileProps } from './ProductTile.types';
import { containerSx, artSx, cheapestBadgeSx, overlaySx } from './ProductTile.styles';

export function ProductTile({ card, isCheapest }: ProductTileProps) {
  const { add, has } = useCart();
  const { enqueueSnackbar } = useSnackbar();
  const id = cartItemId(card);
  const inCart = has(id);
  const [imageFailed, setImageFailed] = useState(false);

  const gradient = useMemo(
    () => gradientForCard(card.scryfall_id ?? card.title ?? ''),
    [card.scryfall_id, card.title],
  );

  const imageUrl = !imageFailed && card.image ? card.image : undefined;

  const handleArtClick = () => {
    if (inCart) return;
    const added = add(card);
    if (added) {
      enqueueSnackbar(`Added "${card.title}" to cart`, { variant: 'default' });
    }
  };

  return (
    <Box sx={containerSx}>
      <Box
        onClick={handleArtClick}
        role="button"
        aria-label={inCart ? `${card.title} in cart` : `Add ${card.title} to cart`}
        sx={artSx(gradient)}
      >
        {imageUrl && (
          <Box
            component="img"
            src={imageUrl}
            alt={`${card.title} from ${card.set}`}
            loading="lazy"
            onError={() => setImageFailed(true)}
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 1,
            }}
          />
        )}
        {isCheapest && <Box sx={cheapestBadgeSx}>Cheapest</Box>}
        {!imageUrl && (
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
        )}

        <Box className="add-overlay" aria-hidden="true" sx={overlaySx(inCart)}>
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
