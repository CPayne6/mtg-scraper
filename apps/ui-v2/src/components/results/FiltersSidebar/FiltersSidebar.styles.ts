import type { SxProps, Theme } from '@mui/material/styles';

export const collapsedBtnSx: SxProps<Theme> = (theme) => ({
  position: 'relative',
  width: 40,
  height: 40,
  borderRadius: '10px',
  border: `1px solid ${theme.palette.divider}`,
  bgcolor: 'background.paper',
  color: 'text.secondary',
  '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
});

export const collapsedBadgeSx: SxProps<Theme> = (theme) => ({
  position: 'absolute',
  top: -6,
  right: -6,
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

export const expandedBtnSx: SxProps<Theme> = (theme) => ({
  width: 40,
  height: 40,
  borderRadius: '10px',
  border: `1px solid ${theme.palette.divider}`,
  bgcolor: 'background.paper',
  color: 'text.secondary',
  '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
});

export const filtersHeadingSx: SxProps<Theme> = {
  fontSize: 13,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'text.secondary',
};

export const conditionGroupSx: SxProps<Theme> = (theme) => ({
  display: 'inline-flex',
  width: '100%',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 1,
  overflow: 'hidden',
});

export const conditionBtnSx = (on: boolean, isFirst: boolean): SxProps<Theme> => (theme) => ({
  flex: 1,
  border: 0,
  borderLeft: isFirst ? 'none' : `1px solid ${theme.palette.divider}`,
  bgcolor: on ? 'primary.main' : 'transparent',
  color: on ? '#fff' : 'text.primary',
  fontFamily: 'inherit',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  py: 0.75,
  px: 0.5,
  transition: 'background 200ms',
  '&:hover': on
    ? {}
    : {
        bgcolor:
          theme.palette.mode === 'dark'
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.04)',
      },
});

export const storeLabelSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 1.25,
  px: 0.5,
  py: 0.75,
  fontSize: 14,
  cursor: 'pointer',
  borderRadius: 0.75,
  '&:hover': {
    bgcolor:
      theme.palette.mode === 'dark'
        ? 'rgba(255,255,255,0.04)'
        : 'rgba(0,0,0,0.03)',
  },
});

export const checkboxSx: SxProps<Theme> = (theme) => ({
  accentColor: theme.palette.primary.main,
  width: 16,
  height: 16,
});
