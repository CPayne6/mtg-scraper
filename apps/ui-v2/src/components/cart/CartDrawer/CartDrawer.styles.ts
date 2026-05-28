import type { SxProps, Theme } from '@mui/material/styles';

export const paperSx: SxProps<Theme> = {
  width: 'min(420px, 100vw)',
  display: 'flex',
  flexDirection: 'column',
};

export const headerSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  px: 2.5,
  pt: 2.5,
  pb: 1.75,
  borderBottom: `1px solid ${theme.palette.divider}`,
});

export const storeHeaderSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  mb: 1,
  py: 0.75,
  borderBottom: `1px dashed ${theme.palette.divider}`,
});

export const footerSx: SxProps<Theme> = (theme) => ({
  borderTop: `1px solid ${theme.palette.divider}`,
  bgcolor: 'background.default',
  px: 2.5,
  pt: 1.75,
  pb: 2.25,
});
