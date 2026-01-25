import { Test, TestingModule } from '@nestjs/testing';
import { ScrapeCardProcessor } from './scraper.processor';
import { ScraperService } from './scraper.service';
import { CacheService } from '@scoutlgs/core';
import { Job } from 'bullmq';
import { ScrapeCardJobData } from '@scoutlgs/shared';
import { mockCardWithStore, mockMultipleCards } from '@scoutlgs/core/test';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ScrapeCardProcessor', () => {
  let processor: ScrapeCardProcessor;
  let scraperService: ReturnType<typeof vi.fn>;
  let cacheService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockScraperService = {
      searchCardAtStore: vi.fn(),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
    };

    const mockCacheService = {
      setStoreCard: vi.fn(),
      markStoreScrapeComplete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScrapeCardProcessor,
        { provide: ScraperService, useValue: mockScraperService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    processor = module.get<ScrapeCardProcessor>(ScrapeCardProcessor);
    scraperService = module.get(ScraperService);
    cacheService = module.get(CacheService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    const createMockJob = (data: ScrapeCardJobData): Job<ScrapeCardJobData> =>
      ({
        id: '123',
        data,
      }) as Job<ScrapeCardJobData>;

    it('should successfully process a scrape job', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Black Lotus',
        storeName: 'f2f',
        priority: 10,
        requestId: 'req-123',
      };
      const job = createMockJob(jobData);
      const mockResults = [mockCardWithStore];

      scraperService.searchCardAtStore.mockResolvedValue({
        results: mockResults,
        error: undefined,
      });
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(scraperService.searchCardAtStore).toHaveBeenCalledWith(
        'Black Lotus',
        'f2f',
      );
      expect(cacheService.setStoreCard).toHaveBeenCalledWith(
        'Black Lotus',
        'f2f',
        mockResults,
        undefined,
        undefined,
      );
      expect(cacheService.markStoreScrapeComplete).toHaveBeenCalledWith(
        'Black Lotus',
        'f2f',
      );
      expect(result.success).toBe(true);
      expect(result.cardName).toBe('Black Lotus');
      expect(result.storeName).toBe('f2f');
      expect(result.results).toEqual(mockResults);
    });

    it('should cache results after successful scrape', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Lightning Bolt',
        storeName: '401',
        priority: 10,
      };
      const job = createMockJob(jobData);
      const mockResults = mockMultipleCards;

      scraperService.searchCardAtStore.mockResolvedValue({
        results: mockResults,
        error: undefined,
      });
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      await processor.process(job);

      expect(cacheService.setStoreCard).toHaveBeenCalledWith(
        'Lightning Bolt',
        '401',
        mockResults,
        undefined,
        undefined,
      );
    });

    it('should mark scrape as complete after processing', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Sol Ring',
        storeName: 'hobbies',
        priority: 1,
      };
      const job = createMockJob(jobData);

      scraperService.searchCardAtStore.mockResolvedValue({
        results: [],
        error: undefined,
      });
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      await processor.process(job);

      expect(cacheService.markStoreScrapeComplete).toHaveBeenCalledWith(
        'Sol Ring',
        'hobbies',
      );
    });

    it('should handle scraper service errors gracefully', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Counterspell',
        storeName: 'f2f',
        priority: 10,
        requestId: 'req-456',
      };
      const job = createMockJob(jobData);
      const error = new Error('Scraper failed');

      scraperService.searchCardAtStore.mockRejectedValue(error);
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.cardName).toBe('Counterspell');
      expect(result.storeName).toBe('f2f');
      expect(result.results).toEqual([]);
      expect(result.error).toBe('Scraper failed');
    });

    it('should mark scrape as complete even on failure', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Mox Ruby',
        storeName: '401',
        priority: 10,
      };
      const job = createMockJob(jobData);

      scraperService.searchCardAtStore.mockRejectedValue(
        new Error('Network error'),
      );
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      await processor.process(job);

      expect(cacheService.markStoreScrapeComplete).toHaveBeenCalledWith(
        'Mox Ruby',
        '401',
      );
    });

    it('should include timestamp in result', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Time Walk',
        storeName: 'f2f',
        priority: 10,
      };
      const job = createMockJob(jobData);

      scraperService.searchCardAtStore.mockResolvedValue({
        results: [],
        error: undefined,
      });
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      const before = Date.now();
      const result = await processor.process(job);
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle job without requestId', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Ancestral Recall',
        storeName: 'hobbies',
        priority: 1,
      };
      const job = createMockJob(jobData);

      scraperService.searchCardAtStore.mockResolvedValue({
        results: [],
        error: undefined,
      });
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.cardName).toBe('Ancestral Recall');
    });

    it('should return empty results array on error', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Timetwister',
        storeName: 'f2f',
        priority: 10,
      };
      const job = createMockJob(jobData);

      scraperService.searchCardAtStore.mockRejectedValue(new Error('Test error'));
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(result.results).toEqual([]);
      expect(result.results).toHaveLength(0);
    });

    it('should handle non-Error exceptions', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Mox Pearl',
        storeName: '401',
        priority: 10,
      };
      const job = createMockJob(jobData);

      scraperService.searchCardAtStore.mockRejectedValue('String error');
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });

    it('should increment retry count on error', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Black Lotus',
        storeName: 'f2f',
        priority: 10,
        retryCount: 1,
      };
      const job = createMockJob(jobData);

      scraperService.searchCardAtStore.mockResolvedValue({
        results: [],
        error: 'Store API error',
      });
      cacheService.setStoreCard.mockResolvedValue(undefined);
      cacheService.markStoreScrapeComplete.mockResolvedValue(undefined);

      await processor.process(job);

      // Should increment retry count from 1 to 2
      expect(cacheService.setStoreCard).toHaveBeenCalledWith(
        'Black Lotus',
        'f2f',
        [],
        'Store API error',
        2,
      );
    });
  });
});
