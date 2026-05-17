import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PopularCardsScheduler } from './popular-cards.scheduler';
import { PopularCardsService } from './popular-cards.service';
import { CacheService, StoreService } from '@scoutlgs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PopularCardsScheduler', () => {
  let scheduler: PopularCardsScheduler;
  let configService: ReturnType<typeof vi.fn>;
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

    const mockSchedulerRegistry = {
      addCronJob: vi.fn(),
    };

    const mockCacheService = {
      schedulerJobStatus: vi.fn(),
      setSchedulerJobStatus: vi.fn(),
    };

    const mockStoreService = {
      findAllActive: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PopularCardsScheduler,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PopularCardsService, useValue: mockPopularCardsService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: StoreService, useValue: mockStoreService },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
      ],
    }).compile();

    scheduler = module.get<PopularCardsScheduler>(PopularCardsScheduler);
    configService = module.get(ConfigService);
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
      const result = await scheduler.scrapePopularCards({ enabled: false });

      expect(result).toEqual([]);
    });

    it('should return empty array (legacy V1 feature removed)', async () => {
      const result = await scheduler.scrapePopularCards({ enabled: true });

      expect(result).toEqual([]);
    });
  });
});
