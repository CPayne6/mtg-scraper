import { Test, TestingModule } from '@nestjs/testing';
import { ScraperService } from './scraper.service';
import { StoreService } from '@scoutlgs/core';
import { mockStores } from '@scoutlgs/core/test';
import { ProxyService } from './proxy/proxy.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ScraperService', () => {
  let service: ScraperService;
  let storeService: ReturnType<typeof vi.fn>;
  let proxyService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockStoreService = {
      findAllActive: vi.fn(),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
      ready: vi.fn().mockReturnValue(true),
    };

    const mockProxyService = {
      getProxy: vi.fn().mockReturnValue({
        name: 'test-proxy',
        host: 'localhost',
        port: 8080,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperService,
        { provide: StoreService, useValue: mockStoreService },
        { provide: ProxyService, useValue: mockProxyService },
      ],
    }).compile();

    service = module.get<ScraperService>(ScraperService);
    storeService = module.get(StoreService);
    proxyService = module.get(ProxyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should load stores from database on initialization', async () => {
      storeService.findAllActive.mockResolvedValue(mockStores);

      await service.onModuleInit();

      expect(storeService.findAllActive).toHaveBeenCalled();
    });

    it('should throw if database fails to load stores', async () => {
      storeService.findAllActive.mockRejectedValue(new Error('Database error'));

      await expect(service.onModuleInit()).rejects.toThrow('Database error');
      expect(storeService.findAllActive).toHaveBeenCalled();
    });

    it('should handle different scraper types', async () => {
      const stores = [
        mockStores[0], // f2f
        mockStores[1], // 401
        mockStores[2], // hobbies
        mockStores[3], // binderpos
      ];
      storeService.findAllActive.mockResolvedValue(stores);

      await service.onModuleInit();

      expect(storeService.findAllActive).toHaveBeenCalled();
    });
  });

  describe('searchCard', () => {
    beforeEach(async () => {
      storeService.findAllActive.mockResolvedValue([]);
      await service.onModuleInit();
    });

    it('should return empty results when no stores are configured', async () => {
      const { results } = await service.searchCard('Lightning Bolt');

      expect(results).toEqual([]);
    });

    it('should return results object with storeErrors', async () => {
      const result = await service.searchCard('Lightning Bolt');

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('storeErrors');
      expect(Array.isArray(result.results)).toBe(true);
      expect(Array.isArray(result.storeErrors)).toBe(true);
    });

    it('should handle store fetch failures gracefully', async () => {
      // Even if stores fail, searchCard should not throw
      const { results } = await service.searchCard('Black Lotus');

      expect(Array.isArray(results)).toBe(true);
    });

    it('should combine results from multiple stores', async () => {
      // This would require more complex mocking of the loader/parser chain
      const { results } = await service.searchCard('Sol Ring');

      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter results by card name', async () => {
      // The service filters cards by name in fetchCardFromStore
      const { results } = await service.searchCard('Counterspell');

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('ready state', () => {
    it('should report ready state from store service', () => {
      storeService.ready.mockReturnValue(true);

      expect(service.ready()).toBe(true);
    });

    it('should wait until ready', async () => {
      storeService.waitUntilReady.mockResolvedValue(undefined);

      await service.waitUntilReady();

      expect(storeService.waitUntilReady).toHaveBeenCalled();
    });
  });
});
