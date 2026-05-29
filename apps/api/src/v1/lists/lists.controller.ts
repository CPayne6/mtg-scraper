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
import { ListsService } from './lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateFiltersDto } from './dto/update-filters.dto';
import { ReplaceCardsDto } from './dto/replace-cards.dto';
import { UpdateNameDto } from './dto/update-name.dto';

@Controller('lists')
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PrincipalGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createList(
    @Body() dto: CreateListDto,
    @CurrentPrincipal() principal: PrincipalContext,
  ) {
    return this.listsService.createList(dto, principal.principalUuid);
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
