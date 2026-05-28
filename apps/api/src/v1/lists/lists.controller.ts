import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { OwnerCookie, COOKIE_NAME } from './decorators/owner-cookie.decorator';
import { ListsService } from './lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateFiltersDto } from './dto/update-filters.dto';
import { ReplaceCardsDto } from './dto/replace-cards.dto';

const COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

@Controller('lists')
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createList(
    @Body() dto: CreateListDto,
    @OwnerCookie() cookie: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ownerCookie = cookie ?? randomUUID();

    if (!cookie) {
      res.cookie(COOKIE_NAME, ownerCookie, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE_MS,
      });
    }

    return this.listsService.createList(dto, ownerCookie);
  }

  @Get()
  async getLists(@OwnerCookie() cookie: string | undefined) {
    if (!cookie) {
      return { lists: [] };
    }
    const lists = await this.listsService.getListsForOwner(cookie);
    return { lists };
  }

  @Get(':listId')
  async getListWithPrices(@Param('listId') listId: string) {
    return this.listsService.getListWithPrices(listId);
  }

  @Put(':listId/filters')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateFilters(
    @Param('listId') listId: string,
    @Body() dto: UpdateFiltersDto,
    @OwnerCookie() cookie: string | undefined,
  ) {
    if (!cookie) {
      return { message: 'No owner cookie' };
    }
    await this.listsService.updateFilters(listId, cookie, dto);
    return { message: 'Filters updated' };
  }

  @Put(':listId/cards')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async replaceCards(
    @Param('listId') listId: string,
    @Body() dto: ReplaceCardsDto,
    @OwnerCookie() cookie: string | undefined,
  ) {
    if (!cookie) {
      return { message: 'No owner cookie' };
    }
    return this.listsService.replaceCards(listId, cookie, dto.cards);
  }

  @Delete(':listId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteList(
    @Param('listId') listId: string,
    @OwnerCookie() cookie: string | undefined,
  ) {
    if (!cookie) {
      return;
    }
    await this.listsService.deleteList(listId, cookie);
  }
}
