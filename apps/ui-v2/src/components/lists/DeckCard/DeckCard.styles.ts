import type { SxProps, Theme } from '@mui/material/styles';

export const containerSx = (gradient: string): SxProps<Theme> => (theme) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  p: '18px 20px',
  borderRadius: 2,
  border: `1px solid ${theme.palette.divider}`,
  cursor: 'pointer',
  overflow: 'hidden',
  isolation: 'isolate',
  transition: 'transform 200ms, box-shadow 200ms, border-color 200ms',
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: gradient,
    opacity: theme.palette.mode === 'dark' ? 0.1 : 0.06,
    zIndex: -1,
    pointerEvents: 'none',
  },
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows[3],
    borderColor: theme.palette.primary.main,
  },
  '&:hover .deck-card-more': { opacity: 1 },
});

export const deleteBtnSx: SxProps<Theme> = {
  width: 26,
  height: 26,
  opacity: 0,
  transition: 'opacity 200ms, background 200ms, color 200ms',
  '&:hover': { color: 'error.main', bgcolor: 'rgba(244,67,54,0.10)' },
};

export const titleSx: SxProps<Theme> = {
  fontSize: '1.1rem',
  fontWeight: 700,
  letterSpacing: '-0.005em',
  m: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const footerSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  pt: 1.5,
  borderTop: `1px solid ${theme.palette.divider}`,
  fontSize: '0.74rem',
});
