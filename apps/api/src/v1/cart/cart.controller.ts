import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../auth/current-principal.decorator';
import { PrincipalGuard } from '../../auth/principal.guard';
import type { PrincipalContext } from '../../auth/principal.types';
import { CartService } from './cart.service';
import { CartRefreshService } from './cart-refresh.service';
import { ReplaceCartDto } from './dto/replace-cart.dto';

@Controller('cart')
@UseGuards(PrincipalGuard)
export class CartController {
  constructor(private readonly cartService: CartService, private readonly refreshService: CartRefreshService) {}

  @Post('refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  refresh(@CurrentPrincipal() principal: PrincipalContext) { return this.refreshService.request(principal); }

  @Get('refresh/:jobId')
  refreshStatus(@Param('jobId') jobId: string, @CurrentPrincipal() principal: PrincipalContext) { return this.refreshService.status(principal, jobId); }

  @Get()
  getCart(@CurrentPrincipal() principal: PrincipalContext) {
    return this.cartService.getCart(principal);
  }

  @Put()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  replaceCart(
    @Body() dto: ReplaceCartDto,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    return this.cartService.replaceCart(principal, dto.variantIds);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  clearCart(@CurrentPrincipal() principal: PrincipalContext) {
    return this.cartService.clearCart(principal);
  }
}
