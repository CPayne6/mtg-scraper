import type { SxProps, Theme } from '@mui/material/styles';

export const toolbarSx: SxProps<Theme> = {
  maxWidth: 1100,
  width: '100%',
  mx: 'auto',
  gap: { xs: 1, sm: 2, md: 4 },
  px: { xs: 1.5, md: 3 },
  minHeight: 64,
};

export const navBtnSx = (active: boolean): SxProps<Theme> => (theme) => ({
  px: 1.75,
  py: 1,
  borderRadius: '8px',
  fontSize: 14,
  fontWeight: 500,
  minWidth: 0,
  whiteSpace: 'nowrap',
  color: active ? 'primary.main' : 'text.secondary',
  bgcolor: active ? theme.palette.primarySoft : 'transparent',
  transition: 'background 200ms, color 200ms',
  '&:hover': {
    bgcolor: theme.palette.primarySoftHover,
    color: active ? 'primary.main' : 'text.primary',
  },
});
