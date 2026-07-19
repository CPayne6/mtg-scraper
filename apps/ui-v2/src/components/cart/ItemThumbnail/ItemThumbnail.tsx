import { forwardRef, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { formatCartItemName, type CartItem } from '@/components/cart/CartContext';
import { gradientForCard } from '@/utils/cardGradient';

/**
 * Larger preview rendered above the row on hover. Same image / gradient /
 * name-overlay logic as the inline thumbnail, scaled up so the user can
 * actually read the card art. Portal-rendered by MUI Tooltip so it floats
 * outside the row's stacking context.
 */
export function CardPreview({ item }: { item: CartItem }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const gradient = useMemo(
    () => gradientForCard(item.scryfall_id ?? item.title ?? ''),
    [item.scryfall_id, item.title],
  );
  const hasImage = Boolean(item.image) && !failed;
  const showFallback = !hasImage || !loaded;
  const displayName = formatCartItemName(item);

  return (
    <Box
      sx={{
        width: 220,
        height: 308,
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
        background: gradient,
        boxShadow: '0 16px 36px rgba(0,0,0,0.55)',
      }}
    >
      {hasImage && (
        <Box
          component="img"
          src={item.image}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 1.5,
          textAlign: 'center',
          opacity: showFallback ? 1 : 0,
          transition: 'opacity 200ms ease',
          pointerEvents: 'none',
        }}
      >
        <Typography
          sx={{
            fontSize: '1rem',
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 2px 6px rgba(0,0,0,0.75)',
            lineHeight: 1.3,
          }}
        >
          {displayName}
        </Typography>
      </Box>
    </Box>
  );
}

type CartThumbnailProps = {
  item: CartItem;
  width?: number;
  height?: number;
};

/**
 * Compact card thumbnail used inline in cart item rows. Uses a gradient
 * placeholder while the image loads or as a permanent fallback, with the
 * card name overlaid so the row still identifies the item visually.
 * forwardRef so MUI Tooltip can attach its listeners to the underlying Box.
 */
export const CartThumbnail = forwardRef<HTMLDivElement, CartThumbnailProps>(function CartThumbnail(
  { item, width = 44, height = 60, ...rest },
  ref,
) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const gradient = useMemo(
    () => gradientForCard(item.scryfall_id ?? item.title ?? ''),
    [item.scryfall_id, item.title],
  );
  const hasImage = Boolean(item.image) && !failed;
  const showFallback = !hasImage || !loaded;
  const displayName = formatCartItemName(item);

  // Scale the fallback font size relative to the default 44px width.
  const fontSize = `${(0.55 * width) / 44}rem`;

  return (
    <Box
      ref={ref}
      {...rest}
      role="img"
      aria-label={displayName}
      sx={{
        width,
        height,
        flexShrink: 0,
        borderRadius: 0.25,
        overflow: 'hidden',
        position: 'relative',
        background: gradient,
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }}
    >
      {hasImage && (
        <Box
          component="img"
          src={item.image}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 0.5,
          textAlign: 'center',
          opacity: showFallback ? 1 : 0,
          transition: 'opacity 200ms ease',
          pointerEvents: 'none',
        }}
      >
        <Typography
          sx={{
            fontSize,
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.75)',
            lineHeight: 1.1,
            letterSpacing: '0.005em',
          }}
        >
          {displayName}
        </Typography>
      </Box>
    </Box>
  );
});
