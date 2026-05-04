import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListsController } from './lists.controller';
import { ListsService, CreateListResponse, ListWithPricesResponse } from './lists.service';
import type { PrincipalContext } from '../../auth/principal.types';
import { PrincipalGuard } from '../../auth/principal.guard';
import { OptionalPrincipalGuard } from '../../auth/optional-principal.guard';
import { PrincipalJwtService } from '../../auth/principal-jwt.service';

const LIST_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PRINCIPAL_UUID = '11111111-1111-1111-1111-111111111111';
const PRINCIPAL: PrincipalContext = {
  principalUuid: PRINCIPAL_UUID,
  kind: 'anonymous',
};

const mockCreateResponse: CreateListResponse = {
  id: LIST_UUID,
  name: 'Test Deck',
  cardCount: 2,
  createdAt: new Date('2026-01-01'),
  expiresAt: new Date('2026-12-31'),
  warnings: [],
};

const mockListWithPrices: ListWithPricesResponse = {
  id: LIST_UUID,
  name: 'Test Deck',
  filterStores: null,
  filterConditions: null,
  filterSetCode: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  expiresAt: new Date('2026-12-31'),
  cards: [],
  unresolved: [],
};

describe('ListsController', () => {
  let controller: ListsController;
  let listsService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    const mockListsService = {
      createList: vi.fn(),
      getListsForOwner: vi.fn(),
      getListWithPrices: vi.fn(),
      updateFilters: vi.fn(),
      replaceCards: vi.fn(),
      deleteList: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListsController],
      providers: [
        { provide: ListsService, useValue: mockListsService },
        { provide: PrincipalJwtService, useValue: { verifyRequest: vi.fn() } },
        { provide: PrincipalGuard, useValue: { canActivate: vi.fn() } },
        { provide: OptionalPrincipalGuard, useValue: { canActivate: vi.fn() } },
      ],
    }).compile();

    controller = module.get<ListsController>(ListsController);
    listsService = module.get(ListsService);
  });

  describe('POST /v1/lists', () => {
    it('should create a list for the current principal', async () => {
      listsService.createList.mockResolvedValue(mockCreateResponse);

      const result = await controller.createList(
        { name: 'Test Deck', cards: ['Lightning Bolt', 'Sol Ring'] },
        PRINCIPAL,
      );

      expect(listsService.createList).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Deck' }),
        PRINCIPAL_UUID,
      );
      expect(result).toEqual(mockCreateResponse);
    });
  });

  describe('GET /v1/lists', () => {
    it('should return lists for the current principal', async () => {
      const lists = [{ id: LIST_UUID, name: 'Deck', cardCount: 5 }];
      listsService.getListsForOwner.mockResolvedValue(lists);

      const result = await controller.getLists(PRINCIPAL);

      expect(listsService.getListsForOwner).toHaveBeenCalledWith(PRINCIPAL_UUID);
      expect(result.lists).toEqual(lists);
    });
  });

  describe('GET /v1/lists/:listId', () => {
    it('should return list with prices', async () => {
      listsService.getListWithPrices.mockResolvedValue(mockListWithPrices);

      const result = await controller.getListWithPrices(LIST_UUID, PRINCIPAL);

      expect(listsService.getListWithPrices).toHaveBeenCalledWith(
        LIST_UUID,
        PRINCIPAL_UUID,
      );
      expect(result).toEqual(mockListWithPrices);
    });
  });

  describe('PUT /v1/lists/:listId/filters', () => {
    it('should update filters for owner', async () => {
      listsService.updateFilters.mockResolvedValue(undefined);

      const result = await controller.updateFilters(
        LIST_UUID,
        { filterStores: 'f2f', filterConditions: 'NM' },
        PRINCIPAL,
      );

      expect(listsService.updateFilters).toHaveBeenCalledWith(
        LIST_UUID,
        PRINCIPAL_UUID,
        expect.objectContaining({ filterStores: 'f2f' }),
      );
      expect(result.message).toBe('Filters updated');
    });
  });

  describe('PUT /v1/lists/:listId/cards', () => {
    it('should replace cards for owner', async () => {
      const replaceResult = { cardCount: 3, warnings: [] };
      listsService.replaceCards.mockResolvedValue(replaceResult);

      const result = await controller.replaceCards(
        LIST_UUID,
        { cards: ['Sol Ring', 'Mana Crypt', 'Mox Diamond'] },
        PRINCIPAL,
      );

      expect(listsService.replaceCards).toHaveBeenCalledWith(
        LIST_UUID,
        PRINCIPAL_UUID,
        ['Sol Ring', 'Mana Crypt', 'Mox Diamond'],
      );
      expect(result).toEqual(replaceResult);
    });
  });

  describe('DELETE /v1/lists/:listId', () => {
    it('should delete list for owner', async () => {
      listsService.deleteList.mockResolvedValue(undefined);

      await controller.deleteList(LIST_UUID, PRINCIPAL);

      expect(listsService.deleteList).toHaveBeenCalledWith(
        LIST_UUID,
        PRINCIPAL_UUID,
      );
    });
  });
});
