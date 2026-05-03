import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StoreService } from '@scoutlgs/core';
import type { Store } from '@scoutlgs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { V1StoresService } from './v1-stores.service';

const makeStore = (overrides: Partial<Store> = {}): Store => ({
  id: 1,
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  name: 'test-store',
  displayName: 'Test Store',
  baseUrl: 'https://test-store.example',
  logoUrl: 'https://test-store.example/logo.png',
  isActive: true,
  scraperType: 'binderpos',
  platformType: 'shopify',
  rateLimitPerSecond: 20,
  discoveryConfig: {
    mtgSinglesCollectionId: 1,
    discoveryEnabled: true,
  },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
} as Store);

describe('V1StoresService', () => {
  let service: V1StoresService;
  let storeService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    storeService = {
      findAll: vi.fn(),
      findByName: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V1StoresService,
        { provide: StoreService, useValue: storeService },
      ],
    }).compile();

    service = module.get<V1StoresService>(V1StoresService);
  });

  describe('listStores', () => {
    it('should return mapped store metadata', async () => {
      storeService.findAll.mockResolvedValue([
        makeStore(),
        makeStore({
          id: 2,
          uuid: '550e8400-e29b-41d4-a716-446655440001',
          name: 'inactive-store',
          displayName: 'Inactive Store',
          logoUrl: undefined,
          platformType: undefined,
          isActive: false,
          rateLimitPerSecond: 10,
          discoveryConfig: undefined,
        }),
      ]);

      const result = await service.listStores();

      expect(storeService.findAll).toHaveBeenCalledTimes(1);
      expect(result.stores).toEqual([
        expect.objectContaining({
          uuid: '550e8400-e29b-41d4-a716-446655440000',
          name: 'test-store',
          slug: 'test-store',
          displayName: 'Test Store',
          baseUrl: 'https://test-store.example',
          logoUrl: 'https://test-store.example/logo.png',
          platformType: 'shopify',
          scraperType: 'binderpos',
          isActive: true,
          rateLimitPerSecond: 20,
          discoveryEnabled: true,
        }),
        expect.objectContaining({
          name: 'inactive-store',
          slug: 'inactive-store',
          logoUrl: null,
          platformType: null,
          isActive: false,
          discoveryEnabled: null,
        }),
      ]);
    });
  });

  describe('getStoreBySlug', () => {
    it('should return mapped store metadata by slug', async () => {
      storeService.findByName.mockResolvedValue(makeStore());

      const result = await service.getStoreBySlug('test-store');

      expect(storeService.findByName).toHaveBeenCalledWith('test-store');
      expect(result).toMatchObject({
        name: 'test-store',
        slug: 'test-store',
        displayName: 'Test Store',
      });
    });

    it('should throw NotFoundException for unknown slug', async () => {
      storeService.findByName.mockResolvedValue(null);

      await expect(service.getStoreBySlug('missing-store')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
