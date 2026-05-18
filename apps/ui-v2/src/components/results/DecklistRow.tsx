import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import MoreVert from '@mui/icons-material/MoreVert';

type Props = {
  qty: number;
  name: string;
  meta: string;
  price: number;
  store: string;
  onStoreChange?: () => void;
  onRemove?: () => void;
};

export function DecklistRow({ qty, name, meta, price, store, onStoreChange, onRemove }: Props) {
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: {
          xs: '32px 1fr auto 32px',
          sm: '40px 1fr 110px 150px 36px',
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
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(36,135,33,0.08)'
              : 'rgba(74,103,65,0.04)',
        },
      })}
    >
      <Box
        sx={(theme) => ({
          width: { xs: 28, sm: 32 },
          height: { xs: 28, sm: 32 },
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(36,135,33,0.20)'
              : 'rgba(74,103,65,0.12)',
          color: 'primary.main',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: { xs: 12, sm: 13 },
        })}
      >
        ×{qty}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 500,
            fontSize: { xs: 14, sm: 15 },
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </Typography>
        <Typography
          sx={{
            fontSize: 12,
            color: 'text.secondary',
            mt: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {meta}
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
            {' · '}{store}
          </Box>
        </Typography>
      </Box>
      <Typography
        sx={{
          fontWeight: 700,
          color: 'primary.main',
          fontSize: { xs: 14, sm: 16 },
          whiteSpace: 'nowrap',
        }}
      >
        CA${price.toFixed(2)}
      </Typography>
      <Box
        component="button"
        onClick={onStoreChange}
        sx={(theme) => ({
          display: { xs: 'none', sm: 'inline-flex' },
          alignItems: 'center',
          gap: 0.75,
          justifyContent: 'space-between',
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          border: `1px solid ${theme.palette.divider}`,
          py: '7px',
          px: 1.5,
          borderRadius: 1,
          fontSize: 13,
          cursor: 'pointer',
          color: 'inherit',
          fontWeight: 500,
          fontFamily: 'inherit',
          transition: 'background 200ms',
          '&:hover': {
            bgcolor:
              theme.palette.mode === 'dark'
                ? 'rgba(255,255,255,0.10)'
                : 'rgba(0,0,0,0.07)',
          },
        })}
      >
        <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {store}
        </Box>
        <KeyboardArrowDown sx={{ fontSize: 14 }} />
      </Box>
      <IconButton size="small" aria-label="Row actions" onClick={onRemove}>
        <MoreVert sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  );
}
