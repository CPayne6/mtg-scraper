import type { SxProps, Theme } from '@mui/material/styles';

export const containerSx: SxProps<Theme> = (theme) => ({
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
});

export const artSx = (gradient: string): SxProps<Theme> => ({
  aspectRatio: '5 / 7',
  position: 'relative',
  display: 'flex',
  alignItems: 'flex-end',
  p: 1.5,
  background: gradient,
  overflow: 'hidden',
  '&:hover .add-overlay': { opacity: 1 },
});

export const cheapestBadgeSx: SxProps<Theme> = (theme) => ({
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
  zIndex: 3,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const overlaySx = (inCart: boolean): SxProps<Theme> => ({
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
  zIndex: 4,
});
