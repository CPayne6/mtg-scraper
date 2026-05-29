import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import { useCart } from '@/components/cart/CartContext';
import { buttonSx, badgeSx } from './CartIconButton.styles';

export function CartIconButton() {
  const { count, open } = useCart();
  const label =
    count === 0
      ? 'Open cart (0 items)'
      : `Open cart (${count} ${count === 1 ? 'item' : 'items'})`;

  return (
    <IconButton onClick={open} aria-label={label} sx={buttonSx}>
      <ShoppingCartOutlined sx={{ fontSize: 18 }} />
      {count > 0 && <Box sx={badgeSx}>{count > 99 ? '99+' : count}</Box>}
    </IconButton>
  );
}
