import { CardController } from './card.controller';
import { CardService } from './card.service';
import { mockCardSearchResponse } from '@scoutlgs/core/test';
import { GetCardDto } from './dto/get-card.dto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CardController', () => {
  let controller: CardController;
  let cardService: {
    getCardByOracleId: ReturnType<typeof vi.fn>;
    getCardByCardNameId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    const mockCardService = {
      getCardByOracleId: vi.fn(),
      getCardByCardNameId: vi.fn(),
    };

    controller = new CardController(mockCardService as unknown as CardService);
    cardService = mockCardService;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCard', () => {
    it('should return card search response', async () => {
      const cardName = 'Black Lotus';
      const oracleId = '11111111-1111-4111-8111-111111111111';
      const params: GetCardDto = { cardName, oracleId };
      cardService.getCardByOracleId.mockResolvedValue(mockCardSearchResponse);

      const result = await controller.getCard(params);

      expect(cardService.getCardByOracleId).toHaveBeenCalledWith(oracleId, cardName);
      expect(result).toEqual(mockCardSearchResponse);
    });

    it('should handle card names with special characters', async () => {
      const cardName = "Urza's Saga";
      const params: GetCardDto = { cardName, oracleId: '11111111-1111-4111-8111-111111111111' };
      const response = { ...mockCardSearchResponse, cardName };
      cardService.getCardByOracleId.mockResolvedValue(response);

      const result = await controller.getCard(params);

      expect(cardService.getCardByOracleId).toHaveBeenCalledWith(params.oracleId, cardName);
      expect(result.cardName).toBe(cardName);
    });

    it('should handle card names with spaces', async () => {
      const cardName = 'Lightning Bolt';
      const params: GetCardDto = { cardName, oracleId: '11111111-1111-4111-8111-111111111111' };
      const response = { ...mockCardSearchResponse, cardName };
      cardService.getCardByOracleId.mockResolvedValue(response);

      const result = await controller.getCard(params);

      expect(cardService.getCardByOracleId).toHaveBeenCalledWith(params.oracleId, cardName);
      expect(result.cardName).toBe(cardName);
    });

    it('should propagate errors from the service', async () => {
      const cardName = 'Black Lotus';
      const params: GetCardDto = { cardName, oracleId: '11111111-1111-4111-8111-111111111111' };
      const error = new Error('Service error');
      cardService.getCardByOracleId.mockRejectedValue(error);

      await expect(controller.getCard(params)).rejects.toThrow('Service error');
      expect(cardService.getCardByOracleId).toHaveBeenCalledWith(params.oracleId, cardName);
    });

    it('should handle empty results from service', async () => {
      const cardName = 'NonexistentCard';
      const params: GetCardDto = { cardName, oracleId: '11111111-1111-4111-8111-111111111111' };
      const emptyResponse = {
        ...mockCardSearchResponse,
        cardName,
        results: [],
        priceStats: { min: 0, max: 0, avg: 0, count: 0 },
        stores: [],
      };
      cardService.getCardByOracleId.mockResolvedValue(emptyResponse);

      const result = await controller.getCard(params);

      expect(result.results).toHaveLength(0);
      expect(result.stores).toHaveLength(0);
      expect(result.priceStats.count).toBe(0);
    });
  });

  describe('getCardByCardNameId', () => {
    it('looks up the supplied local card-name ID', async () => {
      cardService.getCardByCardNameId.mockResolvedValue(mockCardSearchResponse);

      const result = await controller.getCardByCardNameId(42, 'Earth Rumble');

      expect(cardService.getCardByCardNameId).toHaveBeenCalledWith(42, 'Earth Rumble');
      expect(result).toEqual(mockCardSearchResponse);
    });
  });
});
