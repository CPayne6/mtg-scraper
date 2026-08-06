import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AddShoppingCart, Check as CheckIcon, Close, OpenInNew, VisibilityOutlined } from '@mui/icons-material';
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
  previewActionSx,
} from './StoreOfferTile.styles';

export function StoreOfferTile({
  offer,
  isCheapest = false,
  inCart,
  onAdd,
  onPreview,
  onHoverStart,
  onHoverEnd,
}: StoreOfferTileProps) {
  const condLabel = CONDITION_DISPLAY[offer.condition] ?? 'DMG';
  const hasLink = Boolean(offer.link && offer.link.trim().length > 0);
  const hasImage = Boolean(offer.image && offer.image.trim().length > 0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [isCartActionHovered, setIsCartActionHovered] = useState(false);
  const [isPreviewPinned, setIsPreviewPinned] = useState(false);

  const placeholderGradient = useMemo(
    () => gradientForCard(offer.scryfall_id ?? offer.title ?? offer.store_key),
    [offer.scryfall_id, offer.title, offer.store_key],
  );

  const showImage = hasImage && !imageFailed;
  const condVisual = useMemo(() => getCondVisual(condLabel, true), [condLabel]);

  return (
    <Box
      className={isPreviewPinned ? 'previewing' : undefined}
      onMouseEnter={onHoverStart}
      onMouseLeave={() => {
        setIsPreviewPinned(false);
        onHoverEnd?.();
      }}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      sx={tileContainerSx(placeholderGradient)}
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

      {onPreview && (
        <Box
          component="button"
          type="button"
          aria-label={`Preview artwork for ${offer.title}`}
          onClick={onPreview}
          sx={{
            display: 'none', position: 'absolute', inset: 0,
            bottom: '42%', zIndex: 3, border: 0, background: 'transparent', cursor: 'zoom-in',
            '@media (hover: none), (pointer: coarse)': { display: 'block' },
            '&:focus-visible': { outline: '3px solid #fff', outlineOffset: -3 },
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      )}

      <Box
        component="button"
        className="preview-action"
        type="button"
        aria-label={`Preview the full card art for ${offer.title}`}
        title="Preview full card art"
        aria-pressed={isPreviewPinned}
        onClick={() => setIsPreviewPinned((value) => !value)}
        sx={previewActionSx}
      >
        <VisibilityOutlined sx={{ fontSize: 16 }} />
      </Box>

      <Box
        component="button"
        className="cart-action"
        type="button"
        aria-label={inCart ? `Remove ${offer.title} from cart` : `Add ${offer.title} to cart`}
        onClick={onAdd}
        onMouseEnter={() => setIsCartActionHovered(true)}
        onMouseLeave={() => setIsCartActionHovered(false)}
        onFocus={() => setIsCartActionHovered(true)}
        onBlur={() => setIsCartActionHovered(false)}
        sx={{ position: 'relative', gridRow: 1, justifySelf: 'stretch', width: '100%', minWidth: 0, boxSizing: 'border-box', zIndex: 4, border: 0, background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: inCart ? 1 : 0, transition: 'opacity 160ms ease', '@media (hover: none), (pointer: coarse)': { display: 'none' }, '@media (hover: hover) and (pointer: fine)': { '&:hover, &:focus-visible': { opacity: 1, outline: 'none' } }, '&:focus-visible': { opacity: 1, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.8)' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, px: 1.5, py: 1 }}>
          {inCart ? (
            isCartActionHovered ? <Close sx={{ fontSize: 28, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }} /> : <CheckIcon sx={{ fontSize: 26, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }} />
          ) : <AddShoppingCart sx={{ fontSize: 26, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }} />}
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.55)' }}>
            {inCart ? (isCartActionHovered ? 'Remove from Cart' : 'In Cart') : 'Add to Cart'}
          </Typography>
        </Box>
      </Box>

      <Box className="cart-gradient" aria-hidden="true" sx={gradientOverlaySx(inCart)} />

      <Box className="offer-details" sx={contentOverlaySx}>
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
          <Box
            component="button"
            type="button"
            aria-label={inCart ? `Remove ${offer.title} from cart` : `Add ${offer.title} to cart`}
            onClick={onAdd}
            sx={(theme) => ({
              display: 'none', minHeight: 44, alignItems: 'center', gap: 0.5,
              '@media (hover: none), (pointer: coarse)': { display: 'inline-flex' },
              px: 1, border: 0, borderRadius: 1, bgcolor: inCart ? 'rgba(0,0,0,0.38)' : theme.palette.primary.main,
              color: '#fff', font: 'inherit', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
              '&:active': { transform: 'scale(0.96)', filter: 'brightness(0.9)' },
              '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2 },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            })}
          >
            {inCart ? <Close sx={{ fontSize: 18 }} /> : <AddShoppingCart sx={{ fontSize: 17 }} />}
            {inCart ? 'Remove' : 'Add to cart'}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
