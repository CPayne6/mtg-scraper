import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import OpenInNew from '@mui/icons-material/OpenInNew';
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
  inCartChipSx,
  addToCartBtnSx,
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

      <Box aria-hidden="true" sx={gradientOverlaySx} />

      {isCheapest && (
        <Box component="span" sx={cheapestBadgeSx}>
          Cheapest
        </Box>
      )}

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

          {inCart ? (
            <Box component="span" sx={inCartChipSx}>
              ✓ In Cart
            </Box>
          ) : (
            <Box
              component="button"
              type="button"
              aria-label={`Add ${offer.title} from ${offer.store} to cart`}
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              sx={addToCartBtnSx}
            >
              Add to Cart
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
