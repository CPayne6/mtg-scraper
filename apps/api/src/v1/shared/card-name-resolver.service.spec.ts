import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CardName } from '@scoutlgs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardNameResolverService } from './card-name-resolver.service';

const mockQueryBuilder = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  getMany: vi.fn(),
};

const mockCardNameRepo = {
  find: vi.fn(),
  createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
};

describe('CardNameResolverService', () => {
  let service: CardNameResolverService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCardNameRepo.createQueryBuilder.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardNameResolverService,
        { provide: getRepositoryToken(CardName), useValue: mockCardNameRepo },
      ],
    }).compile();

    service = module.get<CardNameResolverService>(CardNameResolverService);
  });

  describe('normalizeCardName', () => {
    it('should lowercase and trim', () => {
      expect(service.normalizeCardName('  Lightning Bolt  ')).toBe('lightning bolt');
    });

    it('should collapse multiple spaces', () => {
      expect(service.normalizeCardName('Black   Lotus')).toBe('black lotus');
    });

    it('should handle apostrophes in card names', () => {
      expect(service.normalizeCardName("Urza's Saga")).toBe("urza's saga");
    });

    it('should strip bracketed content', () => {
      expect(service.normalizeCardName('Lightning Bolt [146] [Magic 2010] [Non-Foil]')).toBe('lightning bolt');
    });

    it('should strip parenthesized content', () => {
      expect(service.normalizeCardName('Sol Ring (Commander 2021) (Foil)')).toBe('sol ring');
    });

    it('should strip art treatments in parens', () => {
      expect(service.normalizeCardName('Shadowborn Apostle (Borderless)')).toBe('shadowborn apostle');
    });

    it('should strip mixed brackets and parens', () => {
      expect(service.normalizeCardName('Thrum of the Vestige - Lightning Bolt (Showcase) [FINAL FANTASY]')).toBe(
        'thrum of the vestige - lightning bolt',
      );
    });
  });

  describe('resolveCardNames', () => {
    it('should resolve exact matches via batch IN query', async () => {
      const cardName = {
        id: 1,
        name: 'Lightning Bolt',
        normalizedName: 'lightning bolt',
      } as CardName;

      mockCardNameRepo.find.mockResolvedValue([cardName]);

      const result = await service.resolveCardNames(['Lightning Bolt']);

      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0]).toEqual({
        input: 'Lightning Bolt',
        cardNameId: 1,
        resolvedName: 'Lightning Bolt',
        fuzzy: false,
      });
      expect(result.unresolved).toHaveLength(0);
    });

    it('should deduplicate input names', async () => {
      const cardName = {
        id: 1,
        name: 'Lightning Bolt',
        normalizedName: 'lightning bolt',
      } as CardName;

      mockCardNameRepo.find.mockResolvedValue([cardName]);

      const result = await service.resolveCardNames([
        'Lightning Bolt',
        'lightning bolt',
        'LIGHTNING BOLT',
      ]);

      expect(result.resolved).toHaveLength(1);
      expect(mockCardNameRepo.find).toHaveBeenCalledTimes(1);
    });

    it('should fuzzy match when exact match fails', async () => {
      mockCardNameRepo.find.mockResolvedValue([]);

      const fuzzyQb = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          { id: 2, name: 'Lightning Bolt', normalizedName: 'lightning bolt' },
        ]),
      };
      mockCardNameRepo.createQueryBuilder.mockReturnValue(fuzzyQb);

      const result = await service.resolveCardNames(['Ligthning Bolt']);

      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0].fuzzy).toBe(true);
      expect(result.resolved[0].resolvedName).toBe('Lightning Bolt');
      expect(result.unresolved).toHaveLength(0);
    });

    it('should report unresolved names when no match found', async () => {
      mockCardNameRepo.find.mockResolvedValue([]);

      const fuzzyQb = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };
      mockCardNameRepo.createQueryBuilder.mockReturnValue(fuzzyQb);

      const result = await service.resolveCardNames(['Totally Fake Card']);

      expect(result.resolved).toHaveLength(0);
      expect(result.unresolved).toEqual(['Totally Fake Card']);
    });

    it('should handle a mix of exact, fuzzy, and unresolved', async () => {
      const exactCard = {
        id: 1,
        name: 'Lightning Bolt',
        normalizedName: 'lightning bolt',
      } as CardName;

      mockCardNameRepo.find.mockResolvedValue([exactCard]);

      // First fuzzy call matches, second does not
      const fuzzyQb1 = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          { id: 3, name: 'Black Lotus', normalizedName: 'black lotus' },
        ]),
      };
      const fuzzyQb2 = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };
      mockCardNameRepo.createQueryBuilder
        .mockReturnValueOnce(fuzzyQb1)
        .mockReturnValueOnce(fuzzyQb2);

      const result = await service.resolveCardNames([
        'Lightning Bolt',
        'Blakc Lotus',
        'ZZZZZZZ',
      ]);

      expect(result.resolved).toHaveLength(2);
      expect(result.resolved[0].fuzzy).toBe(false);
      expect(result.resolved[1].fuzzy).toBe(true);
      expect(result.unresolved).toEqual(['ZZZZZZZ']);
    });

    it('should return empty results for empty input', async () => {
      mockCardNameRepo.find.mockResolvedValue([]);

      const result = await service.resolveCardNames([]);

      expect(result.resolved).toHaveLength(0);
      expect(result.unresolved).toHaveLength(0);
    });
  });
});
