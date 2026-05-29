import type { SxProps, Theme } from '@mui/material/styles';

export const toolbarSx: SxProps<Theme> = {
  maxWidth: 1100,
  width: '100%',
  mx: 'auto',
  gap: 4,
  px: { xs: 2, md: 3 },
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
  bgcolor: active
    ? theme.palette.mode === 'dark'
      ? 'rgba(36,135,33,0.18)'
      : 'rgba(74,103,65,0.10)'
    : 'transparent',
  transition: 'background 200ms, color 200ms',
  '&:hover': {
    bgcolor:
      theme.palette.mode === 'dark'
        ? 'rgba(36,135,33,0.14)'
        : 'rgba(74,103,65,0.06)',
    color: active ? 'primary.main' : 'text.primary',
  },
});
