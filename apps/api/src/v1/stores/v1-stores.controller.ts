import { Controller, Get, Param } from '@nestjs/common';
import {
  V1StoreListResponse,
  V1StoreResponse,
  V1StoresService,
} from './v1-stores.service';

@Controller('v1/stores')
export class V1StoresController {
  constructor(private readonly v1StoresService: V1StoresService) {}

  @Get()
  async listStores(): Promise<V1StoreListResponse> {
    return this.v1StoresService.listStores();
  }

  @Get(':slug')
  async getStoreBySlug(
    @Param('slug') slug: string,
  ): Promise<V1StoreResponse> {
    return this.v1StoresService.getStoreBySlug(slug);
  }
}
