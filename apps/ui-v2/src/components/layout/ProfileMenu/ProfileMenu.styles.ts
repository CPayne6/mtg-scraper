import type { SxProps, Theme } from '@mui/material/styles';

export const triggerBtnSx: SxProps<Theme> = {
  width: 38,
  height: 38,
  p: 0,
  border: '1px solid',
  borderColor: 'primary.main',
  bgcolor: 'primary.main',
  color: '#fff',
  transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': { bgcolor: 'primary.dark', transform: 'translateY(-1px)' },
};

export const triggerAvatarSx: SxProps<Theme> = {
  width: '100%',
  height: '100%',
  bgcolor: 'transparent',
  color: '#fff',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.02em',
};

export const headerAvatarSx: SxProps<Theme> = {
  width: 40,
  height: 40,
  bgcolor: 'primary.main',
  color: '#fff',
  fontSize: '1rem',
  fontWeight: 700,
};

export const countBadgeSx: SxProps<Theme> = (theme) => ({
  px: 1,
  py: '1px',
  borderRadius: '999px',
  bgcolor: theme.palette.honey.light,
  color: theme.palette.honey.dark,
  fontSize: '0.7rem',
  fontWeight: 600,
});
