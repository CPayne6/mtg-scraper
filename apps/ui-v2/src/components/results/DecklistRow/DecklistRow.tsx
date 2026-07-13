import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { AddShoppingCart } from '@mui/icons-material';
import { DeleteOutline } from '@mui/icons-material';
import type { DecklistRowProps } from './DecklistRow.types';
import {
  cardNameButtonSx,
  containerSx,
  qtyBadgeSx,
  storeBtnSx,
} from './DecklistRow.styles';

export function DecklistRow({
  qty,
  name,
  meta,
  price,
  store,
  onStoreChange,
  storeActionDisabled,
  onOpenBuilder,
  onRemove,
}: DecklistRowProps) {
  return (
    <Box sx={containerSx}>
      <Box sx={qtyBadgeSx}>×{qty}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Box
          component={onOpenBuilder ? 'button' : 'div'}
          type={onOpenBuilder ? 'button' : undefined}
          onClick={onOpenBuilder}
          title={onOpenBuilder ? `Open ${name} in builder` : name}
          sx={cardNameButtonSx(Boolean(onOpenBuilder))}
        >
          {name}
        </Box>
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
      <Box
        component="button"
        type="button"
        onClick={onStoreChange}
        disabled={storeActionDisabled}
        aria-label={`Add ${name} from ${store} to cart`}
        sx={storeBtnSx(storeActionDisabled)}
      >
        <AddShoppingCart sx={{ fontSize: 14, flexShrink: 0 }} />
        <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {store}
        </Box>
      </Box>
      <Tooltip title="Remove from list">
        <IconButton size="small" aria-label={`Remove ${name} from list`} onClick={onRemove}>
          <DeleteOutline sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
