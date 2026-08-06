import { useSnackbar } from 'notistack';
import { StoreOfferTile } from '@/components/builder/StoreOfferTile';
import { useCart, cartItemId } from '@/components/cart/CartContext';
import type { ProductTileProps } from './ProductTile.types';

// Keep search results visually and behaviorally aligned with the cart builder.
export function ProductTile({ card, isCheapest }: ProductTileProps) {
  const { add, has, remove, isMutationLocked } = useCart();
  const { enqueueSnackbar } = useSnackbar();
  const inCart = has(cartItemId(card));

  const handleAdd = async () => {
    if (isMutationLocked) {
      enqueueSnackbar('Cart updates are paused while Fill Best Cards is running', {
        variant: 'info',
      });
      return;
    }
    if (inCart) {
      remove(cartItemId(card));
      enqueueSnackbar(`Removed "${card.title}" from cart`, { variant: 'default' });
      return;
    }

    const result = await add(card);
    if (result.outcome === 'added') {
      enqueueSnackbar(`Added "${card.title}" to cart`, { variant: 'default' });
    } else if (result.outcome === 'soldOut') {
      enqueueSnackbar(`"${card.title}" is sold out and could not be added`, { variant: 'warning' });
    }
  };

  return (
    <StoreOfferTile
      offer={card}
      isCheapest={isCheapest}
      inCart={inCart}
      onAdd={handleAdd}
    />
  );
}
