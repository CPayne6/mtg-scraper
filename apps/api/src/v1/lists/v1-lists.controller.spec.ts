import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { V1ListsController } from './v1-lists.controller';
import { V1ListsService, CreateListResponse, ListWithPricesResponse } from './v1-lists.service';

const LIST_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OWNER_COOKIE = '11111111-1111-1111-1111-111111111111';

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

describe('V1ListsController', () => {
  let controller: V1ListsController;
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
      controllers: [V1ListsController],
      providers: [{ provide: V1ListsService, useValue: mockListsService }],
    }).compile();

    controller = module.get<V1ListsController>(V1ListsController);
    listsService = module.get(V1ListsService);
  });

  describe('POST /v1/lists', () => {
    it('should create a list and set cookie when none exists', async () => {
      listsService.createList.mockResolvedValue(mockCreateResponse);
      const cookieFn = vi.fn();
      const res = { cookie: cookieFn } as any;

      const result = await controller.createList(
        { name: 'Test Deck', cards: ['Lightning Bolt', 'Sol Ring'] },
        undefined, // no cookie
        res,
      );

      expect(cookieFn).toHaveBeenCalledWith(
        'scoutlgs_uid',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        }),
      );
      expect(listsService.createList).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Deck' }),
        expect.any(String),
      );
      expect(result).toEqual(mockCreateResponse);
    });

    it('should reuse existing cookie', async () => {
      listsService.createList.mockResolvedValue(mockCreateResponse);
      const cookieFn = vi.fn();
      const res = { cookie: cookieFn } as any;

      await controller.createList(
        { name: 'Test Deck', cards: ['Sol Ring'] },
        OWNER_COOKIE,
        res,
      );

      expect(cookieFn).not.toHaveBeenCalled();
      expect(listsService.createList).toHaveBeenCalledWith(
        expect.anything(),
        OWNER_COOKIE,
      );
    });
  });

  describe('GET /v1/lists', () => {
    it('should return lists for owner cookie', async () => {
      const lists = [{ id: LIST_UUID, name: 'Deck', cardCount: 5 }];
      listsService.getListsForOwner.mockResolvedValue(lists);

      const result = await controller.getLists(OWNER_COOKIE);

      expect(listsService.getListsForOwner).toHaveBeenCalledWith(OWNER_COOKIE);
      expect(result.lists).toEqual(lists);
    });

    it('should return empty lists when no cookie', async () => {
      const result = await controller.getLists(undefined);

      expect(result.lists).toEqual([]);
      expect(listsService.getListsForOwner).not.toHaveBeenCalled();
    });
  });

  describe('GET /v1/lists/:listId', () => {
    it('should return list with prices', async () => {
      listsService.getListWithPrices.mockResolvedValue(mockListWithPrices);

      const result = await controller.getListWithPrices(LIST_UUID);

      expect(listsService.getListWithPrices).toHaveBeenCalledWith(LIST_UUID);
      expect(result).toEqual(mockListWithPrices);
    });
  });

  describe('PUT /v1/lists/:listId/filters', () => {
    it('should update filters for owner', async () => {
      listsService.updateFilters.mockResolvedValue(undefined);

      const result = await controller.updateFilters(
        LIST_UUID,
        { filterStores: 'f2f', filterConditions: 'NM' },
        OWNER_COOKIE,
      );

      expect(listsService.updateFilters).toHaveBeenCalledWith(
        LIST_UUID,
        OWNER_COOKIE,
        expect.objectContaining({ filterStores: 'f2f' }),
      );
      expect(result.message).toBe('Filters updated');
    });

    it('should return message when no cookie', async () => {
      const result = await controller.updateFilters(LIST_UUID, {}, undefined);

      expect(result.message).toBe('No owner cookie');
      expect(listsService.updateFilters).not.toHaveBeenCalled();
    });
  });

  describe('PUT /v1/lists/:listId/cards', () => {
    it('should replace cards for owner', async () => {
      const replaceResult = { cardCount: 3, warnings: [] };
      listsService.replaceCards.mockResolvedValue(replaceResult);

      const result = await controller.replaceCards(
        LIST_UUID,
        { cards: ['Sol Ring', 'Mana Crypt', 'Mox Diamond'] },
        OWNER_COOKIE,
      );

      expect(listsService.replaceCards).toHaveBeenCalledWith(
        LIST_UUID,
        OWNER_COOKIE,
        ['Sol Ring', 'Mana Crypt', 'Mox Diamond'],
      );
      expect(result).toEqual(replaceResult);
    });

    it('should return message when no cookie', async () => {
      const result = await controller.replaceCards(
        LIST_UUID,
        { cards: ['Sol Ring'] },
        undefined,
      );

      expect(result.message).toBe('No owner cookie');
      expect(listsService.replaceCards).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /v1/lists/:listId', () => {
    it('should delete list for owner', async () => {
      listsService.deleteList.mockResolvedValue(undefined);

      await controller.deleteList(LIST_UUID, OWNER_COOKIE);

      expect(listsService.deleteList).toHaveBeenCalledWith(LIST_UUID, OWNER_COOKIE);
    });

    it('should no-op when no cookie', async () => {
      await controller.deleteList(LIST_UUID, undefined);

      expect(listsService.deleteList).not.toHaveBeenCalled();
    });
  });
});
