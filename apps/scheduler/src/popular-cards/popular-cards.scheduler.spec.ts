import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PopularCardsScheduler } from './popular-cards.scheduler';
import { PopularCardsService } from './popular-cards.service';
import { QueueService } from '@scoutlgs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PopularCardsScheduler', () => {
  let scheduler: PopularCardsScheduler;
  let configService: ReturnType<typeof vi.fn>;
  let popularCardsService: ReturnType<typeof vi.fn>;
  let queueService: ReturnType<typeof vi.fn>;
  let schedulerRegistry: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'schedule.dailyScrapeTime') return '0 2 * * *';
        if (key === 'schedule.enabled') return true;
        return undefined;
      }),
      getOrThrow: vi.fn((key: string) => {
        if (key === 'schedule.dailyScrapeTime') return '0 2 * * *';
        throw new Error(`Missing config: ${key}`);
      }),
    };

    const mockPopularCardsService = {
      getPopularCards: vi.fn(),
    };

    const mockQueueService = {
      enqueueScrapeJob: vi.fn(),
    };

    const mockSchedulerRegistry = {
      addCronJob: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PopularCardsScheduler,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PopularCardsService, useValue: mockPopularCardsService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
      ],
    }).compile();

    scheduler = module.get<PopularCardsScheduler>(PopularCardsScheduler);
    configService = module.get(ConfigService);
    popularCardsService = module.get(PopularCardsService);
    queueService = module.get(QueueService);
    schedulerRegistry = module.get(SchedulerRegistry);
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should register cron job on initialization', () => {
      scheduler.onModuleInit();

      expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
        'daily-cards-scrape',
        expect.anything(),
      );
    });

    it('should use configured cron time', () => {
      scheduler.onModuleInit();

      expect(configService.getOrThrow).toHaveBeenCalledWith('schedule.dailyScrapeTime');
    });
  });

  describe('scrapePopularCards', () => {
    it('should skip when schedule is disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'schedule.enabled') return false;
        return undefined;
      });

      await scheduler.scrapePopularCards();

      expect(popularCardsService.getPopularCards).not.toHaveBeenCalled();
      expect(queueService.enqueueScrapeJob).not.toHaveBeenCalled();
    });

    it('should fetch and enqueue popular cards', async () => {
      const mockCards = ['Sol Ring', 'Command Tower', 'Arcane Signet'];
      popularCardsService.getPopularCards.mockResolvedValue(mockCards);
      queueService.enqueueScrapeJob.mockResolvedValue(undefined);

      await scheduler.scrapePopularCards();

      expect(popularCardsService.getPopularCards).toHaveBeenCalled();
      expect(queueService.enqueueScrapeJob).toHaveBeenCalledTimes(3);
      expect(queueService.enqueueScrapeJob).toHaveBeenCalledWith('Sol Ring', 1);
      expect(queueService.enqueueScrapeJob).toHaveBeenCalledWith(
        'Command Tower',
        1,
      );
      expect(queueService.enqueueScrapeJob).toHaveBeenCalledWith(
        'Arcane Signet',
        1,
      );
    });

    it('should process cards in batches of 50', async () => {
      const mockCards = Array.from({ length: 150 }, (_, i) => `Card ${i + 1}`);
      popularCardsService.getPopularCards.mockResolvedValue(mockCards);
      queueService.enqueueScrapeJob.mockResolvedValue(undefined);

      await scheduler.scrapePopularCards();

      expect(queueService.enqueueScrapeJob).toHaveBeenCalledTimes(150);
    });

    it('should handle queue errors gracefully', async () => {
      const mockCards = ['Sol Ring', 'Command Tower'];
      popularCardsService.getPopularCards.mockResolvedValue(mockCards);
      queueService.enqueueScrapeJob
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Queue error'));

      await scheduler.scrapePopularCards();

      // Should not throw and should continue processing
      expect(popularCardsService.getPopularCards).toHaveBeenCalled();
    });

    it('should handle errors when fetching popular cards', async () => {
      popularCardsService.getPopularCards.mockRejectedValue(
        new Error('Service error'),
      );

      await scheduler.scrapePopularCards();

      // Should not throw
      expect(popularCardsService.getPopularCards).toHaveBeenCalled();
      expect(queueService.enqueueScrapeJob).not.toHaveBeenCalled();
    });

    it('should enqueue with priority 1', async () => {
      const mockCards = ['Black Lotus'];
      popularCardsService.getPopularCards.mockResolvedValue(mockCards);
      queueService.enqueueScrapeJob.mockResolvedValue(undefined);

      await scheduler.scrapePopularCards();

      expect(queueService.enqueueScrapeJob).toHaveBeenCalledWith(
        'Black Lotus',
        1,
      );
    });

    it('should handle empty card list', async () => {
      popularCardsService.getPopularCards.mockResolvedValue([]);

      await scheduler.scrapePopularCards();

      expect(popularCardsService.getPopularCards).toHaveBeenCalled();
      expect(queueService.enqueueScrapeJob).not.toHaveBeenCalled();
    });

    it('should track enqueued and skipped counts', async () => {
      const mockCards = ['Card1', 'Card2', 'Card3'];
      popularCardsService.getPopularCards.mockResolvedValue(mockCards);
      queueService.enqueueScrapeJob
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce(undefined);

      await scheduler.scrapePopularCards();

      // 2 successful, 1 failed
      expect(queueService.enqueueScrapeJob).toHaveBeenCalledTimes(3);
    });
  });

  describe('triggerManualScrape', () => {
    it('should trigger scrape manually', async () => {
      const mockCards = ['Test Card'];
      popularCardsService.getPopularCards.mockResolvedValue(mockCards);
      queueService.enqueueScrapeJob.mockResolvedValue(undefined);

      await scheduler.triggerManualScrape();

      expect(popularCardsService.getPopularCards).toHaveBeenCalled();
      expect(queueService.enqueueScrapeJob).toHaveBeenCalledWith('Test Card', 1);
    });

    it('should respect schedule.enabled setting', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'schedule.enabled') return false;
        return undefined;
      });

      await scheduler.triggerManualScrape();

      expect(popularCardsService.getPopularCards).not.toHaveBeenCalled();
    });
  });
});
