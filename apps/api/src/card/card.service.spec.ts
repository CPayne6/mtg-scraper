import { Test, TestingModule } from '@nestjs/testing';
import { CardService } from './card.service';
import { CacheService, QueueService, StoreService } from '@scoutlgs/core';
import { mockCardWithStore, mockStores } from '@scoutlgs/core/test';
import { CardWithStore, ScrapeCardJobResult } from '@scoutlgs/shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Helper to create a mock cached result
const createCachedResult = (
  cards: CardWithStore[],
  storeErrors?: { storeName: string; error: string }[],
): ScrapeCardJobResult => ({
  cardName: 'Black Lotus',
  results: cards,
  timestamp: Date.now(),
  success: true,
  storeErrors,
});

describe('CardService', () => {
  let service: CardService;
  let cacheService: ReturnType<typeof vi.fn>;
  let queueService: ReturnType<typeof vi.fn>;
  let storeService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockCacheService = {
      getCachedResult: vi.fn(),
      isBeingScraped: vi.fn(),
      waitForScrapeCompletion: vi.fn(),
      markAsBeingScraped: vi.fn(),
    };

    const mockQueueService = {
      enqueueScrapeJob: vi.fn(),
    };

    const mockStoreService = {
      findAllActive: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: StoreService, useValue: mockStoreService },
      ],
    }).compile();

    service = module.get<CardService>(CardService);
    cacheService = module.get(CacheService);
    queueService = module.get(QueueService);
    storeService = module.get(StoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCardByName', () => {
    const cardName = 'Black Lotus';

    beforeEach(() => {
      storeService.findAllActive.mockResolvedValue(mockStores);
    });

    it('should return cached data when available with no store errors', async () => {
      const cachedCards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
      ];
      cacheService.getCachedResult.mockResolvedValue(createCachedResult(cachedCards));

      const result = await service.getCardByName(cardName);

      expect(cacheService.getCachedResult).toHaveBeenCalledWith(cardName);
      expect(result.cardName).toBe(cardName);
      expect(result.results).toEqual(cachedCards);
      expect(result.priceStats.count).toBe(1);
      expect(queueService.enqueueScrapeJob).not.toHaveBeenCalled();
    });

    it('should retry failed stores when cached data has store errors', async () => {
      const cachedCards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
      ];
      const storeErrors = [{ storeName: '401 Games', error: 'Network error' }];
      const updatedCards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
        { ...mockCardWithStore, store: '401 Games' },
      ];

      // First call returns cached result with errors
      cacheService.getCachedResult.mockResolvedValueOnce(
        createCachedResult(cachedCards, storeErrors),
      );
      cacheService.isBeingScraped.mockResolvedValue(false);
      cacheService.markAsBeingScraped.mockResolvedValue(true);
      cacheService.waitForScrapeCompletion.mockResolvedValue(updatedCards);
      // After scrape, return updated result
      cacheService.getCachedResult.mockResolvedValueOnce(
        createCachedResult(updatedCards),
      );

      const result = await service.getCardByName(cardName);

      expect(queueService.enqueueScrapeJob).toHaveBeenCalledWith(
        cardName,
        10,
        expect.any(String),
        ['401 Games'],
      );
      expect(result.results).toEqual(updatedCards);
    });

    it('should wait for scrape completion if card is already being scraped', async () => {
      const cards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
      ];
      cacheService.getCachedResult.mockResolvedValueOnce(null);
      cacheService.isBeingScraped.mockResolvedValue(true);
      cacheService.waitForScrapeCompletion.mockResolvedValue(cards);
      cacheService.getCachedResult.mockResolvedValueOnce(createCachedResult(cards));

      const result = await service.getCardByName(cardName);

      expect(cacheService.isBeingScraped).toHaveBeenCalledWith(cardName);
      expect(cacheService.waitForScrapeCompletion).toHaveBeenCalledWith(cardName);
      expect(queueService.enqueueScrapeJob).not.toHaveBeenCalled();
      expect(result.results).toEqual(cards);
    });

    it('should enqueue a scrape job when cache miss and not being scraped', async () => {
      const cards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
      ];
      cacheService.getCachedResult.mockResolvedValueOnce(null);
      cacheService.isBeingScraped.mockResolvedValue(false);
      cacheService.markAsBeingScraped.mockResolvedValue(true);
      cacheService.waitForScrapeCompletion.mockResolvedValue(cards);
      cacheService.getCachedResult.mockResolvedValueOnce(createCachedResult(cards));

      const result = await service.getCardByName(cardName);

      expect(cacheService.markAsBeingScraped).toHaveBeenCalledWith(
        cardName,
        expect.any(String),
      );
      expect(queueService.enqueueScrapeJob).toHaveBeenCalledWith(
        cardName,
        10,
        expect.any(String),
        undefined,
      );
      expect(cacheService.waitForScrapeCompletion).toHaveBeenCalledWith(cardName);
      expect(result.results).toEqual(cards);
    });

    it('should wait if race condition detected during marking', async () => {
      const cards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
      ];
      cacheService.getCachedResult.mockResolvedValueOnce(null);
      cacheService.isBeingScraped.mockResolvedValue(false);
      cacheService.markAsBeingScraped.mockResolvedValue(false); // Race condition
      cacheService.waitForScrapeCompletion.mockResolvedValue(cards);
      cacheService.getCachedResult.mockResolvedValueOnce(createCachedResult(cards));

      const result = await service.getCardByName(cardName);

      expect(cacheService.markAsBeingScraped).toHaveBeenCalled();
      expect(queueService.enqueueScrapeJob).not.toHaveBeenCalled();
      expect(cacheService.waitForScrapeCompletion).toHaveBeenCalledWith(cardName);
      expect(result.results).toEqual(cards);
    });

    it('should handle empty results', async () => {
      cacheService.getCachedResult.mockResolvedValueOnce(null);
      cacheService.isBeingScraped.mockResolvedValue(true);
      cacheService.waitForScrapeCompletion.mockResolvedValue([]);
      cacheService.getCachedResult.mockResolvedValueOnce(createCachedResult([]));

      const result = await service.getCardByName(cardName);

      expect(result.results).toEqual([]);
      expect(result.priceStats.count).toBe(0);
      expect(result.priceStats.min).toBe(0);
      expect(result.priceStats.max).toBe(0);
      expect(result.priceStats.avg).toBe(0);
    });

    it('should calculate price statistics correctly', async () => {
      const cards: CardWithStore[] = [
        { ...mockCardWithStore, price: 100, store: 'Face to Face Games' },
        { ...mockCardWithStore, price: 200, store: '401 Games' },
        { ...mockCardWithStore, price: 150, store: 'Hobbiesville' },
      ];
      cacheService.getCachedResult.mockResolvedValue(createCachedResult(cards));

      const result = await service.getCardByName(cardName);

      expect(result.priceStats.min).toBe(100);
      expect(result.priceStats.max).toBe(200);
      expect(result.priceStats.avg).toBe(150);
      expect(result.priceStats.count).toBe(3);
    });

    it('should build store info with card counts correctly', async () => {
      const cards: CardWithStore[] = [
        { ...mockCardWithStore, price: 100, store: 'Face to Face Games' },
        { ...mockCardWithStore, price: 110, store: 'Face to Face Games' },
        { ...mockCardWithStore, price: 200, store: '401 Games' },
      ];
      cacheService.getCachedResult.mockResolvedValue(createCachedResult(cards));

      const result = await service.getCardByName(cardName);

      const f2fStore = result.stores.find(s => s.displayName === 'Face to Face Games');
      const games401Store = result.stores.find(s => s.displayName === '401 Games');

      expect(f2fStore?.cardCount).toBe(2);
      expect(games401Store?.cardCount).toBe(1);
      expect(result.stores).toHaveLength(2);
    });

    it('should sort stores alphabetically by displayName', async () => {
      const cards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Hobbiesville' },
        { ...mockCardWithStore, store: 'Face to Face Games' },
        { ...mockCardWithStore, store: '401 Games' },
      ];
      cacheService.getCachedResult.mockResolvedValue(createCachedResult(cards));

      const result = await service.getCardByName(cardName);

      expect(result.stores[0].displayName).toBe('401 Games');
      expect(result.stores[1].displayName).toBe('Face to Face Games');
      expect(result.stores[2].displayName).toBe('Hobbiesville');
    });

    it('should only include stores with cards in the response', async () => {
      const cards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
      ];
      cacheService.getCachedResult.mockResolvedValue(createCachedResult(cards));

      const result = await service.getCardByName(cardName);

      expect(result.stores).toHaveLength(1);
      expect(result.stores[0].displayName).toBe('Face to Face Games');
    });

    it('should return timestamp in the response', async () => {
      cacheService.getCachedResult.mockResolvedValueOnce(null);
      cacheService.isBeingScraped.mockResolvedValue(true);
      cacheService.waitForScrapeCompletion.mockResolvedValue([]);
      cacheService.getCachedResult.mockResolvedValueOnce(createCachedResult([]));

      const before = Date.now();
      const result = await service.getCardByName(cardName);
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should include store errors in response when present', async () => {
      const cards: CardWithStore[] = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
      ];
      const storeErrors = [{ storeName: '401 Games', error: 'Network error' }];

      // First call has errors, triggers retry
      cacheService.getCachedResult.mockResolvedValueOnce(
        createCachedResult(cards, storeErrors),
      );
      cacheService.isBeingScraped.mockResolvedValue(false);
      cacheService.markAsBeingScraped.mockResolvedValue(true);
      cacheService.waitForScrapeCompletion.mockResolvedValue(cards);
      // After retry, still has errors
      cacheService.getCachedResult.mockResolvedValueOnce(
        createCachedResult(cards, storeErrors),
      );

      const result = await service.getCardByName(cardName);

      expect(result.storeErrors).toEqual(storeErrors);
    });
  });
});
