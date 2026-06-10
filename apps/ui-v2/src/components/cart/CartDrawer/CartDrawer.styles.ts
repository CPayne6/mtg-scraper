import type { SxProps, Theme } from '@mui/material/styles';

export const paperSx = (isMobile: boolean): SxProps<Theme> => ({
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  ...(isMobile
    ? {
        width: '100%',
        maxWidth: '100%',
        height: '85vh',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }
    : {
        width: 'min(420px, 100%)',
      }),
});

export const mobileHandleWrapSx: SxProps<Theme> = {
  display: 'flex',
  justifyContent: 'center',
  pt: 1,
  pb: 0.5,
  flexShrink: 0,
};

export const mobileHandleSx: SxProps<Theme> = (theme) => ({
  width: 36,
  height: 4,
  borderRadius: 2,
  bgcolor: theme.palette.divider,
});

export const headerSx = (isMobile: boolean): SxProps<Theme> => (theme) => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  px: 2.5,
  pt: isMobile ? 1.5 : 2.5,
  pb: 2.25,
  borderBottom: `1px solid ${theme.palette.divider}`,
  flexShrink: 0,
});

export const storeHeaderSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 1,
  mb: 1.5,
  py: 1,
  borderBottom: `1px dashed ${theme.palette.divider}`,
});

export const footerSx: SxProps<Theme> = (theme) => ({
  borderTop: `1px solid ${theme.palette.divider}`,
  bgcolor: 'background.default',
  px: 2.5,
  pt: 2,
  pb: 'calc(20px + env(safe-area-inset-bottom))',
  flexShrink: 0,
});
