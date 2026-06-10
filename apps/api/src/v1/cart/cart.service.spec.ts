import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardCart, CardVariant } from '@scoutlgs/core';
import type { PrincipalContext } from '../../auth/principal.types';
import { CartService } from './cart.service';

const ANON_PRINCIPAL: PrincipalContext = {
  principalUuid: '11111111-1111-1111-1111-111111111111',
  kind: 'anonymous',
};

const USER_PRINCIPAL: PrincipalContext = {
  principalUuid: '11111111-1111-1111-1111-111111111111',
  kind: 'user',
  userUuid: '22222222-2222-2222-2222-222222222222',
};

function makeCart(overrides: Partial<CardCart> = {}): CardCart {
  return {
    id: 1,
    uuid: '33333333-3333-3333-3333-333333333333',
    ownerPrincipalUuid: ANON_PRINCIPAL.principalUuid,
    cardVariantIds: [1],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  } as CardCart;
}

function makeVariant(id: number): CardVariant {
  return {
    id,
    price: 12.34,
    foil: false,
    platformVariantId: `900${id}`,
    condition: { code: 'nm' },
    cardListing: {
      imageUrl: 'https://example.test/card.jpg',
      currency: 'CAD',
      rawTitle: 'Lightning Bolt',
      cardName: { name: 'Lightning Bolt' },
      store: {
        baseUrl: 'https://store.example',
        displayName: 'Test Store',
        name: 'test-store',
      },
      productUrl: { handle: 'lightning-bolt' },
      cardPrinting: {
        collectorNumber: '150',
        scryfallId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        set: { name: 'Alpha' },
      },
    },
  } as CardVariant;
}

describe('CartService', () => {
  let cartRepository: {
    findOne: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  let cardVariantRepository: {
    find: ReturnType<typeof vi.fn>;
  };
  let service: CartService;

  beforeEach(() => {
    cartRepository = {
      findOne: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    };
    cardVariantRepository = {
      find: vi.fn(),
    };
    service = new CartService(cartRepository as any, cardVariantRepository as any);
  });

  it('stores ordered, unique, existing variant ids for a principal', async () => {
    cartRepository.findOne.mockResolvedValue(makeCart({ cardVariantIds: [1, 2] }));
    cardVariantRepository.find.mockResolvedValue([makeVariant(1), makeVariant(2)]);

    const result = await service.replaceCart(ANON_PRINCIPAL, [1, 1, 999, 2]);

    expect(cartRepository.upsert).toHaveBeenCalledWith(
      {
        ownerPrincipalUuid: ANON_PRINCIPAL.principalUuid,
        cardVariantIds: [1, 2],
      },
      { conflictPaths: ['ownerPrincipalUuid'] },
    );
    expect(result.variantIds).toEqual([1, 2]);
    expect(result.items.map((item) => item.id)).toEqual([1, 2]);
    expect(result.updatedAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
  });

  it('hydrates an existing cart without mutating identity state', async () => {
    const cart = makeCart();
    cartRepository.findOne.mockResolvedValue(cart);
    cardVariantRepository.find.mockResolvedValue([makeVariant(1)]);

    const result = await service.getCart(USER_PRINCIPAL);

    expect(cartRepository.upsert).not.toHaveBeenCalled();
    expect(result.variantIds).toEqual([1]);
  });

  it('clears a cart by updating the owner row to an empty card id array', async () => {
    cartRepository.findOne.mockResolvedValue(
      makeCart({
        ownerPrincipalUuid: USER_PRINCIPAL.principalUuid,
        cardVariantIds: [],
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
    );

    const result = await service.clearCart(USER_PRINCIPAL);

    expect(cartRepository.upsert).toHaveBeenCalledWith(
      {
        ownerPrincipalUuid: USER_PRINCIPAL.principalUuid,
        cardVariantIds: [],
      },
      { conflictPaths: ['ownerPrincipalUuid'] },
    );
    expect(result.items).toEqual([]);
    expect(result.variantIds).toEqual([]);
    expect(result.updatedAt).toEqual(new Date('2026-01-03T00:00:00.000Z'));
  });
});
