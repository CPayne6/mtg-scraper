import type { SxProps, Theme } from '@mui/material/styles';

export const dialogSx: SxProps<Theme> = (theme) => ({
  width: 300,
  bgcolor: 'background.paper',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: '12px',
  boxShadow: theme.shadows[6],
  overflow: 'hidden',
});

export const headerSx: SxProps<Theme> = (theme) => ({
  padding: '10px 12px',
  borderBottom: `1px solid ${theme.palette.divider}`,
});

export const headingSx: SxProps<Theme> = {
  m: 0,
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'text.secondary',
};

export const emptySx: SxProps<Theme> = {
  padding: '20px 12px',
  textAlign: 'center',
  fontSize: '12px',
  color: 'text.secondary',
};

export const entryRowSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 10px',
  borderRadius: '8px',
  transition: 'background 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: theme.palette.background.default,
  },
});

export const entryDotSx = (isAdd: boolean): SxProps<Theme> => (theme) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
  background: isAdd ? theme.palette.primary.main : theme.palette.honeyText,
});

export const undoBtnSx: SxProps<Theme> = (theme) => ({
  padding: '4px 9px',
  borderRadius: '8px',
  border: `1px solid ${theme.palette.divider}`,
  background: theme.palette.background.paper,
  color: 'text.primary',
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition:
    'background 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: theme.palette.background.default,
    borderColor: theme.palette.primaryOutline,
  },
});
