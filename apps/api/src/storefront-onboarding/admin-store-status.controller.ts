import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store, validatePlatformStoreConfig } from '@scoutlgs/core';
import { AdminGuard } from '../auth/admin.guard';

/** The only onboarding-adjacent API surface that may change store activity. */
@Controller('admin/stores')
@UseGuards(AdminGuard)
export class AdminStoreStatusController {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  @Get()
  list() {
    return this.stores.find({ order: { displayName: 'ASC' } });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.stores.findOneByOrFail({ id });
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    const store = await this.stores.findOneBy({ id });
    if (!store) throw new NotFoundException('Store not found');
    const fields = ['name', 'displayName', 'baseUrl', 'isActive', 'scraperType', 'platformType', 'rateLimitPerSecond', 'scraperConfig', 'discoveryConfig'] as const;
    const patch = Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(body, field)).map((field) => [field, body[field]]));
    if (!Object.keys(patch).length) throw new BadRequestException('No editable fields supplied');
    if (patch.name !== undefined && (typeof patch.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(patch.name)))
      throw new BadRequestException('name must be a lowercase slug');
    if (patch.displayName !== undefined && (typeof patch.displayName !== 'string' || !patch.displayName.trim()))
      throw new BadRequestException('displayName is required');
    if (patch.baseUrl !== undefined) {
      try {
        const url = new URL(String(patch.baseUrl));
        if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error();
      } catch { throw new BadRequestException('baseUrl must be an absolute HTTP(S) origin'); }
    }
    if (patch.rateLimitPerSecond !== undefined && (!Number.isInteger(patch.rateLimitPerSecond) || Number(patch.rateLimitPerSecond) < 1))
      throw new BadRequestException('rateLimitPerSecond must be a positive integer');
    for (const field of ['scraperConfig', 'discoveryConfig'] as const) {
      if (patch[field] !== undefined && (!patch[field] || typeof patch[field] !== 'object' || Array.isArray(patch[field])))
        throw new BadRequestException(`${field} must be an object`);
    }
    const next = this.stores.merge(store, patch as Partial<Store>);
    if (next.platformType) {
      const validation = validatePlatformStoreConfig(next);
      if (!validation.valid) throw new BadRequestException(validation.errors);
    }
    return this.stores.save(next);
  }

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
