import { Test, TestingModule } from '@nestjs/testing';
import { CardController } from './card.controller';
import { CardService } from './card.service';
import { mockCardSearchResponse } from '@mtg-scraper/core/test';
import { GetCardDto } from './dto/get-card.dto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CardController', () => {
  let controller: CardController;
  let cardService: { getCardByName: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const mockCardService = {
      getCardByName: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CardController],
      providers: [{ provide: CardService, useValue: mockCardService }],
    }).compile();

    controller = module.get<CardController>(CardController);
    cardService = module.get(CardService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCard', () => {
    it('should return card search response', async () => {
      const cardName = 'Black Lotus';
      const params: GetCardDto = { cardName };
      cardService.getCardByName.mockResolvedValue(mockCardSearchResponse);

      const result = await controller.getCard(params);

      expect(cardService.getCardByName).toHaveBeenCalledWith(cardName);
      expect(result).toEqual(mockCardSearchResponse);
    });

    it('should handle card names with special characters', async () => {
      const cardName = "Urza's Saga";
      const params: GetCardDto = { cardName };
      const response = { ...mockCardSearchResponse, cardName };
      cardService.getCardByName.mockResolvedValue(response);

      const result = await controller.getCard(params);

      expect(cardService.getCardByName).toHaveBeenCalledWith(cardName);
      expect(result.cardName).toBe(cardName);
    });

    it('should handle card names with spaces', async () => {
      const cardName = 'Lightning Bolt';
      const params: GetCardDto = { cardName };
      const response = { ...mockCardSearchResponse, cardName };
      cardService.getCardByName.mockResolvedValue(response);

      const result = await controller.getCard(params);

      expect(cardService.getCardByName).toHaveBeenCalledWith(cardName);
      expect(result.cardName).toBe(cardName);
    });

    it('should propagate errors from the service', async () => {
      const cardName = 'Black Lotus';
      const params: GetCardDto = { cardName };
      const error = new Error('Service error');
      cardService.getCardByName.mockRejectedValue(error);

      await expect(controller.getCard(params)).rejects.toThrow('Service error');
      expect(cardService.getCardByName).toHaveBeenCalledWith(cardName);
    });

    it('should handle empty results from service', async () => {
      const cardName = 'NonexistentCard';
      const params: GetCardDto = { cardName };
      const emptyResponse = {
        ...mockCardSearchResponse,
        cardName,
        results: [],
        priceStats: { min: 0, max: 0, avg: 0, count: 0 },
        stores: [],
      };
      cardService.getCardByName.mockResolvedValue(emptyResponse);

      const result = await controller.getCard(params);

      expect(result.results).toHaveLength(0);
      expect(result.stores).toHaveLength(0);
      expect(result.priceStats.count).toBe(0);
    });
  });
});
