import {
  Body,
  Controller,
  Delete,
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
import { ReplaceCartDto } from './dto/replace-cart.dto';

@Controller('cart')
@UseGuards(PrincipalGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

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
