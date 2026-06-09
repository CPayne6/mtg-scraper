import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoreService } from '@scoutlgs/core';
import type { PrincipalContext } from '../../auth/principal.types';
import { CheckoutAuditService } from './checkout-audit.service';
import { CheckoutRateLimiterService } from './checkout-rate-limiter.service';
import { CheckoutService } from './checkout.service';
import { BuildCheckoutDto } from './dto/build-checkout.dto';

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

describe('CheckoutService', () => {
  let service: CheckoutService;
  let storeService: { findAllActive: ReturnType<typeof vi.fn> };
  let rateLimiter: { check: ReturnType<typeof vi.fn> };
  let auditService: { record: ReturnType<typeof vi.fn> };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: StoreService, useValue: storeService },
        { provide: CheckoutRateLimiterService, useValue: rateLimiter },
        { provide: CheckoutAuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(CheckoutService);
  });

  function makeDto(overrides?: Partial<BuildCheckoutDto>): BuildCheckoutDto {
    return {
      stores: [
        {
          storeKey: '401-games',
          lines: [{ variantId: '12345', quantity: 1 }],
        },
      ],
      ...overrides,
    } as BuildCheckoutDto;
  }

  it('builds permalinks for valid input', async () => {
    const result = await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'iph', 'uah');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.stores).toEqual([
        { storeKey: '401-games', checkoutUrl: 'https://store.401games.ca/cart/12345:1' },
      ]);
    }
  });

  it('uses scraperConfig.shopifyUrl host when available', async () => {
    const result = await service.buildCheckout(
      makeDto({
        stores: [
          {
            storeKey: 'house-of-cards',
            lines: [{ variantId: '999', quantity: 2 }],
          },
        ],
      }),
      ANON_PRINCIPAL,
      'iph',
      'uah',
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.stores[0].checkoutUrl).toBe(
        'https://house-of-cards-mtg.myshopify.com/cart/999:2',
      );
    }
  });

  it('uses the anonymous rate-limit budget for anonymous principals', async () => {
    await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'iph', null);
    expect(rateLimiter.check).toHaveBeenCalledWith(
      `checkout:p:${ANON_PRINCIPAL.principalUuid}`,
      5,
      60,
    );
  });

  it('uses the user rate-limit budget for user principals', async () => {
    await service.buildCheckout(makeDto(), USER_PRINCIPAL, 'iph', null);
    expect(rateLimiter.check).toHaveBeenCalledWith(
      `checkout:p:${USER_PRINCIPAL.principalUuid}`,
      20,
      60,
    );
  });

  it('keys per-IP limit on ipHash with the 30/min budget', async () => {
    await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'abc-iphash', null);
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

    const result = await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'rate-limited', retryAfterSec: 45 });
  });

  it('returns rate-limited when ip limit is exceeded', async () => {
    rateLimiter.check
      .mockResolvedValueOnce(allowed())
      .mockResolvedValueOnce(blocked(200));

    const result = await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'rate-limited', retryAfterSec: 200 });
  });

  it('takes the worst retry-after when both limits trip', async () => {
    rateLimiter.check
      .mockResolvedValueOnce(blocked(60))
      .mockResolvedValueOnce(blocked(120));

    const result = await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'iph', null);
    expect(result).toEqual({ kind: 'rate-limited', retryAfterSec: 120 });
  });

  it('rejects unknown storeKeys with 400-equivalent before building URLs', async () => {
    const result = await service.buildCheckout(
      makeDto({
        stores: [{ storeKey: 'totally-fake', lines: [{ variantId: '1', quantity: 1 }] }],
      }),
      ANON_PRINCIPAL,
      'iph',
      null,
    );
    expect(result).toEqual({ kind: 'unknown-store', storeKey: 'totally-fake' });
  });

  it('rejects requests where total card quantity exceeds 150', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({
      variantId: String(i + 1),
      quantity: 1,
    }));
    const result = await service.buildCheckout(
      {
        stores: [
          { storeKey: '401-games', lines },
          { storeKey: '401-games', lines },
          { storeKey: '401-games', lines },
          { storeKey: '401-games', lines },
          { storeKey: '401-games', lines },
        ],
      } as BuildCheckoutDto,
      ANON_PRINCIPAL,
      'iph',
      null,
    );
    expect(result).toEqual({ kind: 'too-many-lines', total: 250, max: 150 });
  });

  it('counts quantities, not just variant lines, against the 150-card limit', async () => {
    const result = await service.buildCheckout(
      makeDto({
        stores: [
          {
            storeKey: '401-games',
            lines: [
              { variantId: '1', quantity: 20 },
              { variantId: '2', quantity: 20 },
              { variantId: '3', quantity: 20 },
              { variantId: '4', quantity: 20 },
              { variantId: '5', quantity: 20 },
              { variantId: '6', quantity: 20 },
              { variantId: '7', quantity: 20 },
              { variantId: '8', quantity: 11 },
            ],
          },
        ],
      }),
      ANON_PRINCIPAL,
      'iph',
      null,
    );
    expect(result).toEqual({ kind: 'too-many-lines', total: 151, max: 150 });
  });

  it('dedupes duplicate variantIds and sums quantities', async () => {
    const result = await service.buildCheckout(
      makeDto({
        stores: [
          {
            storeKey: '401-games',
            lines: [
              { variantId: '12345', quantity: 1 },
              { variantId: '12345', quantity: 2 },
              { variantId: '67890', quantity: 1 },
            ],
          },
        ],
      }),
      ANON_PRINCIPAL,
      'iph',
      null,
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const url = result.stores[0].checkoutUrl;
      expect(url).toContain('12345:3');
      expect(url).toContain('67890:1');
    }
  });

  it('writes a cache audit entry for successful builds', async () => {
    await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'iph', 'uah');
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
    await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'iph', null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        errorClass: 'rate-limited',
        totalSucceededStores: 0,
      }),
    );
  });

  it('writes a cache audit entry tagged unknown when the URL builder throws', async () => {
    storeService.findAllActive.mockRejectedValueOnce(new Error('db down'));
    const result = await service.buildCheckout(makeDto(), ANON_PRINCIPAL, 'iph', null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(result).toEqual({ kind: 'error' });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: 'unknown' }),
    );
  });
});
