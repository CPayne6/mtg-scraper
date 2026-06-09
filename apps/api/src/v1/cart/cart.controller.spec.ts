import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrincipalContext } from '../../auth/principal.types';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

const PRINCIPAL: PrincipalContext = {
  principalUuid: '11111111-1111-1111-1111-111111111111',
  kind: 'anonymous',
};

describe('CartController', () => {
  let controller: CartController;
  let cartService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    cartService = {
      getCart: vi.fn(),
      replaceCart: vi.fn(),
      clearCart: vi.fn(),
    };
    controller = new CartController(cartService as unknown as CartService);
  });

  it('gets the current principal cart', async () => {
    cartService.getCart.mockResolvedValue({ items: [] });

    await controller.getCart(PRINCIPAL);

    expect(cartService.getCart).toHaveBeenCalledWith(PRINCIPAL);
  });

  it('replaces the current principal cart by variant ids', async () => {
    cartService.replaceCart.mockResolvedValue({ variantIds: [1, 2] });

    await controller.replaceCart({ variantIds: [1, 2] }, PRINCIPAL);

    expect(cartService.replaceCart).toHaveBeenCalledWith(PRINCIPAL, [1, 2]);
  });

  it('clears the current principal cart', async () => {
    cartService.clearCart.mockResolvedValue({ items: [] });

    await controller.clearCart(PRINCIPAL);

    expect(cartService.clearCart).toHaveBeenCalledWith(PRINCIPAL);
  });
});
