import { useSnackbar } from 'notistack';
import { StoreOfferTile } from '@/components/builder/StoreOfferTile';
import { useCart, cartItemId } from '@/components/cart/CartContext';
import type { ProductTileProps } from './ProductTile.types';

// Keep search results visually and behaviorally aligned with the cart builder.
export function ProductTile({ card, isCheapest }: ProductTileProps) {
  const { add, has } = useCart();
  const { enqueueSnackbar } = useSnackbar();
  const inCart = has(cartItemId(card));

  const handleAdd = () => {
    if (inCart) return;

    if (add(card)) {
      enqueueSnackbar(`Added "${card.title}" to cart`, { variant: 'default' });
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
