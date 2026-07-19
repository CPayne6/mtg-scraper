import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoreService } from '@scoutlgs/core';
import type { PrincipalContext } from '../../auth/principal.types';
import { CartService, type CartItemResponse } from '../cart/cart.service';
import { CheckoutAuditService } from './checkout-audit.service';
import { CheckoutRateLimiterService } from './checkout-rate-limiter.service';
import { CheckoutService } from './checkout.service';

const ANON_PRINCIPAL: PrincipalContext = {
  principalUuid: '11111111-1111-1111-1111-111111111111',
  kind: 'anonymous',
};

const USER_PRINCIPAL: PrincipalContext = {
  principalUuid: '22222222-2222-2222-2222-222222222222',
  kind: 'user',
  userUuid: '33333333-3333-3333-3333-333333333333',
  role: 'user',
};

const stores = [
  {
    id: 1,
    name: '401-games',
    baseUrl: 'https://store.401games.ca',
    scraperConfig: undefined,
  },
  {
    id: 2,
    name: 'house-of-cards',
    baseUrl: 'https://houseofcards.ca',
    scraperConfig: { shopifyUrl: 'house-of-cards-mtg.myshopify.com' },
  },
];

function allowed() {
  return { allowed: true, retryAfterSec: 0, remaining: 4 };
}

function blocked(retryAfterSec = 60) {
  return { allowed: false, retryAfterSec, remaining: 0 };
}

function makeItem(overrides: Partial<CartItemResponse> = {}): CartItemResponse {
  const id = overrides.id ?? 1;
  return {
    id,
    addedAt: 1770000000000,
    price: 1.23,
    condition: 'nm' as CartItemResponse['condition'],
    foil: false,
    image: '',
    title: `Card ${id}`,
    currency: 'CAD',
    link: 'https://store.401games.ca/products/card',
    set: 'Alpha',
    card_number: String(id),
    scryfall_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    variant_id: String(1000 + id),
    store: '401 Games',
    store_key: '401-games',
    ...overrides,
  };
}

function makeCart(items: CartItemResponse[]) {
  return {
    id: 'cart-id',
    variantIds: items.map((item) => item.id),
    items,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('CheckoutService', () => {
  let service: CheckoutService;
  let storeService: { findAllActive: ReturnType<typeof vi.fn> };
  let rateLimiter: { check: ReturnType<typeof vi.fn> };
  let auditService: { record: ReturnType<typeof vi.fn> };
  let cartService: { getCart: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    storeService = {
      findAllActive: vi.fn().mockResolvedValue(stores),
    };
    rateLimiter = {
      check: vi.fn().mockResolvedValue(allowed()),
    };
    auditService = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    cartService = {
      getCart: vi.fn().mockResolvedValue(makeCart([makeItem()])),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: StoreService, useValue: storeService },
        { provide: CheckoutRateLimiterService, useValue: rateLimiter },
        { provide: CheckoutAuditService, useValue: auditService },
        { provide: CartService, useValue: cartService },
      ],
    }).compile();

    service = module.get(CheckoutService);
  });

  it('builds permalinks from the current principal cart', async () => {
    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', 'uah');
    expect(cartService.getCart).toHaveBeenCalledWith(ANON_PRINCIPAL);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.stores).toEqual([
        { storeKey: '401-games', checkoutUrl: 'https://store.401games.ca/cart/1001:1' },
      ]);
    }
  });

  it('uses scraperConfig.shopifyUrl host when available', async () => {
    cartService.getCart.mockResolvedValueOnce(
      makeCart([
        makeItem({
          id: 9,
          store: 'House of Cards',
          store_key: 'house-of-cards',
          variant_id: '999',
        }),
      ]),
    );

    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', 'uah');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.stores[0].checkoutUrl).toBe(
        'https://house-of-cards-mtg.myshopify.com/cart/999:1',
      );
    }
  });

  it('uses the anonymous rate-limit budget for anonymous principals', async () => {
    await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    expect(rateLimiter.check).toHaveBeenCalledWith(
      `checkout:p:${ANON_PRINCIPAL.principalUuid}`,
      5,
      60,
    );
  });

  it('uses the user rate-limit budget for user principals', async () => {
    await service.buildCheckout(USER_PRINCIPAL, 'iph', null);
    expect(rateLimiter.check).toHaveBeenCalledWith(
      `checkout:p:${USER_PRINCIPAL.principalUuid}`,
      20,
      60,
    );
  });

  it('keys per-IP limit on ipHash with the 30/min budget', async () => {
    await service.buildCheckout(ANON_PRINCIPAL, 'abc-iphash', null);
    expect(rateLimiter.check).toHaveBeenCalledWith(
      'checkout:ip:abc-iphash',
      30,
      60,
    );
  });

  it('returns rate-limited when principal limit is exceeded', async () => {
    rateLimiter.check
      .mockResolvedValueOnce(blocked(45))
      .mockResolvedValueOnce(allowed());

    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'rate-limited', retryAfterSec: 45 });
    expect(cartService.getCart).not.toHaveBeenCalled();
  });

  it('returns rate-limited when ip limit is exceeded', async () => {
    rateLimiter.check
      .mockResolvedValueOnce(allowed())
      .mockResolvedValueOnce(blocked(200));

    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'rate-limited', retryAfterSec: 200 });
  });

  it('takes the worst retry-after when both limits trip', async () => {
    rateLimiter.check
      .mockResolvedValueOnce(blocked(60))
      .mockResolvedValueOnce(blocked(120));

    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'rate-limited', retryAfterSec: 120 });
  });

  it('rejects unknown storeKeys with 400-equivalent before building URLs', async () => {
    cartService.getCart.mockResolvedValueOnce(
      makeCart([makeItem({ store_key: 'totally-fake', store: 'Fake Store' })]),
    );

    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'unknown-store', storeKey: 'totally-fake' });
  });

  it('rejects carts where total card quantity exceeds 150', async () => {
    const items = Array.from({ length: 151 }, (_, i) =>
      makeItem({ id: i + 1, variant_id: String(2000 + i) }),
    );
    cartService.getCart.mockResolvedValueOnce(makeCart(items));

    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'too-many-lines', total: 151, max: 150 });
  });

  it('returns empty-cart when no cart items have checkout variant ids', async () => {
    cartService.getCart.mockResolvedValueOnce(
      makeCart([makeItem({ variant_id: undefined })]),
    );

    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'empty-cart' });
  });

  it('dedupes duplicate platform variantIds and sums quantities', async () => {
    cartService.getCart.mockResolvedValueOnce(
      makeCart([
        makeItem({ id: 1, variant_id: '12345' }),
        makeItem({ id: 2, variant_id: '12345' }),
        makeItem({ id: 3, variant_id: '67890' }),
      ]),
    );

    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const url = result.stores[0].checkoutUrl;
      expect(url).toContain('12345:2');
      expect(url).toContain('67890:1');
    }
  });

  it('writes a cache audit entry for successful builds', async () => {
    await service.buildCheckout(ANON_PRINCIPAL, 'iph', 'uah');
    await new Promise((resolve) => setImmediate(resolve));
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        principalUuid: ANON_PRINCIPAL.principalUuid,
        principalKind: 'anonymous',
        ipHash: 'iph',
        uaHash: 'uah',
        storeCount: 1,
        totalLines: 1,
        totalSucceededStores: 1,
        totalFailedStores: 0,
        errorClass: undefined,
      }),
    );
  });

  it('writes a cache audit entry tagged rate-limited when the limiter blocks', async () => {
    rateLimiter.check.mockResolvedValueOnce(blocked(60));
    await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        errorClass: 'rate-limited',
        totalSucceededStores: 0,
      }),
    );
  });

  it('writes a cache audit entry tagged unknown when cart lookup throws', async () => {
    cartService.getCart.mockRejectedValueOnce(new Error('db down'));
    const result = await service.buildCheckout(ANON_PRINCIPAL, 'iph', null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(result).toEqual({ kind: 'error' });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: 'unknown' }),
    );
  });
});
