import type { SxProps, Theme } from '@mui/material/styles';

export const containerSx: SxProps<Theme> = (theme) => ({
  display: 'grid',
  gridTemplateColumns: {
    xs: '32px 1fr auto 32px',
    sm: '40px 1fr 110px 150px 36px 36px',
  },
  alignItems: 'center',
  gap: { xs: 1.25, sm: 1.75 },
  py: 1.5,
  px: { xs: 1.5, sm: 2 },
  borderRadius: 1.5,
  bgcolor: 'background.paper',
  boxShadow: theme.shadows[1],
  transition: 'background 200ms',
  '&:hover': {
    bgcolor: theme.palette.primarySoftHover,
  },
});

export const qtyBadgeSx: SxProps<Theme> = (theme) => ({
  width: { xs: 28, sm: 32 },
  height: { xs: 28, sm: 32 },
  bgcolor: theme.palette.primarySoft,
  color: 'primary.main',
  borderRadius: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: { xs: 12, sm: 13 },
});

export const cardNameButtonSx = (enabled: boolean): SxProps<Theme> => (theme) => ({
  display: 'block',
  width: '100%',
  p: 0,
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontWeight: 500,
  fontSize: { xs: 14, sm: 15 },
  textAlign: 'left',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  cursor: enabled ? 'pointer' : 'default',
  '&:hover': enabled
    ? {
        color: theme.palette.primary.main,
        textDecoration: 'underline',
        textUnderlineOffset: '3px',
      }
    : {},
});

export const cartStatusSx: SxProps<Theme> = (theme) => ({
  display: { xs: 'none', sm: 'inline-flex' },
  alignItems: 'center',
  gap: 0.75,
  justifyContent: 'space-between',
  bgcolor: theme.palette.surfaceHover,
  border: `1px solid ${theme.palette.divider}`,
  py: '7px',
  px: 1.5,
  borderRadius: 1,
  fontSize: 13,
  color: 'inherit',
  fontWeight: 500,
  fontFamily: 'inherit',
});

export const storeBtnSx = (disabled = false): SxProps<Theme> => (theme) => ({
  display: { xs: 'none', sm: 'inline-flex' },
  alignItems: 'center',
  gap: 0.75,
  justifyContent: 'space-between',
  minWidth: 0,
  bgcolor: theme.palette.surfaceHover,
  border: `1px solid ${theme.palette.divider}`,
  py: '7px',
  px: 1.5,
  borderRadius: 1,
  fontSize: 13,
  color: 'inherit',
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: disabled ? 'default' : 'pointer',
  transition: 'background 150ms ease',
  '&:hover': disabled ? {} : { bgcolor: theme.palette.primarySoftHover },
  '&:disabled': { opacity: 0.65 },
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
});
