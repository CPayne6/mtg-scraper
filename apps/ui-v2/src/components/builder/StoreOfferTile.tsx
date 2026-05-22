import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import OpenInNew from '@mui/icons-material/OpenInNew';
import type { CardWithStore, Condition } from '@scoutlgs/shared';
import { gradientForCard } from '@/utils/cardGradient';

type Props = {
  offer: CardWithStore;
  isCheapest?: boolean;
  inCart: boolean;
  onAdd: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
};

type CondVisual = {
  label: string;
  bg: string;
  fg: string;
  border: string;
};

const CONDITION_DISPLAY: Record<Condition, string> = {
  nm: 'NM',
  pl: 'LP',
  mp: 'MP',
  hp: 'HP',
  unknown: 'DMG',
};

const CONDITION_TOOLTIP: Record<string, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

function getCondVisual(label: string, isDark: boolean): CondVisual {
  if (isDark) {
    switch (label) {
      case 'NM':
        return {
          label,
          bg: 'rgba(110, 231, 183, 0.14)',
          fg: '#6ee7b7',
          border: 'rgba(110, 231, 183, 0.30)',
        };
      case 'LP':
        return {
          label,
          bg: 'rgba(102, 204, 255, 0.16)',
          fg: '#9cd0ff',
          border: 'rgba(102, 204, 255, 0.32)',
        };
      case 'MP':
        return {
          label,
          bg: 'rgba(255, 167, 38, 0.16)',
          fg: '#ffb86b',
          border: 'rgba(255, 167, 38, 0.32)',
        };
      case 'HP':
        return {
          label,
          bg: 'rgba(255, 99, 99, 0.16)',
          fg: '#ff9b9b',
          border: 'rgba(255, 99, 99, 0.32)',
        };
      default:
        return {
          label: 'DMG',
          bg: 'rgba(180, 180, 180, 0.14)',
          fg: '#b0b0b0',
          border: 'rgba(180, 180, 180, 0.32)',
        };
    }
  }
  switch (label) {
    case 'NM':
      return {
        label,
        bg: 'rgba(36, 135, 33, 0.14)',
        fg: '#2a6a27',
        border: 'rgba(36, 135, 33, 0.30)',
      };
    case 'LP':
      return {
        label,
        bg: 'rgba(2, 136, 209, 0.12)',
        fg: '#0a5b8a',
        border: 'rgba(2, 136, 209, 0.30)',
      };
    case 'MP':
      return {
        label,
        bg: 'rgba(237, 108, 2, 0.14)',
        fg: '#94440b',
        border: 'rgba(237, 108, 2, 0.32)',
      };
    case 'HP':
      return {
        label,
        bg: 'rgba(211, 47, 47, 0.12)',
        fg: '#962323',
        border: 'rgba(211, 47, 47, 0.32)',
      };
    default:
      return {
        label: 'DMG',
        bg: 'rgba(80, 80, 80, 0.14)',
        fg: '#444',
        border: 'rgba(80, 80, 80, 0.32)',
      };
  }
}

// Bottom-of-tile gradient that fades the card art into a dark band so the
// store/price/condition text reads cleanly over any printing. Starts fading
// near the middle of the card and is fully opaque at the bottom.
const OVERLAY_GRADIENT =
  'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.88) 70%, rgba(0,0,0,0.98) 88%, rgba(0,0,0,1) 100%)';

export function StoreOfferTile({
  offer,
  isCheapest = false,
  inCart,
  onAdd,
  onHoverStart,
  onHoverEnd,
}: Props) {
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

  return (
    <Box
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      sx={(theme) => ({
        position: 'relative',
        // Real Magic card aspect ratio (2.5" x 3.5" = 5/7). The text content
        // overlays the lower half of the card via the gradient.
        aspectRatio: '5 / 7',
        background: placeholderGradient,
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${
          isCheapest ? theme.palette.primary.main : theme.palette.divider
        }`,
        transition:
          'border-color 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          borderColor: theme.palette.primary.main,
          boxShadow: theme.shadows[3],
          transform: 'translateY(-1px)',
        },
      })}
    >
      {/* Card art — fades in once loaded; placeholder gradient shows underneath
          until then (and stays put if the image fails to load). */}
      {showImage && (
        <Box
          component="img"
          src={offer.image}
          alt={`${offer.title} — ${offer.set}`}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center top',
            zIndex: 0,
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 180ms ease-in-out',
          }}
        />
      )}

      {/* Bottom-fade gradient for text contrast */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          background: OVERLAY_GRADIENT,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {isCheapest && (
        <Box
          component="span"
          sx={(theme) => ({
            position: 'absolute',
            top: 10,
            right: 10,
            background: theme.palette.primary.main,
            color: '#fff',
            fontSize: '10px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 999,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            zIndex: 3,
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          })}
        >
          Cheapest
        </Box>
      )}

      {/* Content overlay */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 2,
          marginTop: 'auto',
          padding: '12px 12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          color: '#fff',
        }}
      >
        <Typography
          sx={{
            fontSize: '14px',
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.7)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {offer.store}
        </Typography>

        <Typography
          title={offer.set || ''}
          sx={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.72)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          {offer.set || '—'}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', mt: '2px' }}>
          <Typography
            sx={{
              fontSize: '22px',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: '#fff',
              textShadow: '0 1px 3px rgba(0,0,0,0.7)',
              lineHeight: 1.1,
            }}
          >
            CA${offer.price.toFixed(2)}
          </Typography>
          <Box
            component="span"
            title={CONDITION_TOOLTIP[condLabel]}
            sx={(theme) => {
              const v = getCondVisual(condLabel, true);
              return {
                fontSize: '10px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                letterSpacing: '0.06em',
                border: `1px solid ${v.border}`,
                background: v.bg,
                color: v.fg,
                flexShrink: 0,
                backdropFilter: 'blur(2px)',
                // Re-reference theme to keep the type signature happy.
                outline: `0px solid ${theme.palette.divider}`,
              };
            }}
          >
            {condLabel}
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: '6px',
          }}
        >
          <Box
            component="a"
            href={hasLink ? offer.link : undefined}
            target={hasLink ? '_blank' : undefined}
            rel={hasLink ? 'noopener noreferrer' : undefined}
            onClick={(e: React.MouseEvent) => {
              if (!hasLink) e.preventDefault();
              e.stopPropagation();
            }}
            sx={{
              fontSize: '12px',
              fontWeight: 600,
              color: hasLink ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: hasLink ? 'pointer' : 'default',
              pointerEvents: hasLink ? 'auto' : 'none',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
              '&:hover': { textDecoration: hasLink ? 'underline' : 'none' },
            }}
          >
            View <OpenInNew sx={{ fontSize: 12 }} />
          </Box>
          {inCart ? (
            <Box
              component="span"
              sx={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(110, 231, 183, 0.45)',
                background: 'rgba(36,135,33,0.30)',
                color: '#a5e8a3',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'default',
                userSelect: 'none',
                backdropFilter: 'blur(2px)',
              }}
            >
              {'✓ In Cart'}
            </Box>
          ) : (
            <Box
              component="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              sx={(theme) => ({
                padding: '6px 14px',
                borderRadius: '8px',
                border: 0,
                background: theme.palette.primary.main,
                color: '#fff',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                transition: 'background 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  background:
                    theme.palette.mode === 'dark' ? '#1f7a1c' : '#3a5333',
                },
              })}
            >
              Add to cart
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
