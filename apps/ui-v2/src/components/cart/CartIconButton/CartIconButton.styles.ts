import type { SxProps, Theme } from '@mui/material/styles';

export const buttonSx: SxProps<Theme> = (theme) => ({
  position: 'relative',
  width: 38,
  height: 38,
  borderRadius: '10px',
  border: `1px solid ${theme.palette.divider}`,
  color: 'text.secondary',
  transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    color: 'primary.main',
    borderColor: 'primary.main',
    bgcolor: theme.palette.primarySoftHover,
  },
});

export const badgeSx: SxProps<Theme> = (theme) => ({
  position: 'absolute',
  top: -4,
  right: -4,
  minWidth: 18,
  height: 18,
  px: '5px',
  borderRadius: '999px',
  bgcolor: theme.palette.honey.main,
  color: '#fff',
  fontSize: '0.66rem',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `2px solid ${theme.palette.background.paper}`,
});
