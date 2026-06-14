import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CardList,
  CardListEntry,
  normalizeCondition,
  optimizeCartOptions,
  type CartOptimizationCandidate,
  type CartOptimizationResult,
  type CartOptimizationWantedCard,
  type ConditionFlexibilityMode,
} from '@scoutlgs/core';
import { Condition, type CardWithStore } from '@scoutlgs/shared';
import { CardNameResolverService } from '../shared/card-name-resolver.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateFiltersDto } from './dto/update-filters.dto';

const MAX_LISTS_PER_OWNER = 5;
const DEFAULT_OPTIMIZATION_OPTIONS = 3;
const MAX_OPTIMIZATION_OPTIONS = 5;
const DEFAULT_OPTIMIZATION_MINIMUM_CONDITION = Condition.LP;
const MAX_OPTIMIZATION_LIST_ENTRIES = 150;
const MAX_OPTIMIZATION_CANDIDATES_PER_CARD = 10;
const MAX_OPTIMIZATION_TOTAL_CANDIDATES_PER_CARD = 10;

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

export interface OptimizeListOptions {
  maxOptions?: number;
  minimumCondition?: string;
  conditionFlexibility?: ConditionFlexibilityMode;
  maxDowngradeSteps?: number;
  downgradePenaltyPerStep?: number;
}

export interface ListOptimizationResponse {
  id: string;
  name: string;
  generatedAt: number;
  options: CartOptimizationResult[];
}

interface OptimizationEntryRow {
  position: string;
  card_name_id: string;
  card_name: string;
  preferred_set_code: string | null;
}

interface OptimizationCandidateRow {
  card_name_id: string;
  variant_id: string;
  platform_variant_id: string | null;
  price: string;
  foil: boolean;
  quantity: string | number | null;
  condition_code: string;
  currency: string;
  image_url: string | null;
  store_slug: string;
  store_display_name: string;
  store_base_url: string;
  product_handle: string | null;
  scryfall_id: string | null;
  collector_number: string | null;
  image_uri: string | null;
  set_code: string | null;
  set_name: string | null;
}

@Injectable()
export class ListsService {
  private readonly logger = new Logger(ListsService.name);

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
    ownerPrincipalUuid: string,
  ): Promise<CreateListResponse> {
    // Enforce max lists per owner
    const existingCount = await this.cardListRepository
      .createQueryBuilder('cl')
      .where('cl.owner_principal_uuid = :ownerPrincipalUuid', {
        ownerPrincipalUuid,
      })
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
    cardList.ownerPrincipalUuid = ownerPrincipalUuid;
    cardList.name = dto.name;
    cardList.filterStores = dto.filterStores;
    cardList.filterConditions = dto.filterConditions;
    cardList.filterSetCode = dto.filterSetCode;
    cardList.visibility = dto.visibility ?? 'unlisted';
    const savedList = await this.cardListRepository.save(cardList);

    // Create entries
    if (resolved.length > 0) {
      const entries = resolved.map((r, index) =>
        this.cardListEntryRepository.create({
          cardListId: savedList.id,
          cardNameId: r.cardNameId,
          position: index + 1,
          preferredSetCode: this.parsePreferredSetCode(r.input),
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

  async getListsForOwner(ownerPrincipalUuid: string): Promise<ListSummary[]> {
    const lists = await this.cardListRepository
      .createQueryBuilder('cl')
      .loadRelationCountAndMap('cl.cardCount', 'cl.entries')
      .where('cl.owner_principal_uuid = :ownerPrincipalUuid', {
        ownerPrincipalUuid,
      })
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

  async getListWithPrices(
    listUuid: string,
    principalUuid?: string,
  ): Promise<ListWithPricesResponse> {
    const list = await this.cardListRepository.findOne({
      where: { uuid: listUuid },
    });

    if (!list || list.expiresAt < new Date()) {
      throw new NotFoundException('List not found');
    }

    if (
      list.visibility === 'private' &&
      list.ownerPrincipalUuid !== principalUuid
    ) {
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

  async getOptimizedListOptions(
    listUuid: string,
    principalUuid: string | undefined,
    options: OptimizeListOptions = {},
  ): Promise<ListOptimizationResponse> {
    const list = await this.findVisibleList(listUuid, principalUuid);
    const storeFilter = this.parseCsvFilter(list.filterStores);
    const setFilter = list.filterSetCode ?? null;
    const minimumCondition = this.resolveMinimumCondition(
      options.minimumCondition,
      list.filterConditions,
    );
    const maxOptions = this.normalizeMaxOptions(options.maxOptions);

    const entries = await this.getOptimizationEntries(list.id);
    if (entries.length === 0) {
      return {
        id: list.uuid,
        name: list.name,
        generatedAt: Date.now(),
        options: [],
      };
    }

    const cardNameIds = [...new Set(entries.map((entry) => parseInt(entry.card_name_id, 10)))];
    const candidateRows = await this.getOptimizationCandidates(
      cardNameIds,
      storeFilter,
      setFilter,
      this.getPreferredSetPairs(entries),
      minimumCondition,
    );
    const candidatesByCardNameId = this.groupCandidatesByCardNameId(candidateRows);
    const wantedCards = this.mapOptimizationWantedCards(entries, minimumCondition);
    const candidates = this.mapOptimizationCandidates(entries, candidatesByCardNameId);

    return {
      id: list.uuid,
      name: list.name,
      generatedAt: Date.now(),
      options: optimizeCartOptions({
        wantedCards,
        candidates,
        options: {
          defaultMinimumCondition: minimumCondition,
          defaultShippingCost: 3,
          maxResults: maxOptions,
          maxCandidatesPerWantedCard: MAX_OPTIMIZATION_CANDIDATES_PER_CARD,
          conditionFlexibility: {
            mode: options.conditionFlexibility ?? 'strict',
            maxDowngradeSteps: options.maxDowngradeSteps,
            downgradePenaltyPerStep: options.downgradePenaltyPerStep,
          },
          conditionValue: {
            mode: 'prefer-higher-condition',
            minimumHigherConditionPrice: 50,
            minUpgradePremium: 10,
            maxUpgradePremium: 30,
          },
        },
      }),
    };
  }

  async updateFilters(
    listUuid: string,
    ownerPrincipalUuid: string,
    dto: UpdateFiltersDto,
  ): Promise<void> {
    const list = await this.findOwnedList(listUuid, ownerPrincipalUuid);

    list.filterStores = dto.filterStores;
    list.filterConditions = dto.filterConditions;
    list.filterSetCode = dto.filterSetCode;
    list.expiresAt = this.expiresAt();
    await this.cardListRepository.save(list);
  }

  async updateName(
    listUuid: string,
    ownerPrincipalUuid: string,
    name: string,
  ): Promise<void> {
    const list = await this.findOwnedList(listUuid, ownerPrincipalUuid);
    list.name = name;
    list.expiresAt = this.expiresAt();
    await this.cardListRepository.save(list);
  }

  async replaceCards(
    listUuid: string,
    ownerPrincipalUuid: string,
    cards: string[],
  ): Promise<{ cardCount: number; warnings: string[] }> {
    const list = await this.findOwnedList(listUuid, ownerPrincipalUuid);

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
          preferredSetCode: this.parsePreferredSetCode(r.input),
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

  async deleteList(
    listUuid: string,
    ownerPrincipalUuid: string,
  ): Promise<void> {
    const list = await this.findOwnedList(listUuid, ownerPrincipalUuid);
    await this.cardListRepository.delete(list.id);
  }

  private async findOwnedList(
    listUuid: string,
    ownerPrincipalUuid: string,
  ): Promise<CardList> {
    const list = await this.cardListRepository.findOne({
      where: { uuid: listUuid },
    });

    if (!list || list.expiresAt < new Date()) {
      throw new NotFoundException('List not found');
    }

    if (list.ownerPrincipalUuid !== ownerPrincipalUuid) {
      throw new ForbiddenException('You do not own this list');
    }

    return list;
  }

  private async findVisibleList(
    listUuid: string,
    principalUuid?: string,
  ): Promise<CardList> {
    const list = await this.cardListRepository.findOne({
      where: { uuid: listUuid },
    });

    if (!list || list.expiresAt < new Date()) {
      throw new NotFoundException('List not found');
    }

    if (list.visibility === 'private' && list.ownerPrincipalUuid !== principalUuid) {
      throw new NotFoundException('List not found');
    }

    return list;
  }

  private async getOptimizationEntries(listId: number): Promise<OptimizationEntryRow[]> {
    return this.entityManager.query(
      `
      SELECT
        e.position,
        e.card_name_id,
        cn.name AS card_name,
        e.preferred_set_code
      FROM card_list_entries e
      JOIN card_names cn ON cn.id = e.card_name_id
      WHERE e.card_list_id = $1
      ORDER BY e.position ASC
      LIMIT $2
      `,
      [listId, MAX_OPTIMIZATION_LIST_ENTRIES],
    );
  }

  private async getOptimizationCandidates(
    cardNameIds: number[],
    stores: string[] | null,
    setCode: string | null,
    preferredSetPairs: Array<{ cardNameId: number; setCode: string }>,
    minimumCondition: Condition,
  ): Promise<OptimizationCandidateRow[]> {
    if (cardNameIds.length === 0) return [];
    const preferredCardNameIds = preferredSetPairs.map((pair) => pair.cardNameId);
    const preferredSetCodes = preferredSetPairs.map((pair) => pair.setCode);
    const acceptableConditionCodes = this.conditionCodesAtOrAbove(minimumCondition);

    return this.entityManager.query(
      `
      WITH preferred_sets AS (
        SELECT DISTINCT card_name_id, set_code
        FROM unnest($4::int[], $5::text[]) AS preferred(card_name_id, set_code)
      ),
      ranked_candidates AS (
        SELECT
          l.card_name_id,
          v.id AS variant_id,
          v.platform_variant_id,
          v.price,
          v.foil,
          v.quantity,
          c.code AS condition_code,
          l.currency,
          l.image_url,
          s.name AS store_slug,
          s.display_name AS store_display_name,
          s.base_url AS store_base_url,
          pu.handle AS product_handle,
          p.scryfall_id,
          p.collector_number,
          p.image_uri,
          ps.code AS set_code,
          ps.name AS set_name,
          preferred_sets.set_code AS requested_set_code,
          ROW_NUMBER() OVER (
            PARTITION BY l.card_name_id, s.name
            ORDER BY v.price ASC, v.id ASC
          ) AS store_price_rank,
          ROW_NUMBER() OVER (
            PARTITION BY l.card_name_id, s.name, c.code
            ORDER BY v.price ASC, v.id ASC
          ) AS store_condition_rank,
          ROW_NUMBER() OVER (
            PARTITION BY
              l.card_name_id,
              s.name,
              CASE WHEN c.code = ANY($6::text[]) THEN true ELSE false END
            ORDER BY v.price ASC, v.id ASC
          ) AS store_minimum_condition_rank,
          ROW_NUMBER() OVER (
            PARTITION BY l.card_name_id, s.name, ps.code
            ORDER BY v.price ASC, v.id ASC
          ) AS requested_set_store_price_rank,
          ROW_NUMBER() OVER (
            PARTITION BY l.card_name_id, s.name, ps.code, c.code
            ORDER BY v.price ASC, v.id ASC
          ) AS requested_set_store_condition_rank,
          ROW_NUMBER() OVER (
            PARTITION BY
              l.card_name_id,
              s.name,
              ps.code,
              CASE WHEN c.code = ANY($6::text[]) THEN true ELSE false END
            ORDER BY v.price ASC, v.id ASC
          ) AS requested_set_store_minimum_condition_rank
        FROM card_listings l
        JOIN card_variants v ON v.card_listing_id = l.id
        JOIN stores s ON s.id = l.store_id
        JOIN card_conditions c ON c.id = v.condition_id
        LEFT JOIN product_urls pu ON pu.id = l.product_url_id
        LEFT JOIN card_printings p ON p.id = l.card_printing_id
        LEFT JOIN sets ps ON ps.id = p.set_id
        LEFT JOIN preferred_sets
          ON preferred_sets.card_name_id = l.card_name_id
          AND preferred_sets.set_code = ps.code
        WHERE l.card_name_id = ANY($1::int[])
          AND ($2::text[] IS NULL OR s.name = ANY($2))
          AND ($3::text IS NULL OR ps.code = $3)
          AND (v.quantity IS NULL OR v.quantity > 0)
      ),
      bounded_candidates AS (
        SELECT *
        FROM ranked_candidates
        WHERE store_price_rank = 1
          OR (
            condition_code = 'nm'
            AND store_condition_rank = 1
          )
          OR (
            condition_code = ANY($6::text[])
            AND store_minimum_condition_rank = 1
          )
          OR (
            requested_set_code IS NOT NULL
            AND requested_set_store_price_rank = 1
          )
          OR (
            requested_set_code IS NOT NULL
            AND condition_code = 'nm'
            AND requested_set_store_condition_rank = 1
          )
          OR (
            requested_set_code IS NOT NULL
            AND condition_code = ANY($6::text[])
            AND requested_set_store_minimum_condition_rank = 1
          )
      ),
      final_candidates AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY card_name_id
            ORDER BY
              CASE WHEN store_price_rank = 1 THEN 0 ELSE 1 END,
              price ASC,
              variant_id ASC
          ) AS final_rank
        FROM bounded_candidates
      )
      SELECT
        card_name_id,
        variant_id,
        platform_variant_id,
        price,
        foil,
        quantity,
        condition_code,
        currency,
        image_url,
        store_slug,
        store_display_name,
        store_base_url,
        product_handle,
        scryfall_id,
        collector_number,
        image_uri,
        set_code,
        set_name
      FROM final_candidates
      WHERE final_rank <= $7
      ORDER BY card_name_id ASC, price ASC, variant_id ASC
      `,
      [
        cardNameIds,
        stores,
        setCode,
        preferredCardNameIds,
        preferredSetCodes,
        acceptableConditionCodes,
        MAX_OPTIMIZATION_TOTAL_CANDIDATES_PER_CARD,
      ],
    );
  }

  private groupCandidatesByCardNameId(
    rows: OptimizationCandidateRow[],
  ): Map<number, OptimizationCandidateRow[]> {
    const grouped = new Map<number, OptimizationCandidateRow[]>();
    for (const row of rows) {
      const cardNameId = parseInt(row.card_name_id, 10);
      const existing = grouped.get(cardNameId) ?? [];
      existing.push(row);
      grouped.set(cardNameId, existing);
    }
    return grouped;
  }

  private getPreferredSetPairs(
    entries: OptimizationEntryRow[],
  ): Array<{ cardNameId: number; setCode: string }> {
    const seen = new Set<string>();
    const pairs: Array<{ cardNameId: number; setCode: string }> = [];

    for (const entry of entries) {
      if (!entry.preferred_set_code) continue;
      const cardNameId = parseInt(entry.card_name_id, 10);
      const setCode = entry.preferred_set_code.toLowerCase();
      const key = `${cardNameId}|${setCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ cardNameId, setCode });
    }

    return pairs;
  }

  private mapOptimizationWantedCards(
    entries: OptimizationEntryRow[],
    minimumCondition: Condition,
  ): CartOptimizationWantedCard[] {
    return entries.map((entry) => ({
      key: entry.position,
      name: entry.card_name,
      minimumCondition,
      preferredSetCode: entry.preferred_set_code ?? undefined,
      setPreference: entry.preferred_set_code ? 'preferred' : 'any',
    }));
  }

  private mapOptimizationCandidates(
    entries: OptimizationEntryRow[],
    candidatesByCardNameId: Map<number, OptimizationCandidateRow[]>,
  ): CartOptimizationCandidate[] {
    const candidates: CartOptimizationCandidate[] = [];

    for (const entry of entries) {
      const cardNameId = parseInt(entry.card_name_id, 10);
      const rows = candidatesByCardNameId.get(cardNameId) ?? [];
      for (const row of rows) {
        candidates.push({
          wantedCardKey: entry.position,
          offer: this.mapOptimizationCandidateOffer(row, entry.card_name),
          availableQuantity: this.parseAvailableQuantity(row.quantity),
          setCode: row.set_code ?? undefined,
          setName: row.set_name ?? undefined,
        });
      }
    }

    return candidates;
  }

  private mapOptimizationCandidateOffer(
    row: OptimizationCandidateRow,
    cardName: string,
  ): CardWithStore {
    const setName = row.set_name ?? '';
    const productLink = row.product_handle
      ? `${row.store_base_url}/products/${row.product_handle}`
      : row.store_base_url;

    return {
      id: parseInt(row.variant_id, 10),
      price: parseFloat(row.price),
      condition: normalizeCondition(row.condition_code),
      foil: row.foil,
      image: row.image_url ?? row.image_uri ?? '',
      title: `${cardName}${setName ? ` [${setName}]` : ''}`,
      currency: row.currency,
      link: productLink,
      set: setName,
      card_number: row.collector_number ?? '',
      scryfall_id: row.scryfall_id ?? undefined,
      variant_id: row.platform_variant_id ?? undefined,
      store: row.store_display_name,
      store_key: row.store_slug,
    };
  }

  private parseAvailableQuantity(
    quantity: string | number | null,
  ): number | undefined {
    if (quantity == null) return undefined;
    const parsed = Number(quantity);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private async getCheapestVariants(
    listId: number,
    stores: string[] | null,
    conditions: string[] | null,
    setCode: string | null,
  ): Promise<any[]> {
    return this.entityManager.query(
      `
      SELECT
        e.position,
        e.card_name_id,
        cn.name AS card_name,
        best.variant_id,
        best.price,
        best.foil,
        best.quantity,
        best.condition_code,
        best.currency,
        best.image_url,
        best.store_slug,
        best.store_display_name,
        best.store_base_url,
        best.printing_id,
        best.scryfall_id,
        best.collector_number,
        best.rarity,
        best.image_uri,
        best.set_code,
        best.set_name,
        best.product_handle
      FROM card_list_entries e
      JOIN card_names cn ON cn.id = e.card_name_id
      LEFT JOIN LATERAL (
        SELECT
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
        FROM card_listings l
        JOIN card_variants v ON v.card_listing_id = l.id
        JOIN stores s ON s.id = l.store_id
        JOIN card_conditions c ON c.id = v.condition_id
        LEFT JOIN product_urls pu ON pu.id = l.product_url_id
        LEFT JOIN card_printings p ON p.id = l.card_printing_id
        LEFT JOIN sets ps ON ps.id = p.set_id
        WHERE l.card_name_id = e.card_name_id
          AND ($2::text[] IS NULL OR s.name = ANY($2))
          AND ($3::text[] IS NULL OR c.code = ANY($3))
          AND ($4::text IS NULL OR ps.code = $4)
        ORDER BY v.price ASC
        LIMIT 1
      ) best ON true
      WHERE e.card_list_id = $1
      ORDER BY e.position ASC
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
      WITH list_card_names AS (
        SELECT DISTINCT card_name_id
        FROM card_list_entries
        WHERE card_list_id = $1
      )
      SELECT e.card_name_id, COUNT(v.id) AS total_listings
      FROM list_card_names e
      JOIN card_listings l ON l.card_name_id = e.card_name_id
      JOIN card_variants v ON v.card_listing_id = l.id
      JOIN stores s ON s.id = l.store_id
      JOIN card_conditions c ON c.id = v.condition_id
      LEFT JOIN card_printings p ON p.id = l.card_printing_id
      LEFT JOIN sets ps ON ps.id = p.set_id
      WHERE ($2::text[] IS NULL OR s.name = ANY($2))
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

  private parseCsvFilter(value?: string | null): string[] | null {
    const parsed = value
      ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
      : [];
    return parsed.length > 0 ? parsed : null;
  }

  private resolveMinimumCondition(
    requestedMinimumCondition: string | undefined,
    filterConditions: string | undefined,
  ): Condition {
    if (requestedMinimumCondition) {
      return normalizeCondition(requestedMinimumCondition);
    }

    const parsedConditions = this.parseCsvFilter(filterConditions);
    if (!parsedConditions) return DEFAULT_OPTIMIZATION_MINIMUM_CONDITION;

    return parsedConditions
      .map((condition) => normalizeCondition(condition))
      .filter((condition) => condition !== Condition.UNKNOWN)
      .sort((a, b) => this.conditionRank(a) - this.conditionRank(b))[0]
      ?? DEFAULT_OPTIMIZATION_MINIMUM_CONDITION;
  }

  private conditionRank(condition: Condition): number {
    switch (condition) {
      case Condition.NM:
        return 5;
      case Condition.LP:
        return 4;
      case Condition.MP:
        return 3;
      case Condition.HP:
        return 2;
      case Condition.DMG:
        return 1;
      default:
        return 0;
    }
  }

  private conditionCodesAtOrAbove(minimumCondition: Condition): string[] {
    const minimumRank = this.conditionRank(minimumCondition);
    return [
      Condition.NM,
      Condition.LP,
      Condition.MP,
      Condition.HP,
      Condition.DMG,
    ].filter((condition) => this.conditionRank(condition) >= minimumRank);
  }

  private normalizeMaxOptions(maxOptions: number | undefined): number {
    if (maxOptions == null || !Number.isFinite(maxOptions)) {
      return DEFAULT_OPTIMIZATION_OPTIONS;
    }
    return Math.min(
      MAX_OPTIMIZATION_OPTIONS,
      Math.max(1, Math.floor(maxOptions)),
    );
  }

  private parsePreferredSetCode(input: string): string | undefined {
    const match = /(?:\(|\[)\s*([a-zA-Z0-9]{2,10})\s*(?:\)|\])/.exec(input);
    return match?.[1]?.toLowerCase();
  }
}
