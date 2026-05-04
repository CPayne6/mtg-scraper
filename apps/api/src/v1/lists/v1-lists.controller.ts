import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../auth/current-principal.decorator';
import { OptionalPrincipalGuard } from '../../auth/optional-principal.guard';
import { PrincipalGuard } from '../../auth/principal.guard';
import type { PrincipalContext } from '../../auth/principal.types';
import { V1ListsService } from './v1-lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateFiltersDto } from './dto/update-filters.dto';
import { ReplaceCardsDto } from './dto/replace-cards.dto';

@Controller('v1/lists')
export class V1ListsController {
  constructor(private readonly v1ListsService: V1ListsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createList(
    @Body() dto: CreateListDto,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    return this.v1ListsService.createList(dto, principal.principalUuid);
  }

  @Get()
  @UseGuards(PrincipalGuard)
  async getLists(@CurrentPrincipal() principal: PrincipalContext) {
    const lists = await this.v1ListsService.getListsForOwner(
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
    return this.v1ListsService.getListWithPrices(
      listId,
      principal?.principalUuid,
    );
  }

  @Put(':listId/filters')
  @UseGuards(PrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateFilters(
    @Param('listId') listId: string,
    @Body() dto: UpdateFiltersDto,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    await this.v1ListsService.updateFilters(
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
    return this.v1ListsService.replaceCards(
      listId,
      principal.principalUuid,
      dto.cards,
    );
  }

  @Delete(':listId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PrincipalGuard)
  async deleteList(
    @Param('listId') listId: string,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    await this.v1ListsService.deleteList(listId, principal.principalUuid);
  }
}
