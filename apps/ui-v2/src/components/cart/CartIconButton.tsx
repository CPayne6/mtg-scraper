import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import { useCart } from '@/components/cart/CartContext';

export function CartIconButton() {
  const { count, open } = useCart();
  const label =
    count === 0
      ? 'Open cart (0 items)'
      : `Open cart (${count} ${count === 1 ? 'item' : 'items'})`;

  return (
    <IconButton
      onClick={open}
      aria-label={label}
      sx={(theme) => ({
        position: 'relative',
        width: 38,
        height: 38,
        borderRadius: '10px',
        border: `1px solid ${theme.palette.divider}`,
        color: 'text.secondary',
        transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          color: 'primary.main',
          borderColor: 'primary.main',
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(36,135,33,0.14)'
              : 'rgba(74,103,65,0.08)',
        },
      })}
    >
      <ShoppingCartOutlined sx={{ fontSize: 18 }} />
      {count > 0 && (
        <Box
          sx={(theme) => ({
            position: 'absolute',
            top: -4,
            right: -4,
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
          })}
        >
          {count > 99 ? '99+' : count}
        </Box>
      )}
    </IconButton>
  );
}
