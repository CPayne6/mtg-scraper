import type { SxProps, Theme } from '@mui/material/styles';

export const containerSx: SxProps<Theme> = (theme) => ({
  bgcolor: 'background.paper',
  borderRadius: '16px',
  boxShadow: theme.shadows[2],
  position: { xs: 'static', lg: 'sticky' },
  top: { lg: 148 },
  maxHeight: { xs: 'none', lg: 'calc(100vh - 168px)' },
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

export const headerSx: SxProps<Theme> = (theme) => ({
  padding: '14px 16px',
  borderBottom: `1px solid ${theme.palette.divider}`,
});

export const titleSx: SxProps<Theme> = {
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
};

export const countTextSx: SxProps<Theme> = {
  fontSize: '12px',
  color: 'text.secondary',
  fontVariantNumeric: 'tabular-nums',
};

export const historyBtnSx = (historyOpen: boolean): SxProps<Theme> => (theme) => ({
  position: 'relative',
  width: 30,
  height: 30,
  borderRadius: '8px',
  border: `1px solid ${
    historyOpen ? theme.palette.primaryOutline : theme.palette.divider
  }`,
  background: historyOpen
    ? theme.palette.background.default
    : theme.palette.background.paper,
  color: historyOpen
    ? theme.palette.text.primary
    : theme.palette.text.secondary,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: 0,
  transition:
    'background 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1), color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: theme.palette.background.default,
    borderColor: theme.palette.primaryOutline,
    color: theme.palette.text.primary,
  },
});

export const historyIconSx: SxProps<Theme> = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const historyBadgeSx: SxProps<Theme> = (theme) => ({
  position: 'absolute',
  top: -4,
  right: -4,
  minWidth: 16,
  height: 16,
  padding: '0 4px',
  borderRadius: '999px',
  background: theme.palette.honey.main,
  color: '#3d2a14',
  fontSize: '10px',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
  pointerEvents: 'none',
});

export const addBtnSx = (addOpen: boolean): SxProps<Theme> => (theme) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 10px 6px 8px',
  borderRadius: '8px',
  border: `1px solid ${theme.palette.primary.main}`,
  background: theme.palette.primary.main,
  color: '#fff',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'filter 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  filter: addOpen ? 'brightness(0.92)' : 'none',
  '&:hover': { filter: 'brightness(0.92)' },
});

export const sortRowSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  mt: '10px',
};

export const sortLabelSx: SxProps<Theme> = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'text.secondary',
};

export const listSx: SxProps<Theme> = (theme) => ({
  flex: 1,
  overflowY: 'auto',
  padding: '8px 10px 10px',
  '&::-webkit-scrollbar': { width: 10 },
  '&::-webkit-scrollbar-thumb': {
    background: theme.palette.divider,
    borderRadius: 99,
  },
});

export const emptyListSx: SxProps<Theme> = {
  padding: '32px 16px',
  textAlign: 'center',
  color: 'text.secondary',
  fontSize: '14px',
};

export const footerSx: SxProps<Theme> = (theme) => ({
  padding: '12px 14px',
  borderTop: `1px solid ${theme.palette.divider}`,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  bgcolor: 'background.paper',
});

export const cartBtnSx = (isOpen: boolean): SxProps<Theme> => (theme) => ({
  flex: 1,
  padding: '9px 12px',
  border: 0,
  background: theme.palette.primary.main,
  color: '#fff',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '6px',
  boxShadow: isOpen
    ? 'inset 0 0 0 2px rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.18)'
    : 'none',
  filter: isOpen ? 'brightness(0.92)' : 'none',
  transition: 'background 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: theme.palette.primary.dark,
  },
});
