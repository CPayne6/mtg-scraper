import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentPrincipal } from '../../auth/current-principal.decorator';
import { PrincipalGuard } from '../../auth/principal.guard';
import type { PrincipalContext } from '../../auth/principal.types';
import { CheckoutService } from './checkout.service';
import { XRequestedWithGuard } from './csrf.guard';
import { BuildCheckoutDto } from './dto/build-checkout.dto';
import { hashIp, hashUserAgent } from './ip-hash.util';

// Authz model (also documented in the PR description):
//   - Every request must carry a valid principal JWT cookie (anonymous OR
//     user). Missing/invalid principal -> 401 via PrincipalGuard.
//   - There is no role gate on this endpoint -- every authenticated principal
//     can call it. Anonymous principals are rate-limited harder than users.
//   - Role is read from the principal JWT claim (`role`) via PrincipalGuard,
//     NOT from environment variables.
//   - X-Requested-With CSRF gate runs before guards so cross-origin form POSTs
//     fail fast without consuming rate-limit budget.
@Controller('checkout')
@UseGuards(XRequestedWithGuard, PrincipalGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('build')
  async build(
    @Body() dto: BuildCheckoutDto,
    @CurrentPrincipal() principal: PrincipalContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.checkoutService.buildCheckout(
      dto,
      principal,
      hashIp(req),
      hashUserAgent(req),
    );

    switch (result.kind) {
      case 'ok':
        return { stores: result.stores };

      case 'rate-limited':
        res.setHeader('Retry-After', String(result.retryAfterSec));
        throw new HttpException(
          { error: 'rate-limited', retryAfterSec: result.retryAfterSec },
          HttpStatus.TOO_MANY_REQUESTS,
        );

      case 'unknown-store':
        throw new HttpException(
          { error: 'unknown-store', storeKey: result.storeKey },
          HttpStatus.BAD_REQUEST,
        );

      case 'too-many-lines':
        throw new HttpException(
          { error: 'too-many-lines', total: result.total, max: result.max },
          HttpStatus.BAD_REQUEST,
        );

      case 'error':
        throw new HttpException(
          { error: 'unknown' },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }
}
