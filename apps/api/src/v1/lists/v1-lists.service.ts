import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CardList, CardListEntry } from '@scoutlgs/core';
import { CardNameResolverService } from '../shared/card-name-resolver.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateFiltersDto } from './dto/update-filters.dto';

const MAX_LISTS_PER_OWNER = 5;

export interface ListSummary {
  id: string;
  name: string;
  cardCount: number;
  filterStores: string | null;
  filterConditions: string | null;
  filterSetCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface CheapestVariant {
  position: number;
  cardNameId: number;
  cardName: string;
  variantId: number | null;
  price: number | null;
  foil: boolean | null;
  quantity: number | null;
  condition: string | null;
  currency: string | null;
  imageUrl: string | null;
  store: string | null;
  storeSlug: string | null;
  storeBaseUrl: string | null;
  productHandle: string | null;
  printingId: number | null;
  scryfallId: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  imageUri: string | null;
  setCode: string | null;
  setName: string | null;
  totalListings: number;
}

export interface ListWithPricesResponse {
  id: string;
  name: string;
  filterStores: string | null;
  filterConditions: string | null;
  filterSetCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  cards: CheapestVariant[];
  unresolved: string[];
}

export interface CreateListResponse {
  id: string;
  name: string;
  cardCount: number;
  createdAt: Date;
  expiresAt: Date;
  warnings: string[];
}

@Injectable()
export class V1ListsService {
  private readonly logger = new Logger(V1ListsService.name);

  constructor(
    @InjectRepository(CardList)
    private readonly cardListRepository: Repository<CardList>,
    @InjectRepository(CardListEntry)
    private readonly cardListEntryRepository: Repository<CardListEntry>,
    private readonly cardNameResolver: CardNameResolverService,
    private readonly entityManager: EntityManager,
  ) {}

  async createList(
    dto: CreateListDto,
    ownerCookie: string,
  ): Promise<CreateListResponse> {
    // Enforce max lists per owner
    const existingCount = await this.cardListRepository
      .createQueryBuilder('cl')
      .where('cl.owner_cookie = :ownerCookie', { ownerCookie })
      .andWhere('cl.expires_at > NOW()')
      .getCount();

    if (existingCount >= MAX_LISTS_PER_OWNER) {
      throw new ConflictException(
        `Maximum of ${MAX_LISTS_PER_OWNER} lists allowed. Delete an existing list first.`,
      );
    }

    // Resolve card names
    const { resolved, unresolved } =
      await this.cardNameResolver.resolveCardNames(dto.cards);

    // Create list
    const cardList = new CardList();
    cardList.ownerCookie = ownerCookie;
    cardList.name = dto.name;
    cardList.filterStores = dto.filterStores;
    cardList.filterConditions = dto.filterConditions;
    cardList.filterSetCode = dto.filterSetCode;
    const savedList = await this.cardListRepository.save(cardList);

    // Create entries
    if (resolved.length > 0) {
      const entries = resolved.map((r, index) =>
        this.cardListEntryRepository.create({
          cardListId: savedList.id,
          cardNameId: r.cardNameId,
          position: index + 1,
        }),
      );
      await this.cardListEntryRepository.save(entries);
    }

    const warnings: string[] = [];
    for (const r of resolved) {
      if (r.fuzzy) {
        warnings.push(`"${r.input}" matched as "${r.resolvedName}"`);
      }
    }
    for (const name of unresolved) {
      warnings.push(`"${name}" could not be found`);
    }

    return {
      id: savedList.uuid,
      name: savedList.name,
      cardCount: resolved.length,
      createdAt: savedList.createdAt,
      expiresAt: savedList.expiresAt,
      warnings,
    };
  }

  async getListsForOwner(ownerCookie: string): Promise<ListSummary[]> {
    const lists = await this.cardListRepository
      .createQueryBuilder('cl')
      .loadRelationCountAndMap('cl.cardCount', 'cl.entries')
      .where('cl.owner_cookie = :ownerCookie', { ownerCookie })
      .andWhere('cl.expires_at > NOW()')
      .orderBy('cl.created_at', 'DESC')
      .getMany();

    return lists.map((l) => ({
      id: l.uuid,
      name: l.name,
      cardCount: (l as any).cardCount ?? 0,
      filterStores: l.filterStores ?? null,
      filterConditions: l.filterConditions ?? null,
      filterSetCode: l.filterSetCode ?? null,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      expiresAt: l.expiresAt,
    }));
  }

  async getListWithPrices(listUuid: string): Promise<ListWithPricesResponse> {
    const list = await this.cardListRepository.findOne({
      where: { uuid: listUuid },
    });

    if (!list || list.expiresAt < new Date()) {
      throw new NotFoundException('List not found');
    }

    // Parse filters
    const storeFilter = list.filterStores
      ? list.filterStores.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const conditionFilter = list.filterConditions
      ? list.filterConditions.split(',').map((c) => c.trim()).filter(Boolean)
      : null;
    const setFilter = list.filterSetCode ?? null;

    // Run cheapest variant + count queries in parallel
    const [cheapestRows, countRows] = await Promise.all([
      this.getCheapestVariants(list.id, storeFilter, conditionFilter, setFilter),
      this.getListingCounts(list.id, storeFilter, conditionFilter, setFilter),
    ]);

    // Build count lookup
    const countMap = new Map<number, number>();
    for (const row of countRows) {
      countMap.set(parseInt(row.card_name_id, 10), parseInt(row.total_listings, 10));
    }

    // Merge results
    const cards: CheapestVariant[] = cheapestRows.map((row) => {
      const cardNameId = parseInt(row.card_name_id, 10);
      return {
        position: parseInt(row.position, 10),
        cardNameId,
        cardName: row.card_name,
        variantId: row.variant_id ? parseInt(row.variant_id, 10) : null,
        price: row.price ? parseFloat(row.price) : null,
        foil: row.foil != null ? row.foil : null,
        quantity: row.quantity != null ? parseInt(row.quantity, 10) : null,
        condition: row.condition_code ?? null,
        currency: row.currency ?? null,
        imageUrl: row.image_url ?? null,
        store: row.store_display_name ?? null,
        storeSlug: row.store_slug ?? null,
        storeBaseUrl: row.store_base_url ?? null,
        productHandle: row.product_handle ?? null,
        printingId: row.printing_id ? parseInt(row.printing_id, 10) : null,
        scryfallId: row.scryfall_id ?? null,
        collectorNumber: row.collector_number ?? null,
        rarity: row.rarity ?? null,
        imageUri: row.image_uri ?? null,
        setCode: row.set_code ?? null,
        setName: row.set_name ?? null,
        totalListings: countMap.get(cardNameId) ?? 0,
      };
    });

    // Sort by position
    cards.sort((a, b) => a.position - b.position);

    return {
      id: list.uuid,
      name: list.name,
      filterStores: list.filterStores ?? null,
      filterConditions: list.filterConditions ?? null,
      filterSetCode: list.filterSetCode ?? null,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      expiresAt: list.expiresAt,
      cards,
      unresolved: [],
    };
  }

  async updateFilters(
    listUuid: string,
    ownerCookie: string,
    dto: UpdateFiltersDto,
  ): Promise<void> {
    const list = await this.findOwnedList(listUuid, ownerCookie);

    list.filterStores = dto.filterStores;
    list.filterConditions = dto.filterConditions;
    list.filterSetCode = dto.filterSetCode;
    list.expiresAt = this.expiresAt();
    await this.cardListRepository.save(list);
  }

  async replaceCards(
    listUuid: string,
    ownerCookie: string,
    cards: string[],
  ): Promise<{ cardCount: number; warnings: string[] }> {
    const list = await this.findOwnedList(listUuid, ownerCookie);

    const { resolved, unresolved } =
      await this.cardNameResolver.resolveCardNames(cards);

    // Delete old entries and insert new ones
    await this.cardListEntryRepository.delete({ cardListId: list.id });

    if (resolved.length > 0) {
      const entries = resolved.map((r, index) =>
        this.cardListEntryRepository.create({
          cardListId: list.id,
          cardNameId: r.cardNameId,
          position: index + 1,
        }),
      );
      await this.cardListEntryRepository.save(entries);
    }

    // Reset expiry
    await this.cardListRepository.update(list.id, {
      expiresAt: this.expiresAt(),
    });

    const warnings: string[] = [];
    for (const r of resolved) {
      if (r.fuzzy) {
        warnings.push(`"${r.input}" matched as "${r.resolvedName}"`);
      }
    }
    for (const name of unresolved) {
      warnings.push(`"${name}" could not be found`);
    }

    return { cardCount: resolved.length, warnings };
  }

  async deleteList(listUuid: string, ownerCookie: string): Promise<void> {
    const list = await this.findOwnedList(listUuid, ownerCookie);
    await this.cardListRepository.delete(list.id);
  }

  private async findOwnedList(
    listUuid: string,
    ownerCookie: string,
  ): Promise<CardList> {
    const list = await this.cardListRepository.findOne({
      where: { uuid: listUuid },
    });

    if (!list || list.expiresAt < new Date()) {
      throw new NotFoundException('List not found');
    }

    if (list.ownerCookie !== ownerCookie) {
      throw new ForbiddenException('You do not own this list');
    }

    return list;
  }

  private async getCheapestVariants(
    listId: number,
    stores: string[] | null,
    conditions: string[] | null,
    setCode: string | null,
  ): Promise<any[]> {
    return this.entityManager.query(
      `
      SELECT DISTINCT ON (e.card_name_id)
        e.position,
        e.card_name_id,
        cn.name AS card_name,
        v.id AS variant_id,
        v.price,
        v.foil,
        v.quantity,
        c.code AS condition_code,
        l.currency,
        l.image_url,
        s.name AS store_slug,
        s.display_name AS store_display_name,
        s.base_url AS store_base_url,
        p.id AS printing_id,
        p.scryfall_id,
        p.collector_number,
        p.rarity,
        p.image_uri,
        ps.code AS set_code,
        ps.name AS set_name,
        pu.handle AS product_handle
      FROM card_list_entries e
      JOIN card_names cn ON cn.id = e.card_name_id
      LEFT JOIN card_listings l ON l.card_name_id = e.card_name_id
      LEFT JOIN card_variants v ON v.card_listing_id = l.id
      LEFT JOIN stores s ON s.id = l.store_id
      LEFT JOIN card_conditions c ON c.id = v.condition_id
      LEFT JOIN product_urls pu ON pu.id = l.product_url_id
      LEFT JOIN card_printings p ON p.id = l.card_printing_id
      LEFT JOIN sets ps ON ps.id = p.set_id
      WHERE e.card_list_id = $1
        AND ($2::text[] IS NULL OR s.name = ANY($2))
        AND ($3::text[] IS NULL OR c.code = ANY($3))
        AND ($4::text IS NULL OR ps.code = $4)
      ORDER BY e.card_name_id, v.price ASC
      `,
      [listId, stores, conditions, setCode],
    );
  }

  private async getListingCounts(
    listId: number,
    stores: string[] | null,
    conditions: string[] | null,
    setCode: string | null,
  ): Promise<any[]> {
    return this.entityManager.query(
      `
      SELECT e.card_name_id, COUNT(v.id) AS total_listings
      FROM card_list_entries e
      JOIN card_listings l ON l.card_name_id = e.card_name_id
      JOIN card_variants v ON v.card_listing_id = l.id
      JOIN stores s ON s.id = l.store_id
      JOIN card_conditions c ON c.id = v.condition_id
      LEFT JOIN card_printings p ON p.id = l.card_printing_id
      LEFT JOIN sets ps ON ps.id = p.set_id
      WHERE e.card_list_id = $1
        AND ($2::text[] IS NULL OR s.name = ANY($2))
        AND ($3::text[] IS NULL OR c.code = ANY($3))
        AND ($4::text IS NULL OR ps.code = $4)
      GROUP BY e.card_name_id
      `,
      [listId, stores, conditions, setCode],
    );
  }

  private expiresAt(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  }
}
