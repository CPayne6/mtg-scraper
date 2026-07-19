import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { OpenInNew, AddShoppingCart, Check as CheckIcon } from '@mui/icons-material';
import { gradientForCard } from '@/utils/cardGradient';
import type { StoreOfferTileProps } from './StoreOfferTile.types';
import { CONDITION_DISPLAY, CONDITION_TOOLTIP, getCondVisual } from './StoreOfferTile.utils';
import {
  tileContainerSx,
  imgSx,
  gradientOverlaySx,
  cheapestBadgeSx,
  contentOverlaySx,
  storeNameSx,
  setNameSx,
  priceSx,
  condBadgeSx,
  actionRowSx,
  viewLinkSx,
} from './StoreOfferTile.styles';

export function StoreOfferTile({
  offer,
  isCheapest = false,
  inCart,
  onAdd,
  onHoverStart,
  onHoverEnd,
}: StoreOfferTileProps) {
  const condLabel = CONDITION_DISPLAY[offer.condition] ?? 'DMG';
  const hasLink = Boolean(offer.link && offer.link.trim().length > 0);
  const hasImage = Boolean(offer.image && offer.image.trim().length > 0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const placeholderGradient = useMemo(
    () => gradientForCard(offer.scryfall_id ?? offer.title ?? offer.store_key),
    [offer.scryfall_id, offer.title, offer.store_key],
  );

  const showImage = hasImage && !imageFailed;
  const condVisual = useMemo(() => getCondVisual(condLabel, true), [condLabel]);

  return (
    <Box
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      sx={tileContainerSx(isCheapest, placeholderGradient)}
    >
      {showImage && (
        <Box
          component="img"
          src={offer.image}
          alt={`${offer.title} — ${offer.set}`}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
          sx={imgSx(imageLoaded)}
        />
      )}

      {isCheapest && (
        <Box component="span" sx={cheapestBadgeSx}>
          Cheapest
        </Box>
      )}

      <Box
        component="button"
        className="cart-action"
        type="button"
        disabled={inCart}
        aria-label={inCart ? `${offer.title} in cart` : `Add ${offer.title} to cart`}
        onClick={onAdd}
        sx={{ position: 'relative', gridRow: 1, justifySelf: 'stretch', width: '100%', minWidth: 0, boxSizing: 'border-box', zIndex: 4, border: 0, background: 'transparent', color: '#fff', cursor: inCart ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: inCart ? 1 : 0, transition: 'opacity 160ms ease', '&:hover, &:focus-visible': { opacity: 1, outline: 'none' }, '&:focus-visible': { boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.8)' }, '&:disabled': { pointerEvents: 'auto' } }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, px: 1.5, py: 1 }}>
          {inCart ? <CheckIcon sx={{ fontSize: 26, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }} /> : <AddShoppingCart sx={{ fontSize: 26, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }} />}
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.55)' }}>{inCart ? 'In Cart' : 'Add to Cart'}</Typography>
        </Box>
      </Box>

      <Box className="cart-gradient" aria-hidden="true" sx={gradientOverlaySx(inCart)} />

      <Box sx={contentOverlaySx}>
        <Typography sx={storeNameSx}>{offer.store}</Typography>

        <Typography title={offer.set || ''} sx={setNameSx}>
          {offer.set || '—'}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', mt: '2px' }}>
          <Typography sx={priceSx}>CA${offer.price.toFixed(2)}</Typography>
          <Box component="span" title={CONDITION_TOOLTIP[condLabel]} sx={condBadgeSx(condVisual)}>
            {condLabel}
          </Box>
        </Box>

        <Box sx={actionRowSx}>
          <Box
            component="a"
            href={hasLink ? offer.link : undefined}
            target={hasLink ? '_blank' : undefined}
            rel={hasLink ? 'noopener noreferrer' : undefined}
            // Stop the click bubbling to the tile's containers; pointerEvents
            // already blocks navigation when there is no link.
            onClick={(e) => e.stopPropagation()}
            sx={viewLinkSx(hasLink)}
          >
            View <OpenInNew sx={{ fontSize: 12 }} />
          </Box>

        </Box>
      </Box>
    </Box>
  );
}
