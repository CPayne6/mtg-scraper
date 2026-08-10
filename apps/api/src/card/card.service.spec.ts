import { CardService } from './card.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CardService', () => {
  let service: CardService;
  let cardRepository: any;
  let cardNameRepository: any;
  let cardPrintingRepository: any;
  let storeRepository: any;
  let cacheService: any;
  let storeService: any;
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
      create: vi.fn((record) => record),
      save: vi.fn((record) => Promise.resolve({ id: 99, ...record })),
    };

    cardPrintingRepository = {};

    storeRepository = {};

    cacheService = {};

    storeService = {
      findAllActive: vi.fn().mockResolvedValue([]),
    };

    service = new CardService(
      cardRepository,
      cardNameRepository,
      cardPrintingRepository,
      storeRepository,
      cacheService,
      storeService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCardByOracleId', () => {
    it('creates a local record when an oracle-resolved card has not been seeded', async () => {
      cardNameRepository.findOne.mockResolvedValue(null);

      const result = await service.getCardByOracleId('11111111-1111-4111-8111-111111111111', 'Nonexistent Card');

      expect(result.cardName).toBe('Nonexistent Card');
      expect(result.cardNameId).toBe(99);
      expect(result.results).toEqual([]);
      expect(result.priceStats.count).toBe(0);
      expect(cardNameRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Nonexistent Card',
        normalizedName: 'nonexistent card',
      }));
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

  describe('getCardByCardNameId', () => {
    it('queries listings using the supplied card-name ID', async () => {
      cardNameRepository.findOne.mockResolvedValue({
        id: 42,
        name: 'Earth Rumble',
        normalizedName: 'earth rumble',
      });

      await service.getCardByCardNameId(42, 'Earth Rumble');

      expect(cardNameRepository.findOne).toHaveBeenCalledWith({ where: { id: 42 } });
      expect(listingsQuery.where).toHaveBeenCalledWith(
        'listing.card_name_id = :cardNameId',
        { cardNameId: 42 },
      );
    });
  });
});
