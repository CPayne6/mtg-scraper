import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CardList, CardListEntry } from '@scoutlgs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { V1ListsService } from './v1-lists.service';
import { CardNameResolverService } from '../shared/card-name-resolver.service';

const OWNER_COOKIE = '11111111-1111-1111-1111-111111111111';
const LIST_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const makeList = (overrides: Partial<CardList> = {}): CardList => ({
  id: 1,
  uuid: LIST_UUID,
  ownerCookie: OWNER_COOKIE,
  ownerUserUuid: null,
  visibility: 'private',
  publicShareEnabled: false,
  publicShareTokenHash: null,
  publicShareExpiresAt: null,
  claimedAt: null,
  name: 'My Deck',
  filterStores: undefined,
  filterConditions: undefined,
  filterSetCode: undefined,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  expiresAt: new Date('2026-12-31'),
  entries: [],
  ...overrides,
} as CardList);

describe('V1ListsService', () => {
  let service: V1ListsService;
  let cardListRepo: Record<string, ReturnType<typeof vi.fn>>;
  let cardListEntryRepo: Record<string, ReturnType<typeof vi.fn>>;
  let cardNameResolver: Record<string, ReturnType<typeof vi.fn>>;
  let entityManager: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    const mockListQb = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      loadRelationCountAndMap: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(0),
      getMany: vi.fn().mockResolvedValue([]),
    };

    cardListRepo = {
      create: vi.fn((data) => ({ ...data, id: 1, uuid: LIST_UUID })),
      save: vi.fn((entity) => Promise.resolve({
        ...entity,
        id: entity.id ?? 1,
        uuid: entity.uuid ?? LIST_UUID,
        createdAt: new Date('2026-01-01'),
        expiresAt: new Date('2026-12-31'),
      })),
      findOne: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      createQueryBuilder: vi.fn().mockReturnValue(mockListQb),
    };

    cardListEntryRepo = {
      create: vi.fn((data) => data),
      save: vi.fn((entries) => Promise.resolve(entries)),
      delete: vi.fn(),
    };

    cardNameResolver = {
      resolveCardNames: vi.fn().mockResolvedValue({ resolved: [], unresolved: [] }),
      normalizeCardName: vi.fn((n) => n.toLowerCase().trim()),
    };

    entityManager = {
      query: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V1ListsService,
        { provide: getRepositoryToken(CardList), useValue: cardListRepo },
        { provide: getRepositoryToken(CardListEntry), useValue: cardListEntryRepo },
        { provide: CardNameResolverService, useValue: cardNameResolver },
        { provide: EntityManager, useValue: entityManager },
      ],
    }).compile();

    service = module.get<V1ListsService>(V1ListsService);
  });

  describe('createList', () => {
    it('should create a list and resolve card names', async () => {
      cardNameResolver.resolveCardNames.mockResolvedValue({
        resolved: [
          { input: 'Lightning Bolt', cardNameId: 1, resolvedName: 'Lightning Bolt', fuzzy: false },
          { input: 'Black Lotus', cardNameId: 2, resolvedName: 'Black Lotus', fuzzy: false },
        ],
        unresolved: [],
      });

      const result = await service.createList(
        { name: 'Test Deck', cards: ['Lightning Bolt', 'Black Lotus'] },
        OWNER_COOKIE,
      );

      expect(result.id).toBe(LIST_UUID);
      expect(result.name).toBe('Test Deck');
      expect(result.cardCount).toBe(2);
      expect(result.warnings).toHaveLength(0);
      expect(cardListEntryRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ cardNameId: 1, position: 1 }),
          expect.objectContaining({ cardNameId: 2, position: 2 }),
        ]),
      );
    });

    it('should include fuzzy match warnings', async () => {
      cardNameResolver.resolveCardNames.mockResolvedValue({
        resolved: [
          { input: 'Ligthning Bolt', cardNameId: 1, resolvedName: 'Lightning Bolt', fuzzy: true },
        ],
        unresolved: [],
      });

      const result = await service.createList(
        { name: 'Deck', cards: ['Ligthning Bolt'] },
        OWNER_COOKIE,
      );

      expect(result.warnings).toContain('"Ligthning Bolt" matched as "Lightning Bolt"');
    });

    it('should include unresolved card warnings', async () => {
      cardNameResolver.resolveCardNames.mockResolvedValue({
        resolved: [],
        unresolved: ['Totally Fake Card'],
      });

      const result = await service.createList(
        { name: 'Deck', cards: ['Totally Fake Card'] },
        OWNER_COOKIE,
      );

      expect(result.warnings).toContain('"Totally Fake Card" could not be found');
      expect(result.cardCount).toBe(0);
    });

    it('should throw ConflictException when max lists exceeded', async () => {
      const qb = cardListRepo.createQueryBuilder();
      qb.getCount.mockResolvedValue(5);

      await expect(
        service.createList({ name: 'Deck', cards: ['Sol Ring'] }, OWNER_COOKIE),
      ).rejects.toThrow(ConflictException);
    });

    it('should only count unclaimed owner-cookie lists against anonymous quota', async () => {
      await service.createList(
        { name: 'Deck', cards: ['Sol Ring'] },
        OWNER_COOKIE,
      );

      const qb = cardListRepo.createQueryBuilder();
      expect(qb.where).toHaveBeenCalledWith('cl.owner_cookie = :ownerCookie', {
        ownerCookie: OWNER_COOKIE,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('cl.owner_user_uuid IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('cl.expires_at > NOW()');
    });
  });

  describe('getListsForOwner', () => {
    it('should return list summaries for owner', async () => {
      const list = makeList();
      (list as any).cardCount = 3;
      const qb = cardListRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([list]);

      const result = await service.getListsForOwner(OWNER_COOKIE);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(LIST_UUID);
      expect(result[0].name).toBe('My Deck');
      expect(result[0].cardCount).toBe(3);
    });

    it('should return empty array when no lists exist', async () => {
      const qb = cardListRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);

      const result = await service.getListsForOwner(OWNER_COOKIE);

      expect(result).toHaveLength(0);
    });

    it('should only return unclaimed owner-cookie lists', async () => {
      const qb = cardListRepo.createQueryBuilder();

      await service.getListsForOwner(OWNER_COOKIE);

      expect(qb.where).toHaveBeenCalledWith('cl.owner_cookie = :ownerCookie', {
        ownerCookie: OWNER_COOKIE,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('cl.owner_user_uuid IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('cl.expires_at > NOW()');
    });
  });

  describe('getListWithPrices', () => {
    it('should return list with cheapest variants merged with counts', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());

      entityManager.query
        .mockResolvedValueOnce([
          {
            position: '1',
            card_name_id: '10',
            card_name: 'Lightning Bolt',
            variant_id: '100',
            price: '1.50',
            foil: false,
            quantity: 4,
            condition_code: 'NM',
            currency: 'CAD',
            image_url: null,
            store_slug: 'f2f',
            store_display_name: 'Face to Face Games',
            store_base_url: 'https://f2f.com',
            printing_id: '5',
            scryfall_id: 'abc',
            collector_number: '141',
            rarity: 'common',
            image_uri: 'https://img.com/bolt.jpg',
            set_code: 'lea',
            set_name: 'Alpha',
            product_handle: 'lightning-bolt',
          },
        ])
        .mockResolvedValueOnce([
          { card_name_id: '10', total_listings: '25' },
        ]);

      const result = await service.getListWithPrices(LIST_UUID);

      expect(result.id).toBe(LIST_UUID);
      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].cardName).toBe('Lightning Bolt');
      expect(result.cards[0].price).toBe(1.5);
      expect(result.cards[0].totalListings).toBe(25);
      expect(result.cards[0].store).toBe('Face to Face Games');
    });

    it('should throw NotFoundException for unknown list', async () => {
      cardListRepo.findOne.mockResolvedValue(null);

      await expect(service.getListWithPrices('bad-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for expired list', async () => {
      cardListRepo.findOne.mockResolvedValue(
        makeList({ expiresAt: new Date('2020-01-01') }),
      );

      await expect(service.getListWithPrices(LIST_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle cards with no listings', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());

      entityManager.query
        .mockResolvedValueOnce([
          {
            position: '1',
            card_name_id: '10',
            card_name: 'Obscure Card',
            variant_id: null,
            price: null,
            foil: null,
            quantity: null,
            condition_code: null,
            currency: null,
            image_url: null,
            store_slug: null,
            store_display_name: null,
            store_base_url: null,
            printing_id: null,
            scryfall_id: null,
            collector_number: null,
            rarity: null,
            image_uri: null,
            set_code: null,
            set_name: null,
            product_handle: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getListWithPrices(LIST_UUID);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].price).toBeNull();
      expect(result.cards[0].totalListings).toBe(0);
    });

    it('should sort cards by position', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());

      entityManager.query
        .mockResolvedValueOnce([
          { position: '3', card_name_id: '30', card_name: 'Card C', variant_id: null, price: null, foil: null, quantity: null, condition_code: null, currency: null, image_url: null, store_slug: null, store_display_name: null, store_base_url: null, printing_id: null, scryfall_id: null, collector_number: null, rarity: null, image_uri: null, set_code: null, set_name: null, product_handle: null },
          { position: '1', card_name_id: '10', card_name: 'Card A', variant_id: null, price: null, foil: null, quantity: null, condition_code: null, currency: null, image_url: null, store_slug: null, store_display_name: null, store_base_url: null, printing_id: null, scryfall_id: null, collector_number: null, rarity: null, image_uri: null, set_code: null, set_name: null, product_handle: null },
          { position: '2', card_name_id: '20', card_name: 'Card B', variant_id: null, price: null, foil: null, quantity: null, condition_code: null, currency: null, image_url: null, store_slug: null, store_display_name: null, store_base_url: null, printing_id: null, scryfall_id: null, collector_number: null, rarity: null, image_uri: null, set_code: null, set_name: null, product_handle: null },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getListWithPrices(LIST_UUID);

      expect(result.cards[0].cardName).toBe('Card A');
      expect(result.cards[1].cardName).toBe('Card B');
      expect(result.cards[2].cardName).toBe('Card C');
    });

    it('should pass filters from list to raw queries', async () => {
      cardListRepo.findOne.mockResolvedValue(
        makeList({ filterStores: 'f2f,401', filterConditions: 'NM,LP', filterSetCode: 'lea' }),
      );
      entityManager.query.mockResolvedValue([]);

      await service.getListWithPrices(LIST_UUID);

      // Both queries should receive parsed filters
      expect(entityManager.query).toHaveBeenCalledTimes(2);
      for (const call of entityManager.query.mock.calls) {
        const params = call[1];
        expect(params[0]).toBe(1); // listId
        expect(params[1]).toEqual(['f2f', '401']); // stores
        expect(params[2]).toEqual(['NM', 'LP']); // conditions
        expect(params[3]).toBe('lea'); // setCode
      }
    });
  });

  describe('updateFilters', () => {
    it('should update filters and reset expiry', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());

      await service.updateFilters(LIST_UUID, OWNER_COOKIE, {
        filterStores: 'f2f',
        filterConditions: 'NM',
        filterSetCode: 'lea',
      });

      expect(cardListRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          filterStores: 'f2f',
          filterConditions: 'NM',
          filterSetCode: 'lea',
        }),
      );
    });

    it('should throw ForbiddenException for non-owner', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());

      await expect(
        service.updateFilters(LIST_UUID, 'wrong-cookie', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for claimed account lists with stale owner cookie', async () => {
      cardListRepo.findOne.mockResolvedValue(
        makeList({ ownerUserUuid: '22222222-2222-2222-2222-222222222222' }),
      );

      await expect(
        service.updateFilters(LIST_UUID, OWNER_COOKIE, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for missing list', async () => {
      cardListRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateFilters('bad-uuid', OWNER_COOKIE, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('replaceCards', () => {
    it('should delete old entries and insert new resolved ones', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());
      cardNameResolver.resolveCardNames.mockResolvedValue({
        resolved: [
          { input: 'Sol Ring', cardNameId: 5, resolvedName: 'Sol Ring', fuzzy: false },
        ],
        unresolved: [],
      });

      const result = await service.replaceCards(LIST_UUID, OWNER_COOKIE, ['Sol Ring']);

      expect(cardListEntryRepo.delete).toHaveBeenCalledWith({ cardListId: 1 });
      expect(cardListEntryRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ cardNameId: 5, position: 1 }),
        ]),
      );
      expect(result.cardCount).toBe(1);
      expect(result.warnings).toHaveLength(0);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());

      await expect(
        service.replaceCards(LIST_UUID, 'wrong-cookie', ['Sol Ring']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for claimed account lists with stale owner cookie', async () => {
      cardListRepo.findOne.mockResolvedValue(
        makeList({ ownerUserUuid: '22222222-2222-2222-2222-222222222222' }),
      );

      await expect(
        service.replaceCards(LIST_UUID, OWNER_COOKIE, ['Sol Ring']),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteList', () => {
    it('should delete the list', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());

      await service.deleteList(LIST_UUID, OWNER_COOKIE);

      expect(cardListRepo.delete).toHaveBeenCalledWith(1);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      cardListRepo.findOne.mockResolvedValue(makeList());

      await expect(
        service.deleteList(LIST_UUID, 'wrong-cookie'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for claimed account lists with stale owner cookie', async () => {
      cardListRepo.findOne.mockResolvedValue(
        makeList({ ownerUserUuid: '22222222-2222-2222-2222-222222222222' }),
      );

      await expect(
        service.deleteList(LIST_UUID, OWNER_COOKIE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for missing list', async () => {
      cardListRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteList('bad-uuid', OWNER_COOKIE),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
