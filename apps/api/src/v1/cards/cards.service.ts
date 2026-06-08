import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  CardName,
  CardPrinting,
  CardListing,
  CardVariant,
  ScryfallSet,
  Store,
  StoreService,
} from '@scoutlgs/core';
import { CardNameResolverService } from '../shared/card-name-resolver.service';

export interface ListingResult {
  id: number;
  // Printing info
  printingId: number | null;
  scryfallId: string | null;
  cardName: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity?: string;
  imageUri?: string;
  // Store/variant info
  store: string;
  storeSlug: string;
  price: number;
  currency: string;
  condition: string;
  foil: boolean;
  quantity?: number;
  productLink: string;
  imageUrl?: string;
  variantId: string | null;
}

export interface StoreCount {
  storeSlug: string;
  storeName: string;
  count: number;
}

export interface ConditionCount {
  code: string;
  displayName: string;
  count: number;
  sortOrder: number;
}

export interface SearchResponse {
  query: string;
  totalListings: number;
  priceStats: {
    min: number;
    max: number;
    avg: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  storeCounts: StoreCount[];
  conditionCounts: ConditionCount[];
  results: ListingResult[];
}

interface SearchFilters {
  cardNameId: number;
  setCode?: string;
  stores?: string[];
  conditions?: string[];
}

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    @InjectRepository(CardName)
    private readonly cardNameRepository: Repository<CardName>,
    @InjectRepository(CardPrinting)
    private readonly cardPrintingRepository: Repository<CardPrinting>,
    @InjectRepository(CardListing)
    private readonly cardListingRepository: Repository<CardListing>,
    @InjectRepository(CardVariant)
    private readonly cardVariantRepository: Repository<CardVariant>,
    @InjectRepository(ScryfallSet)
    private readonly setRepository: Repository<ScryfallSet>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly storeService: StoreService,
    private readonly cardNameResolver: CardNameResolverService,
  ) {}

  async searchCards(
    name: string,
    limit: number = 50,
    page: number = 1,
    setCode?: string,
    stores?: string[],
    conditions?: string[],
  ): Promise<SearchResponse> {
    const normalizedName = this.cardNameResolver.normalizeCardName(name);

    // Step 1: Find matching CardName (exact, then fuzzy)
    let cardNameRecord = await this.cardNameRepository.findOne({
      where: { normalizedName },
    });

    if (!cardNameRecord) {
      cardNameRecord = await this.cardNameResolver.findCardNameByFuzzyMatch(name);
    }

    if (!cardNameRecord) {
      return this.buildEmptyResponse(name, page, limit);
    }

    // Step 2: Resolve set filter to a code (handles full/partial names)
    const resolvedSetCode = setCode
      ? await this.resolveSetCode(setCode)
      : undefined;

    const filters: SearchFilters = {
      cardNameId: cardNameRecord.id,
      setCode: resolvedSetCode,
      stores,
      conditions,
    };

    // Step 3: Run 4 queries in parallel
    const [aggregates, storeCounts, conditionCounts, variants] =
      await Promise.all([
        this.getAggregateStats(filters),
        this.getStoreCounts(filters),
        this.getConditionCounts(filters),
        this.getPaginatedVariants(filters, page, limit),
      ]);

    if (aggregates.count === 0) {
      return this.buildEmptyResponse(name, page, limit);
    }

    // Step 4: Map variants to flat listing results (preserves DB price order)
    const results = this.mapVariantsToResults(variants, cardNameRecord.name);

    const totalPages = Math.ceil(aggregates.count / limit);

    return {
      query: name,
      totalListings: aggregates.count,
      priceStats: {
        min: aggregates.min,
        max: aggregates.max,
        avg: aggregates.avg,
      },
      pagination: {
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      storeCounts,
      conditionCounts,
      results,
    };
  }

  /**
   * Build the base query builder with standard joins for count/aggregate queries.
   * Joins: variant → listing → store, variant → condition.
   * Optionally joins printing → set when setCode filter is present.
   */
  private buildCountQueryBuilder(
    filters: SearchFilters,
  ): SelectQueryBuilder<CardVariant> {
    const qb = this.cardVariantRepository
      .createQueryBuilder('v')
      .innerJoin('v.cardListing', 'l')
      .innerJoin('l.store', 's')
      .innerJoin('v.condition', 'c');

    if (filters.setCode) {
      qb.leftJoin('l.cardPrinting', 'p').leftJoin('p.set', 'ps');
    }

    qb.where('l.card_name_id = :cardNameId', {
      cardNameId: filters.cardNameId,
    });

    if (filters.setCode) {
      qb.andWhere('ps.code = :setCode', {
        setCode: filters.setCode,
      });
    }

    return qb;
  }

  /**
   * Query 1: Aggregate stats with ALL filters applied
   */
  private async getAggregateStats(
    filters: SearchFilters,
  ): Promise<{ count: number; min: number; max: number; avg: number }> {
    const qb = this.buildCountQueryBuilder(filters);

    if (filters.stores && filters.stores.length > 0) {
      qb.andWhere('s.name IN (:...stores)', { stores: filters.stores });
    }
    if (filters.conditions && filters.conditions.length > 0) {
      qb.andWhere('c.code IN (:...conditions)', {
        conditions: filters.conditions,
      });
    }

    qb.select('COUNT(v.id)', 'count')
      .addSelect('MIN(v.price)', 'min')
      .addSelect('MAX(v.price)', 'max')
      .addSelect('AVG(v.price)', 'avg');

    const raw = await qb.getRawOne();

    return {
      count: parseInt(raw.count, 10) || 0,
      min: parseFloat(raw.min) || 0,
      max: parseFloat(raw.max) || 0,
      avg: parseFloat(raw.avg) || 0,
    };
  }

  /**
   * Query 2: Per-store counts — filtered by condition but NOT by store
   */
  private async getStoreCounts(
    filters: SearchFilters,
  ): Promise<StoreCount[]> {
    const qb = this.buildCountQueryBuilder(filters);

    // Apply condition filter but NOT store filter
    if (filters.conditions && filters.conditions.length > 0) {
      qb.andWhere('c.code IN (:...conditions)', {
        conditions: filters.conditions,
      });
    }

    qb.select('s.name', 'storeSlug')
      .addSelect('s.display_name', 'storeName')
      .addSelect('COUNT(v.id)', 'count')
      .groupBy('s.name')
      .addGroupBy('s.display_name')
      .orderBy('s.display_name', 'ASC');

    const rows = await qb.getRawMany();

    return rows.map((r) => ({
      storeSlug: r.storeSlug,
      storeName: r.storeName,
      count: parseInt(r.count, 10),
    }));
  }

  /**
   * Query 3: Per-condition counts — filtered by store but NOT by condition
   */
  private async getConditionCounts(
    filters: SearchFilters,
  ): Promise<ConditionCount[]> {
    const qb = this.buildCountQueryBuilder(filters);

    // Apply store filter but NOT condition filter
    if (filters.stores && filters.stores.length > 0) {
      qb.andWhere('s.name IN (:...stores)', { stores: filters.stores });
    }

    qb.select('c.code', 'code')
      .addSelect('c.display_name', 'displayName')
      .addSelect('COUNT(v.id)', 'count')
      .addSelect('c.sort_order', 'sortOrder')
      .groupBy('c.code')
      .addGroupBy('c.display_name')
      .addGroupBy('c.sort_order')
      .orderBy('c.sort_order', 'ASC');

    const rows = await qb.getRawMany();

    return rows.map((r) => ({
      code: r.code,
      displayName: r.displayName,
      count: parseInt(r.count, 10),
      sortOrder: parseInt(r.sortOrder, 10),
    }));
  }

  /**
   * Query 4: Paginated variants with full hydration, ordered by price
   */
  private async getPaginatedVariants(
    filters: SearchFilters,
    page: number,
    limit: number,
  ): Promise<CardVariant[]> {
    const offset = (page - 1) * limit;

    const qb = this.cardVariantRepository
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.cardListing', 'l')
      .innerJoinAndSelect('l.store', 's')
      .innerJoinAndSelect('v.condition', 'c')
      .leftJoinAndSelect('l.productUrl', 'pu')
      .leftJoinAndSelect('l.cardPrinting', 'p')
      .leftJoinAndSelect('p.set', 'ps');

    qb.where('l.card_name_id = :cardNameId', {
      cardNameId: filters.cardNameId,
    });

    if (filters.setCode) {
      qb.andWhere('ps.code = :setCode', {
        setCode: filters.setCode,
      });
    }

    if (filters.stores && filters.stores.length > 0) {
      qb.andWhere('s.name IN (:...stores)', { stores: filters.stores });
    }
    if (filters.conditions && filters.conditions.length > 0) {
      qb.andWhere('c.code IN (:...conditions)', {
        conditions: filters.conditions,
      });
    }

    qb.orderBy('v.price', 'ASC').offset(offset).limit(limit);

    return qb.getMany();
  }

  /**
   * Map hydrated variants to flat listing results.
   * Preserves the DB price-sort order (no re-grouping).
   */
  private mapVariantsToResults(
    variants: CardVariant[],
    cardName: string,
  ): ListingResult[] {
    return variants.map((variant) => {
      const listing = variant.cardListing;
      const printing = listing.cardPrinting;
      const productLink = listing.productUrl
        ? `${listing.store.baseUrl}/products/${listing.productUrl.handle}`
        : listing.store.baseUrl;

      return {
        id: variant.id,
        printingId: printing?.id ?? null,
        scryfallId: printing?.scryfallId ?? null,
        cardName,
        setCode: printing?.set?.code ?? '',
        setName: printing?.set?.name ?? '',
        collectorNumber: printing?.collectorNumber ?? '',
        rarity: printing?.rarity,
        imageUri: printing?.imageUri,
        store: listing.store.displayName,
        storeSlug: listing.store.name,
        price: Number(variant.price),
        currency: listing.currency,
        condition: variant.condition?.code ?? 'unknown',
        foil: variant.foil,
        quantity: variant.quantity,
        productLink,
        imageUrl: listing.imageUrl,
        variantId: variant.platformVariantId ?? null,
      };
    });
  }

  /**
   * Resolve a user-provided set filter to an actual set code.
   * Tries exact code match first, then ILIKE on name.
   * Returns the resolved code, or undefined if no match.
   */
  private async resolveSetCode(input: string): Promise<string | undefined> {
    const lower = input.toLowerCase();

    // Try exact code match (indexed, fast)
    const byCode = await this.setRepository.findOne({
      where: { code: lower },
      select: ['code'],
    });
    if (byCode) return byCode.code;

    // Fall back to name search (small table, sequential scan is fine)
    const byName = await this.setRepository
      .createQueryBuilder('s')
      .select('s.code', 'code')
      .where('s.name ILIKE :pattern', { pattern: `%${input}%` })
      .orderBy('LENGTH(s.name)', 'ASC')
      .limit(1)
      .getRawOne();

    return byName?.code;
  }

  private buildEmptyResponse(
    query: string,
    page: number,
    limit: number,
  ): SearchResponse {
    return {
      query,
      totalListings: 0,
      priceStats: { min: 0, max: 0, avg: 0 },
      pagination: {
        page,
        limit,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
      storeCounts: [],
      conditionCounts: [],
      results: [],
    };
  }
}
