import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { V1StoresController } from './v1-stores.controller';
import { V1StoresService, V1StoreResponse } from './v1-stores.service';

const storeResponse: V1StoreResponse = {
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  name: 'test-store',
  slug: 'test-store',
  displayName: 'Test Store',
  baseUrl: 'https://test-store.example',
  logoUrl: null,
  platformType: 'shopify',
  scraperType: 'binderpos',
  isActive: true,
  rateLimitPerSecond: 20,
  discoveryEnabled: true,
};

describe('V1StoresController', () => {
  let controller: V1StoresController;
  let storesService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    storesService = {
      listStores: vi.fn(),
      getStoreBySlug: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [V1StoresController],
      providers: [{ provide: V1StoresService, useValue: storesService }],
    }).compile();

    controller = module.get<V1StoresController>(V1StoresController);
  });

  describe('GET /v1/stores', () => {
    it('should return store list', async () => {
      storesService.listStores.mockResolvedValue({ stores: [storeResponse] });

      const result = await controller.listStores();

      expect(storesService.listStores).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ stores: [storeResponse] });
    });
  });

  describe('GET /v1/stores/:slug', () => {
    it('should return store detail by slug', async () => {
      storesService.getStoreBySlug.mockResolvedValue(storeResponse);

      const result = await controller.getStoreBySlug('test-store');

      expect(storesService.getStoreBySlug).toHaveBeenCalledWith('test-store');
      expect(result).toEqual(storeResponse);
    });
  });
});
