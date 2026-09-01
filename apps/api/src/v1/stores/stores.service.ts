import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from '@scoutlgs/core';

@Injectable()
export class StoresService {
  constructor(@InjectRepository(Store) private readonly stores: Repository<Store>) {}

  async listActive() {
    const stores = await this.stores.find({ where: { isActive: true }, order: { displayName: 'ASC' } });
    return { stores: stores.map((store) => ({
      id: store.id, uuid: store.uuid, name: store.name,
      displayName: store.displayName, logoUrl: store.logoUrl, baseUrl: store.baseUrl,
    })) };
  }
}
