import type { SxProps, Theme } from '@mui/material/styles';
import { ROW_GRADIENT } from './CardListRow.utils';

export const containerSx: SxProps<Theme> = {
  position: 'relative',
  height: 46,
  mb: '4px',
  borderRadius: '6px',
  overflow: 'hidden',
  cursor: 'pointer',
  bgcolor: '#161616',
  transition:
    'transform 120ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  isolation: 'isolate',
  '&:hover': { transform: 'translateX(2px)' },
  '&:hover .row-remove-btn, &:focus-within .row-remove-btn': {
    opacity: 1,
  },
};

export const gradientOverlaySx: SxProps<Theme> = {
  position: 'absolute',
  inset: 0,
  background: ROW_GRADIENT,
};

/**
 * Selection must be a layer above the card art: an inset shadow on the row
 * itself is obscured by the absolutely positioned art image.
 */
export const selectedHighlightSx: SxProps<Theme> = (theme) => ({
  position: 'absolute',
  inset: 0,
  // Deliberately above all row layers, including the artwork and text. The
  // frame has no hit target, so it cannot affect selecting/removing a card.
  zIndex: 4,
  pointerEvents: 'none',
  borderRadius: 'inherit',
  boxSizing: 'border-box',
  border: `2px solid ${theme.palette.honey.main}`,
  background: `linear-gradient(90deg, ${theme.palette.honey.main}2e, ${theme.palette.honey.main}12 58%, transparent)`,
  boxShadow: `inset 0 0 12px ${theme.palette.honey.main}88`,
});

export const innerSx: SxProps<Theme> = {
  position: 'relative',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  padding: '0 42px 0 14px',
  zIndex: 2,
};

export const nameSx: SxProps<Theme> = {
  color: '#fff',
  fontWeight: 600,
  fontSize: '13px',
  letterSpacing: '-0.005em',
  textShadow: '0 1px 3px rgba(0, 0, 0, 0.7)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export const inCartBadgeSx: SxProps<Theme> = (theme) => ({
  position: 'absolute',
  top: '50%',
  right: 8,
  transform: 'translateY(-50%)',
  width: 26,
  height: 26,
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'not-allowed',
  color: '#fff',
  zIndex: 3,
  background: theme.palette.primary.main,
  boxShadow: `0 0 0 2px ${theme.palette.onImageOutline}`,
});

export const removeBtnSx: SxProps<Theme> = {
  position: 'absolute',
  top: '50%',
  right: 8,
  transform: 'translateY(-50%)',
  width: 26,
  height: 26,
  padding: 0,
  borderRadius: '6px',
  background: 'rgba(0,0,0,0.45)',
  color: 'rgba(255,255,255,0.9)',
  opacity: 0.85,
  zIndex: 3,
  transition:
    'opacity 120ms cubic-bezier(0.4, 0, 0.2, 1), background 120ms cubic-bezier(0.4, 0, 0.2, 1), color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    opacity: 1,
    background: 'rgba(180, 40, 40, 0.85)',
    color: '#fff',
  },
};
