import { Controller, Get } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreResponseDto } from './dto/store.dto';

@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  async getAllStores(): Promise<StoreResponseDto[]> {
    const stores = await this.storeService.findAllActive();
    return stores.map((store) => ({
      id: store.id,
      uuid: store.uuid,
      name: store.name,
      displayName: store.displayName,
      logoUrl: store.logoUrl,
      isActive: store.isActive,
    }));
  }
}
