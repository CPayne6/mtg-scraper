import type { SxProps, Theme } from '@mui/material/styles';
import type { CondVisual } from './StoreOfferTile.types';

// Bottom-of-tile gradient that fades the card art into a dark band so the
// store/price/condition text reads cleanly over any printing.
export const OVERLAY_GRADIENT =
  'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.88) 70%, rgba(0,0,0,0.98) 88%, rgba(0,0,0,1) 100%)';
export const ACTIVE_OVERLAY_GRADIENT =
  'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.2) 18%, rgba(0,0,0,0.5) 42%, rgba(0,0,0,0.82) 63%, rgba(0,0,0,0.97) 83%, rgba(0,0,0,1) 100%)';

export const tileContainerSx = (
  isCheapest: boolean,
  placeholderGradient: string,
): SxProps<Theme> => (theme) => ({
  position: 'relative',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  // Real Magic card aspect ratio (2.5" x 3.5" = 5/7). The text content
  // overlays the lower half of the card via the gradient.
  aspectRatio: '5 / 7',
  background: placeholderGradient,
  borderRadius: '12px',
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  border: 0,
  boxShadow: isCheapest
    ? `0 0 0 2px ${theme.palette.primary.main}, ${theme.palette.mode === 'dark'
      ? '0 6px 18px rgba(0, 0, 0, 0.55)'
      : '0 6px 16px rgba(15, 23, 42, 0.22)'}`
    : theme.palette.mode === 'dark'
      ? '0 6px 18px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08)'
      : '0 6px 16px rgba(15, 23, 42, 0.22), 0 1px 0 rgba(255, 255, 255, 0.45)',
  transition:
    'box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    boxShadow: `0 0 0 2px ${theme.palette.primary.main}, ${theme.palette.mode === 'dark'
      ? '0 10px 24px rgba(0, 0, 0, 0.65)'
      : '0 10px 22px rgba(15, 23, 42, 0.28)'}`,
    transform: 'translateY(-2px)',
  },
  '& .cart-action:hover ~ .cart-gradient, & .cart-action:focus-visible ~ .cart-gradient': {
    background: ACTIVE_OVERLAY_GRADIENT,
  },
  '&:focus-within': {
    boxShadow: `0 0 0 2px ${theme.palette.primary.main}, ${theme.palette.mode === 'dark'
      ? '0 10px 24px rgba(0, 0, 0, 0.65)'
      : '0 10px 22px rgba(15, 23, 42, 0.28)'}`,
  },
});

export const imgSx = (imageLoaded: boolean): SxProps<Theme> => ({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center top',
  zIndex: 0,
  opacity: imageLoaded ? 1 : 0,
  transition: 'opacity 180ms ease-in-out',
});

export const gradientOverlaySx = (active: boolean): SxProps<Theme> => ({
  position: 'absolute',
  inset: 0,
  background: active ? ACTIVE_OVERLAY_GRADIENT : OVERLAY_GRADIENT,
  transition: 'background 180ms ease',
  zIndex: 1,
  pointerEvents: 'none',
});

export const cheapestBadgeSx: SxProps<Theme> = (theme) => ({
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
});

export const contentOverlaySx: SxProps<Theme> = {
  position: 'relative',
  zIndex: 2,
  gridRow: 2,
  minWidth: 0,
  padding: '12px 12px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  color: '#fff',
};

export const storeNameSx: SxProps<Theme> = {
  fontSize: '14px',
  fontWeight: 700,
  color: '#fff',
  textShadow: '0 1px 3px rgba(0,0,0,0.7)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export const setNameSx: SxProps<Theme> = {
  fontSize: '11px',
  color: 'rgba(255,255,255,0.72)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
};

export const priceSx: SxProps<Theme> = {
  fontSize: '22px',
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
  color: '#fff',
  textShadow: '0 1px 3px rgba(0,0,0,0.7)',
  lineHeight: 1.1,
};

export function condBadgeSx(v: CondVisual): SxProps<Theme> {
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
  };
}

export const actionRowSx: SxProps<Theme> = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  mt: '6px',
};

export const viewLinkSx = (hasLink: boolean): SxProps<Theme> => ({
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
  '&:focus-visible': { outline: '2px solid rgba(255,255,255,0.6)', outlineOffset: 2, borderRadius: 2 },
});

export const inCartChipSx: SxProps<Theme> = {
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
};

export const addToCartBtnSx: SxProps<Theme> = (theme) => ({
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
    background: theme.palette.primary.dark,
  },
  '&:focus-visible': {
    outline: '2px solid #fff',
    outlineOffset: 2,
  },
});
