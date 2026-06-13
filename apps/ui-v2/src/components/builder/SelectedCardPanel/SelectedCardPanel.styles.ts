import type { SxProps, Theme } from '@mui/material/styles';

export const headerCardSx: SxProps<Theme> = (theme) => ({
  bgcolor: 'background.paper',
  borderRadius: '16px',
  boxShadow: theme.shadows[2],
  padding: '16px 20px',
  position: { xs: 'static', lg: 'sticky' },
  top: { lg: 148 },
  zIndex: 5,
  display: 'flex',
  alignItems: 'flex-start',
  gap: '16px',
});

export const previewThumbSx = (previewImage: string): SxProps<Theme> => (theme) => ({
  width: 124,
  aspectRatio: '5 / 7',
  backgroundImage: previewImage ? `url("${previewImage}")` : 'none',
  backgroundColor: theme.palette.background.default,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  borderRadius: '9px',
  flexShrink: 0,
  transition: 'background-image 120ms ease-in-out',
  boxShadow: theme.palette.imageShadow,
});

export const cartStatusBadgeSx = (anyOfferInCart: boolean): SxProps<Theme> => (theme) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: anyOfferInCart
    ? theme.palette.text.secondary
    : theme.palette.honeyText,
});

export const cartStatusDotSx = (anyOfferInCart: boolean): SxProps<Theme> => (theme) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: anyOfferInCart ? 'transparent' : theme.palette.honey.main,
  boxShadow: anyOfferInCart
    ? 'none'
    : '0 0 6px rgba(212, 165, 116, 0.7)',
  transition:
    'background 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1)',
});

export const cardNameSx: SxProps<Theme> = {
  fontWeight: 700,
  letterSpacing: '-0.01em',
  m: 0,
  mb: '8px',
  fontSize: '22px',
  lineHeight: 1.2,
};

export const metaRowSx: SxProps<Theme> = {
  fontSize: '13px',
  color: 'text.secondary',
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '6px',
};

export const cardNavSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '8px',
  mt: '12px',
};

export const cardNavButtonSx: SxProps<Theme> = {
  borderRadius: '8px',
  minHeight: 34,
  px: 1.35,
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'none',
  whiteSpace: 'nowrap',
};

export const cardNavPositionSx: SxProps<Theme> = {
  color: 'text.secondary',
  fontSize: '12px',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  minWidth: { xs: '100%', sm: 'auto' },
  order: { xs: -1, sm: 0 },
};

export const sectionHeaderSx: SxProps<Theme> = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '0 4px',
  mb: '10px',
};

export const sectionTitleSx: SxProps<Theme> = {
  fontSize: '14px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'text.secondary',
  m: 0,
};

export const offerGridSx: SxProps<Theme> = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '12px',
};

export const emptyResultsPaperSx: SxProps<Theme> = {
  py: '24px',
  px: '24px',
  textAlign: 'center',
  color: 'text.secondary',
  fontSize: '13px',
  borderRadius: '12px',
};

export const emptyListPaperSx: SxProps<Theme> = {
  py: '36px',
  px: '24px',
  textAlign: 'center',
  color: 'text.secondary',
  fontSize: '14px',
  borderRadius: '16px',
};
