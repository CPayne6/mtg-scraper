import { CardService } from './card.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CardService', () => {
  let service: CardService;
  let cardRepository: any;
  let cardNameRepository: any;
  let storeRepository: any;
  let cacheService: any;
  let storeService: any;
  let configService: any;
  let listingsQuery: any;

  beforeEach(() => {
    listingsQuery = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([]),
    };
    cardRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(listingsQuery),
    };

    cardNameRepository = {
      findOne: vi.fn(),
    };

    storeRepository = {};

    cacheService = {};

    storeService = {
      findAllActive: vi.fn().mockResolvedValue([]),
    };

    configService = {
      get: vi.fn(),
    };

    service = new CardService(
      cardRepository,
      cardNameRepository,
      storeRepository,
      cacheService,
      storeService,
      configService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCardByOracleId', () => {
    it('should return empty response when card name not found', async () => {
      cardNameRepository.findOne.mockResolvedValue(null);

      const result = await service.getCardByOracleId('11111111-1111-4111-8111-111111111111', 'Nonexistent Card');

      expect(result.cardName).toBe('Nonexistent Card');
      expect(result.results).toEqual([]);
      expect(result.priceStats.count).toBe(0);
    });

    it('should return listings from database when card name exists', async () => {
      cardNameRepository.findOne.mockResolvedValue({
        id: 1,
        name: 'Lightning Bolt',
        normalizedName: 'lightning bolt',
      });

      const result = await service.getCardByOracleId('11111111-1111-4111-8111-111111111111', 'Lightning Bolt');

      expect(result.cardName).toBe('Lightning Bolt');
      expect(cardNameRepository.findOne).toHaveBeenCalled();
      expect(listingsQuery.andWhere).toHaveBeenCalledWith(
        'variant.price_updated_at > :offerCutoff',
        expect.objectContaining({ offerCutoff: expect.any(Date) }),
      );
    });
  });
});
