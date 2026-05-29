import type { SxProps, Theme } from '@mui/material/styles';

export const triggerSx = (open: boolean): SxProps<Theme> => (theme) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: theme.palette.background.default,
  color: theme.palette.text.primary,
  border: `1px solid ${
    open ? theme.palette.primaryOutline : theme.palette.divider
  }`,
  borderRadius: '8px',
  padding: '5px 10px 5px 12px',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition:
    'background 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: theme.palette.background.paper,
    borderColor: theme.palette.primaryOutline,
  },
});

export const popoverPaperSx: SxProps<Theme> = (theme) => ({
  minWidth: 160,
  bgcolor: 'background.paper',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: '12px',
  boxShadow: theme.shadows[6],
  p: '12px',
  mt: '8px',
});

export const headingSx: SxProps<Theme> = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'text.secondary',
  m: 0,
  mb: '8px',
};

export const optionSx = (isSelected: boolean): SxProps<Theme> => (theme) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '7px 8px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '13px',
  userSelect: 'none',
  background: isSelected ? theme.palette.primarySoft : 'transparent',
  '&:hover': { background: theme.palette.background.default },
});
