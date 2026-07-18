import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { RemoveShoppingCart } from '@mui/icons-material';
import { DeleteOutline } from '@mui/icons-material';
import type { DecklistRowProps } from './DecklistRow.types';
import {
  cardNameButtonSx,
  containerSx,
  qtyBadgeSx,
  cartStatusSx,
} from './DecklistRow.styles';

export function DecklistRow({
  qty,
  name,
  meta,
  cartOffer,
  onOpenBuilder,
  onRemoveFromCart,
  onRemoveFromList,
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
            {cartOffer ? cartOffer.store : 'Not in cart'}
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
        {cartOffer ? `CA$${cartOffer.price.toFixed(2)}` : 'Not in cart'}
      </Typography>
      <Box
        sx={cartStatusSx}
      >
        <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cartOffer ? cartOffer.store : 'Not in cart'}
        </Box>
      </Box>
      {cartOffer && (
        <Tooltip title="Remove selected offer from cart">
          <IconButton size="small" aria-label={`Remove ${name} from cart`} onClick={onRemoveFromCart}>
            <RemoveShoppingCart sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}
      {!cartOffer && (
        <Tooltip title="Remove from list">
          <IconButton size="small" aria-label={`Remove ${name} from list`} onClick={onRemoveFromList}>
            <DeleteOutline sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
