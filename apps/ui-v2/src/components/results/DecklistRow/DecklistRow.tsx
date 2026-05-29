import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import MoreVert from '@mui/icons-material/MoreVert';
import type { DecklistRowProps } from './DecklistRow.types';
import { containerSx, qtyBadgeSx, storeBtnSx } from './DecklistRow.styles';

export function DecklistRow({
  qty,
  name,
  meta,
  price,
  store,
  onStoreChange,
  onRemove,
}: DecklistRowProps) {
  return (
    <Box sx={containerSx}>
      <Box sx={qtyBadgeSx}>×{qty}</Box>
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
            {' · '}
            {store}
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
      <Box component="button" type="button" onClick={onStoreChange} sx={storeBtnSx}>
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
