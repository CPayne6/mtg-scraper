import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  HttpException,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Optional,
  Req,
  Res,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../auth/current-principal.decorator';
import { OptionalPrincipalGuard } from '../../auth/optional-principal.guard';
import { PrincipalGuard } from '../../auth/principal.guard';
import type { PrincipalContext } from '../../auth/principal.types';
import { ListsService } from './lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateFiltersDto } from './dto/update-filters.dto';
import { ReplaceCardsDto } from './dto/replace-cards.dto';
import { UpdateNameDto } from './dto/update-name.dto';
import { OptimizeListQueryDto } from './dto/optimize-list-query.dto';
import { DeliveryOptionsDto } from './dto/delivery-options.dto';
import { XRequestedWithGuard } from '../checkout/csrf.guard';
import type { Request } from 'express';
import type { Response } from 'express';
import { CheckoutRateLimiterService } from '../checkout/checkout-rate-limiter.service';
import { hashIp } from '../checkout/ip-hash.util';
import { ConfigService } from '@nestjs/config';

@Controller('lists')
export class ListsController {
  constructor(
    private readonly listsService: ListsService,
    @Optional() private readonly quoteRateLimiter?: CheckoutRateLimiterService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createList(
    @Body() dto: CreateListDto,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    return this.listsService.createList(
      dto,
      principal.principalUuid,
      principal.kind,
    );
  }

  @Get()
  @UseGuards(PrincipalGuard)
  async getLists(@CurrentPrincipal() principal: PrincipalContext) {
    const lists = await this.listsService.getListsForOwner(
      principal.principalUuid,
    );
    return { lists };
  }

  @Get(':listId')
  @UseGuards(OptionalPrincipalGuard)
  async getListWithPrices(
    @Param('listId') listId: string,
    @CurrentPrincipal() principal?: PrincipalContext,
  ) {
    return this.listsService.getListWithPrices(
      listId,
      principal?.principalUuid,
    );
  }

  @Post(':listId/optimizations')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(OptionalPrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createOptimization(
    @Param('listId') listId: string,
    @Body() query: OptimizeListQueryDto,
    @CurrentPrincipal() principal?: PrincipalContext,
  ) {
    return this.listsService.createOptimization(
      listId,
      principal?.principalUuid,
      query,
    );
  }

  @Post(':listId/optimizations/:jobId/delivery-options')
  @UseGuards(XRequestedWithGuard, PrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async deliveryOptions(
    @Param('listId') listId: string,
    @Param('jobId') jobId: string,
    @Body() dto: DeliveryOptionsDto,
    @CurrentPrincipal() principal: PrincipalContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.configService?.get<boolean>('delivery.addressQuotesEnabled')) {
      throw new HttpException('Address-based delivery quotes are disabled', HttpStatus.NOT_FOUND);
    }
    const principalLimit = principal.kind === 'user' ? 10 : 3;
    if (!this.quoteRateLimiter) return this.listsService.createDeliveryQuote(listId, jobId, principal.principalUuid, dto);
    const [principalDecision, ipDecision] = await Promise.all([
      this.quoteRateLimiter.check(`delivery-quote:p:${principal.principalUuid}`, principalLimit, 60),
      this.quoteRateLimiter.check(`delivery-quote:ip:${hashIp(req)}`, 15, 60),
    ]);
    const denied = !principalDecision.allowed ? principalDecision : !ipDecision.allowed ? ipDecision : null;
    if (denied) {
      res.setHeader('Retry-After', String(denied.retryAfterSec));
      throw new HttpException({ error: 'rate-limited', retryAfterSec: denied.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.listsService.createDeliveryQuote(listId, jobId, principal.principalUuid, dto);
  }

  @Get(':listId/optimizations/:jobId')
  @UseGuards(OptionalPrincipalGuard)
  async getOptimizationStatus(
    @Param('listId') listId: string,
    @Param('jobId') jobId: string,
    @CurrentPrincipal() principal?: PrincipalContext,
  ) {
    return this.listsService.getOptimizationStatus(listId, jobId, principal?.principalUuid);
  }

  @Put(':listId/filters')
  @UseGuards(PrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateFilters(
    @Param('listId') listId: string,
    @Body() dto: UpdateFiltersDto,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    await this.listsService.updateFilters(
      listId,
      principal.principalUuid,
      dto,
    );
    return { message: 'Filters updated' };
  }

  @Put(':listId/cards')
  @UseGuards(PrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async replaceCards(
    @Param('listId') listId: string,
    @Body() dto: ReplaceCardsDto,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    return this.listsService.replaceCards(
      listId,
      principal.principalUuid,
      dto.cards,
    );
  }

  @Put(':listId/name')
  @UseGuards(PrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateName(
    @Param('listId') listId: string,
    @Body() dto: UpdateNameDto,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    await this.listsService.updateName(
      listId,
      principal.principalUuid,
      dto.name,
    );
    return { message: 'Name updated' };
  }

  @Delete(':listId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PrincipalGuard)
  async deleteList(
    @Param('listId') listId: string,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    await this.listsService.deleteList(listId, principal.principalUuid);
  }
}
