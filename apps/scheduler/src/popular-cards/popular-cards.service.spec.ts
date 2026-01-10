import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PopularCardsService } from './popular-cards.service';
import { EdhrecService } from '../edhrec/edhrec.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PopularCardsService', () => {
  let service: PopularCardsService;
  let configService: ReturnType<typeof vi.fn>;
  let edhrecService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'popularCards.limit') return 1000;
        return undefined;
      }),
    };

    const mockEdhrecService = {
      fetchPopularCards: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PopularCardsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EdhrecService, useValue: mockEdhrecService },
      ],
    }).compile();

    service = module.get<PopularCardsService>(PopularCardsService);
    configService = module.get(ConfigService);
    edhrecService = module.get(EdhrecService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPopularCards', () => {
    it('should fetch cards from EDHREC API successfully', async () => {
      const mockCards = [
        'Black Lotus',
        'Sol Ring',
        'Lightning Bolt',
        'Counterspell',
      ];
      edhrecService.fetchPopularCards.mockResolvedValue(mockCards);

      const result = await service.getPopularCards();

      expect(edhrecService.fetchPopularCards).toHaveBeenCalled();
      expect(result).toEqual(mockCards);
      expect(result).toHaveLength(4);
    });

    it('should fallback to hardcoded list when EDHREC fails', async () => {
      edhrecService.fetchPopularCards.mockRejectedValue(new Error('API error'));

      const result = await service.getPopularCards();

      expect(edhrecService.fetchPopularCards).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should fallback to hardcoded list when EDHREC returns empty array', async () => {
      edhrecService.fetchPopularCards.mockResolvedValue([]);

      const result = await service.getPopularCards();

      expect(edhrecService.fetchPopularCards).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should respect the configured limit for hardcoded list', async () => {
      const customLimit = 50;
      configService.get.mockImplementation((key: string) => {
        if (key === 'popularCards.limit') return customLimit;
        return undefined;
      });
      edhrecService.fetchPopularCards.mockRejectedValue(new Error('API error'));

      const result = await service.getPopularCards();

      expect(result.length).toBeLessThanOrEqual(customLimit);
    });

    it('should handle EDHREC network errors', async () => {
      edhrecService.fetchPopularCards.mockRejectedValue(
        new Error('Network timeout'),
      );

      const result = await service.getPopularCards();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should prefer EDHREC API over hardcoded list', async () => {
      const edhrecCards = ['Card from EDHREC'];
      edhrecService.fetchPopularCards.mockResolvedValue(edhrecCards);

      const result = await service.getPopularCards();

      expect(result).toEqual(edhrecCards);
    });

    it('should use default limit of 1000 if not configured', async () => {
      configService.get.mockReturnValue(undefined);
      edhrecService.fetchPopularCards.mockRejectedValue(new Error('Error'));

      const result = await service.getPopularCards();

      expect(configService.get).toHaveBeenCalledWith('popularCards.limit');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
