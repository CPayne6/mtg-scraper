import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from '@scoutlgs/core';
import { AdminGuard } from '../auth/admin.guard';

/** The only onboarding-adjacent API surface that may change store activity. */
@Controller('admin/stores')
@UseGuards(AdminGuard)
export class AdminStoreStatusController {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  @Patch(':id/status')
  async setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('isActive') isActive: boolean,
  ) {
    if (typeof isActive !== 'boolean')
      throw new BadRequestException('isActive must be boolean');
    const result = await this.stores.update({ id }, { isActive });
    if (!result.affected) throw new NotFoundException('Store not found');
    return this.stores.findOneByOrFail({ id });
  }
}
