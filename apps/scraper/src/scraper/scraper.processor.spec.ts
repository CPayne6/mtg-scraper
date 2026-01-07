import { Test, TestingModule } from '@nestjs/testing';
import { ScrapeCardProcessor } from './scraper.processor';
import { ScraperService } from './scraper.service';
import { CacheService } from '@scoutlgs/core';
import { Job } from 'bullmq';
import { ScrapeCardJobData, ScrapeCardJobResult } from '@scoutlgs/shared';
import { mockCardWithStore, mockMultipleCards } from '@scoutlgs/core/src/test';

describe('ScrapeCardProcessor', () => {
  let processor: ScrapeCardProcessor;
  let scraperService: ReturnType<typeof vi.fn>;
  let cacheService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockScraperService = {
      searchCard: vi.fn(),
    };

    const mockCacheService = {
      setCard: vi.fn(),
      markScrapeComplete: vi.fn(),
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
      } as Job<ScrapeCardJobData>);

    it('should successfully process a scrape job', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Black Lotus',
        priority: 10,
        requestId: 'req-123',
      };
      const job = createMockJob(jobData);
      const mockResults = [mockCardWithStore];

      scraperService.searchCard.mockResolvedValue(mockResults);
      cacheService.setCard.mockResolvedValue(undefined);
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(scraperService.searchCard).toHaveBeenCalledWith('Black Lotus');
      expect(cacheService.setCard).toHaveBeenCalledWith('Black Lotus', mockResults);
      expect(cacheService.markScrapeComplete).toHaveBeenCalledWith('Black Lotus');
      expect(result.success).toBe(true);
      expect(result.cardName).toBe('Black Lotus');
      expect(result.results).toEqual(mockResults);
    });

    it('should cache results after successful scrape', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Lightning Bolt',
        priority: 10,
      };
      const job = createMockJob(jobData);
      const mockResults = mockMultipleCards;

      scraperService.searchCard.mockResolvedValue(mockResults);
      cacheService.setCard.mockResolvedValue(undefined);
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      await processor.process(job);

      expect(cacheService.setCard).toHaveBeenCalledWith('Lightning Bolt', mockResults);
    });

    it('should mark scrape as complete after processing', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Sol Ring',
        priority: 1,
      };
      const job = createMockJob(jobData);

      scraperService.searchCard.mockResolvedValue([]);
      cacheService.setCard.mockResolvedValue(undefined);
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      await processor.process(job);

      expect(cacheService.markScrapeComplete).toHaveBeenCalledWith('Sol Ring');
    });

    it('should handle scraper service errors gracefully', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Counterspell',
        priority: 10,
        requestId: 'req-456',
      };
      const job = createMockJob(jobData);
      const error = new Error('Scraper failed');

      scraperService.searchCard.mockRejectedValue(error);
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.cardName).toBe('Counterspell');
      expect(result.results).toEqual([]);
      expect(result.error).toBe('Scraper failed');
    });

    it('should mark scrape as complete even on failure', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Mox Ruby',
        priority: 10,
      };
      const job = createMockJob(jobData);

      scraperService.searchCard.mockRejectedValue(new Error('Network error'));
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      await processor.process(job);

      expect(cacheService.markScrapeComplete).toHaveBeenCalledWith('Mox Ruby');
    });

    it('should include timestamp in result', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Time Walk',
        priority: 10,
      };
      const job = createMockJob(jobData);

      scraperService.searchCard.mockResolvedValue([]);
      cacheService.setCard.mockResolvedValue(undefined);
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      const before = Date.now();
      const result = await processor.process(job);
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle job without requestId', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Ancestral Recall',
        priority: 1,
      };
      const job = createMockJob(jobData);

      scraperService.searchCard.mockResolvedValue([]);
      cacheService.setCard.mockResolvedValue(undefined);
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.cardName).toBe('Ancestral Recall');
    });

    it('should return empty results array on error', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Timetwister',
        priority: 10,
      };
      const job = createMockJob(jobData);

      scraperService.searchCard.mockRejectedValue(new Error('Test error'));
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(result.results).toEqual([]);
      expect(result.results).toHaveLength(0);
    });

    it('should handle non-Error exceptions', async () => {
      const jobData: ScrapeCardJobData = {
        cardName: 'Mox Pearl',
        priority: 10,
      };
      const job = createMockJob(jobData);

      scraperService.searchCard.mockRejectedValue('String error');
      cacheService.markScrapeComplete.mockResolvedValue(undefined);

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });
});
