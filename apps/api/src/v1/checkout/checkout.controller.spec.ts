import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { XRequestedWithGuard } from './csrf.guard';
import { PrincipalGuard } from '../../auth/principal.guard';
import { PrincipalJwtService } from '../../auth/principal-jwt.service';
import type { PrincipalContext } from '../../auth/principal.types';
import type { BuildCheckoutDto } from './dto/build-checkout.dto';

const PRINCIPAL: PrincipalContext = {
  principalUuid: '11111111-1111-1111-1111-111111111111',
  kind: 'anonymous',
};

const DTO: BuildCheckoutDto = {
  stores: [
    {
      storeKey: '401-games',
      lines: [{ variantId: '12345', quantity: 1 }],
    },
  ],
};

function mockReq(): Request {
  return {
    header: vi.fn((name: string) => {
      if (name.toLowerCase() === 'cf-connecting-ip') return '1.2.3.4';
      if (name.toLowerCase() === 'user-agent') return 'vitest';
      return undefined;
    }),
    ip: '1.2.3.4',
    socket: { remoteAddress: '1.2.3.4' },
  } as unknown as Request;
}

function mockRes() {
  const setHeader = vi.fn();
  return { res: { setHeader } as unknown as Response, setHeader };
}

describe('CheckoutController.build', () => {
  let controller: CheckoutController;
  let service: { buildCheckout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { buildCheckout: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [
        { provide: CheckoutService, useValue: service },
        { provide: PrincipalJwtService, useValue: { verifyRequest: vi.fn() } },
        { provide: PrincipalGuard, useValue: { canActivate: vi.fn() } },
        { provide: XRequestedWithGuard, useValue: { canActivate: vi.fn() } },
      ],
    }).compile();

    controller = module.get(CheckoutController);
  });

  it('returns the checkout URLs on success', async () => {
    service.buildCheckout.mockResolvedValue({
      kind: 'ok',
      stores: [
        { storeKey: '401-games', checkoutUrl: 'https://store.401games.ca/cart/12345:1' },
      ],
    });
    const { res } = mockRes();

    const result = await controller.build(DTO, PRINCIPAL, mockReq(), res);

    expect(result).toEqual({
      stores: [
        { storeKey: '401-games', checkoutUrl: 'https://store.401games.ca/cart/12345:1' },
      ],
    });
  });

  it('responds 429 with Retry-After header when rate-limited', async () => {
    service.buildCheckout.mockResolvedValue({
      kind: 'rate-limited',
      retryAfterSec: 90,
    });
    const { res, setHeader } = mockRes();

    await expect(controller.build(DTO, PRINCIPAL, mockReq(), res)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { error: 'rate-limited', retryAfterSec: 90 },
    });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '90');
  });

  it('responds 400 for unknown store', async () => {
    service.buildCheckout.mockResolvedValue({ kind: 'unknown-store', storeKey: 'fake' });
    const { res } = mockRes();

    await expect(controller.build(DTO, PRINCIPAL, mockReq(), res)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { error: 'unknown-store', storeKey: 'fake' },
    });
  });

  it('responds 400 for too many lines', async () => {
    service.buildCheckout.mockResolvedValue({ kind: 'too-many-lines', total: 250, max: 200 });
    const { res } = mockRes();

    await expect(controller.build(DTO, PRINCIPAL, mockReq(), res)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { error: 'too-many-lines', total: 250, max: 200 },
    });
  });

  it('responds 500 with sanitized error on internal failure', async () => {
    service.buildCheckout.mockResolvedValue({ kind: 'error' });
    const { res } = mockRes();

    await expect(controller.build(DTO, PRINCIPAL, mockReq(), res)).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
