import { Test, TestingModule } from '@nestjs/testing';
import { ScraperService } from './scraper.service';
import { StoreService } from '@scoutlgs/core';
import { mockStores } from '@scoutlgs/core/test';
import { LoaderService } from './loader.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ScraperService', () => {
  let service: ScraperService;
  let storeService: ReturnType<typeof vi.fn>;
  let loaderService: ReturnType<typeof vi.fn>;

  const mockLoader = {
    search: vi.fn().mockResolvedValue({ result: '[]', api: 'test' }),
  };

  const mockParser = {
    extractItems: vi.fn().mockResolvedValue({ result: [], error: undefined }),
  };

  beforeEach(async () => {
    const mockStoreService = {
      findAllActive: vi.fn(),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
      ready: vi.fn().mockReturnValue(true),
    };

    const mockLoaderService = {
      buildStoreConfig: vi.fn().mockImplementation((store) => ({
        name: store.name,
        displayName: store.displayName,
        loader: mockLoader,
        parser: mockParser,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperService,
        { provide: StoreService, useValue: mockStoreService },
        { provide: LoaderService, useValue: mockLoaderService },
      ],
    }).compile();

    service = module.get<ScraperService>(ScraperService);
    storeService = module.get(StoreService);
    loaderService = module.get(LoaderService);
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
      expect(loaderService.buildStoreConfig).toHaveBeenCalledTimes(stores.length);
    });

    it('should filter out null configs (unknown scraper types)', async () => {
      const stores = [mockStores[0], mockStores[1]];
      storeService.findAllActive.mockResolvedValue(stores);
      loaderService.buildStoreConfig
        .mockReturnValueOnce({
          name: stores[0].name,
          displayName: stores[0].displayName,
          loader: mockLoader,
          parser: mockParser,
        })
        .mockReturnValueOnce(null); // Unknown scraper type returns null

      await service.onModuleInit();

      // Only one store config should be kept (the non-null one)
      expect(loaderService.buildStoreConfig).toHaveBeenCalledTimes(2);
    });
  });

  describe('searchCardAtStore', () => {
    const storeName = 'facetofacegames'; // First store name from mockStores

    beforeEach(async () => {
      storeService.findAllActive.mockResolvedValue(mockStores.slice(0, 1));
      await service.onModuleInit();
    });

    it('should return results for a valid store', async () => {
      mockLoader.search.mockResolvedValue({ result: '[]', api: 'test' });
      mockParser.extractItems.mockResolvedValue({ result: [], error: undefined });

      const result = await service.searchCardAtStore('Lightning Bolt', storeName);

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should return error for unknown store', async () => {
      const result = await service.searchCardAtStore('Lightning Bolt', 'unknown-store');

      expect(result.results).toEqual([]);
      expect(result.error).toContain('Store not found');
    });

    it('should handle store fetch failures gracefully', async () => {
      mockLoader.search.mockRejectedValue(new Error('Network error'));

      const result = await service.searchCardAtStore('Black Lotus', storeName);

      expect(result.results).toEqual([]);
      expect(result.error).toContain('Network error');
    });

    it('should handle parser errors gracefully', async () => {
      mockLoader.search.mockResolvedValue({ result: 'invalid', api: 'test' });
      mockParser.extractItems.mockResolvedValue({
        result: [],
        error: 'Failed to parse response',
      });

      const result = await service.searchCardAtStore('Sol Ring', storeName);

      expect(result.results).toEqual([]);
      expect(result.error).toBe('Failed to parse response');
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
