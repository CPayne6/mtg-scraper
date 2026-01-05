import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EdhrecService } from './edhrec.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

describe('EdhrecService', () => {
  let service: EdhrecService;
  let configService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'popularCards.edhrecBaseUrl') {
          return 'https://json.edhrec.com/pages/top/month-pastmonth';
        }
        if (key === 'popularCards.edhrecPages') {
          return 2;
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EdhrecService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EdhrecService>(EdhrecService);
    configService = module.get(ConfigService);

    // Reset fetch mock before each test
    (global.fetch as jest.Mock).mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fetchPopularCards', () => {
    it('should fetch cards from EDHREC API', async () => {
      const mockResponse = {
        cardviews: [
          { id: '1', name: 'Sol Ring' },
          { id: '2', name: 'Command Tower' },
          { id: '3', name: 'Arcane Signet' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.fetchPopularCards();

      expect(result).toContain('Sol Ring');
      expect(result).toContain('Command Tower');
      expect(result).toContain('Arcane Signet');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should deduplicate card names', async () => {
      const mockResponse1 = {
        cardviews: [
          { id: '1', name: 'Sol Ring' },
          { id: '2', name: 'Command Tower' },
        ],
      };

      const mockResponse2 = {
        cardviews: [
          { id: '3', name: 'Sol Ring' }, // Duplicate
          { id: '4', name: 'Arcane Signet' },
        ],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse1,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse2,
        });

      const result = await service.fetchPopularCards();

      // Should only have one "Sol Ring"
      const solRingCount = result.filter((card) => card === 'Sol Ring').length;
      expect(solRingCount).toBe(1);
    });

    it('should handle HTTP errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await service.fetchPopularCards();

      // Should return empty array or handle error
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.fetchPopularCards();

      expect(Array.isArray(result)).toBe(true);
    });

    it('should fetch multiple pages', async () => {
      const mockResponse = {
        cardviews: [{ id: '1', name: 'Test Card' }],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.fetchPopularCards();

      // With maxPages = 2, should fetch at least 2 pages
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty cardviews array', async () => {
      const mockResponse = {
        cardviews: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.fetchPopularCards();

      expect(result).toEqual([]);
    });

    it('should skip cards without names', async () => {
      const mockResponse = {
        cardviews: [
          { id: '1', name: 'Valid Card' },
          { id: '2' }, // No name
          { id: '3', name: '' }, // Empty name
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.fetchPopularCards();

      expect(result).toContain('Valid Card');
      expect(result.length).toBe(1);
    });

    it('should construct correct API URLs', async () => {
      const mockResponse = {
        cardviews: [{ id: '1', name: 'Test' }],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await service.fetchPopularCards();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://json.edhrec.com/pages/top/month-pastmonth-1.json'),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://json.edhrec.com/pages/top/month-pastmonth-2.json'),
      );
    });

    it('should handle partial page failures', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cardviews: [{ id: '1', name: 'Success Card' }],
          }),
        })
        .mockRejectedValueOnce(new Error('Page 2 failed'));

      const result = await service.fetchPopularCards();

      expect(result).toContain('Success Card');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
