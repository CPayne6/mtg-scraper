import type { SxProps, Theme } from '@mui/material/styles';

export const dialogSx: SxProps<Theme> = (theme) => ({
  width: 320,
  bgcolor: 'background.paper',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: '12px',
  boxShadow: theme.shadows[6],
  overflow: 'hidden',
});

export const searchRowSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 12px',
  borderBottom: `1px solid ${theme.palette.divider}`,
  color: 'text.secondary',
});

export const inputSx: SxProps<Theme> = {
  flex: 1,
  border: 0,
  background: 'transparent',
  color: 'text.primary',
  fontFamily: 'inherit',
  fontSize: '13px',
  outline: 'none',
  minWidth: 0,
};

export const resultsListSx: SxProps<Theme> = {
  maxHeight: 320,
  overflowY: 'auto',
  padding: '6px',
};

export const emptyResultsSx: SxProps<Theme> = {
  padding: '20px 12px',
  textAlign: 'center',
  fontSize: '12px',
  color: 'text.secondary',
};

export const optionRowSx = (already: boolean): SxProps<Theme> => (theme) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '6px 8px',
  background: 'transparent',
  border: 0,
  borderRadius: '8px',
  cursor: already ? 'default' : 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  color: 'text.primary',
  opacity: already ? 0.5 : 1,
  transition: 'background 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: already ? 'transparent' : theme.palette.background.default,
  },
});

export const optionThumbSx = (name: string, artUrlFn: (n: string) => string): SxProps<Theme> => (theme) => ({
  width: 32,
  height: 32,
  borderRadius: '5px',
  backgroundColor: theme.palette.background.default,
  backgroundImage: `url("${artUrlFn(name)}")`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  flexShrink: 0,
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
});

export const optionTitleSx: SxProps<Theme> = {
  fontSize: '13px',
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const optionSubtitleSx: SxProps<Theme> = {
  fontSize: '11px',
  color: 'text.secondary',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const inListBadgeSx: SxProps<Theme> = (theme) => ({
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'text.secondary',
  background: theme.palette.background.default,
  padding: '2px 6px',
  borderRadius: '999px',
  flexShrink: 0,
});
