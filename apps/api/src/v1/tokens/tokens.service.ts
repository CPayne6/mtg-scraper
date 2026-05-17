import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  TokenName,
  TokenPrinting,
  TokenListing,
  TokenVariant,
  ScryfallSet,
  Store,
} from '@scoutlgs/core';

export interface TokenListingResult {
  id: number;
  printingId: number | null;
  scryfallId: string | null;
  tokenName: string;
  typeLine: string;
  cardType: string;
  subtypes: string;
  power: string;
  toughness: string;
  colors: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity?: string;
  imageUri?: string;
  store: string;
  storeSlug: string;
  price: number;
  currency: string;
  condition: string;
  foil: boolean;
  quantity?: number;
  productLink: string;
  imageUrl?: string;
}

export interface TokenStoreCount {
  storeSlug: string;
  storeName: string;
  count: number;
}

export interface TokenConditionCount {
  code: string;
  displayName: string;
  count: number;
  sortOrder: number;
}

export interface TokenSearchResponse {
  query: Record<string, string | undefined>;
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
  storeCounts: TokenStoreCount[];
  conditionCounts: TokenConditionCount[];
  results: TokenListingResult[];
}

interface TokenSearchFilters {
  tokenNameIds: number[];
  setCode?: string;
  stores?: string[];
  conditions?: string[];
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    @InjectRepository(TokenName)
    private readonly tokenNameRepository: Repository<TokenName>,
    @InjectRepository(TokenPrinting)
    private readonly tokenPrintingRepository: Repository<TokenPrinting>,
    @InjectRepository(TokenListing)
    private readonly tokenListingRepository: Repository<TokenListing>,
    @InjectRepository(TokenVariant)
    private readonly tokenVariantRepository: Repository<TokenVariant>,
    @InjectRepository(ScryfallSet)
    private readonly setRepository: Repository<ScryfallSet>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  async searchTokens(params: {
    name?: string;
    type?: string;
    subtype?: string;
    power?: string;
    toughness?: string;
    colors?: string;
    setCode?: string;
    stores?: string[];
    conditions?: string[];
    limit: number;
    page: number;
  }): Promise<TokenSearchResponse> {
    const { name, type, subtype, power, toughness, colors, setCode, stores, conditions, limit, page } = params;

    // Step 1: Find matching token names based on attribute filters
    const tokenNameIds = await this.findMatchingTokenNameIds({
      name, type, subtype, power, toughness, colors,
    });

    if (tokenNameIds.length === 0) {
      return this.buildEmptyResponse(params, page, limit);
    }

    // Step 2: Resolve set filter
    const resolvedSetCode = setCode
      ? await this.resolveSetCode(setCode)
      : undefined;

    const filters: TokenSearchFilters = {
      tokenNameIds,
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
      return this.buildEmptyResponse(params, page, limit);
    }

    // Step 4: Map variants to flat listing results
    const results = this.mapVariantsToResults(variants);

    const totalPages = Math.ceil(aggregates.count / limit);

    return {
      query: { name, type, subtype, power, toughness, colors, setCode },
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
   * Find token_names IDs matching the given attribute filters.
   * Multiple tokens can share a name — this returns all matching IDs.
   */
  private async findMatchingTokenNameIds(params: {
    name?: string;
    type?: string;
    subtype?: string;
    power?: string;
    toughness?: string;
    colors?: string;
  }): Promise<number[]> {
    const { name, type, subtype, power, toughness, colors } = params;

    const qb = this.tokenNameRepository.createQueryBuilder('tn')
      .select('tn.id', 'id');

    if (name) {
      const normalized = this.normalizeCardName(name);
      // Try exact first, then fuzzy
      qb.andWhere(
        `(tn.normalized_name = :exactName OR similarity(tn.normalized_name, :fuzzyName) > 0.3)`,
        { exactName: normalized, fuzzyName: normalized },
      );
      qb.orderBy(`similarity(tn.normalized_name, :fuzzyName)`, 'DESC');
    }

    if (type) {
      qb.andWhere('tn.card_type ILIKE :type', { type: `%${type}%` });
    }

    if (subtype) {
      qb.andWhere('tn.subtypes ILIKE :subtype', { subtype: `%${subtype}%` });
    }

    if (power) {
      qb.andWhere('tn.power = :power', { power });
    }

    if (toughness) {
      qb.andWhere('tn.toughness = :toughness', { toughness });
    }

    if (colors) {
      // Match exact color combination (order-independent)
      // e.g., "W,U" should match tokens with colors "W,U" or "U,W"
      const colorList = colors.split(',').map(c => c.trim()).sort();
      qb.andWhere('tn.colors = :colors', { colors: colorList.join(',') });
    }

    qb.limit(500); // Cap token name matches

    const rows = await qb.getRawMany();
    return rows.map((r) => Number(r.id));
  }

  /**
   * Build the base query builder for count/aggregate queries.
   */
  private buildCountQueryBuilder(
    filters: TokenSearchFilters,
  ): SelectQueryBuilder<TokenVariant> {
    const qb = this.tokenVariantRepository
      .createQueryBuilder('v')
      .innerJoin('v.tokenListing', 'l')
      .innerJoin('l.store', 's')
      .innerJoin('v.condition', 'c');

    if (filters.setCode) {
      qb.leftJoin('l.tokenPrinting', 'p').leftJoin('p.set', 'ps');
    }

    qb.where('l.token_name_id IN (:...tokenNameIds)', {
      tokenNameIds: filters.tokenNameIds,
    });

    if (filters.setCode) {
      qb.andWhere('ps.code = :setCode', { setCode: filters.setCode });
    }

    return qb;
  }

  /**
   * Query 1: Aggregate stats with ALL filters applied
   */
  private async getAggregateStats(
    filters: TokenSearchFilters,
  ): Promise<{ count: number; min: number; max: number; avg: number }> {
    const qb = this.buildCountQueryBuilder(filters);

    if (filters.stores && filters.stores.length > 0) {
      qb.andWhere('s.name IN (:...stores)', { stores: filters.stores });
    }
    if (filters.conditions && filters.conditions.length > 0) {
      qb.andWhere('c.code IN (:...conditions)', { conditions: filters.conditions });
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
    filters: TokenSearchFilters,
  ): Promise<TokenStoreCount[]> {
    const qb = this.buildCountQueryBuilder(filters);

    if (filters.conditions && filters.conditions.length > 0) {
      qb.andWhere('c.code IN (:...conditions)', { conditions: filters.conditions });
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
    filters: TokenSearchFilters,
  ): Promise<TokenConditionCount[]> {
    const qb = this.buildCountQueryBuilder(filters);

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
    filters: TokenSearchFilters,
    page: number,
    limit: number,
  ): Promise<TokenVariant[]> {
    const offset = (page - 1) * limit;

    const qb = this.tokenVariantRepository
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.tokenListing', 'l')
      .innerJoinAndSelect('l.store', 's')
      .innerJoinAndSelect('v.condition', 'c')
      .leftJoinAndSelect('l.productUrl', 'pu')
      .leftJoinAndSelect('l.tokenName', 'tn')
      .leftJoinAndSelect('l.tokenPrinting', 'p')
      .leftJoinAndSelect('p.set', 'ps');

    qb.where('l.token_name_id IN (:...tokenNameIds)', {
      tokenNameIds: filters.tokenNameIds,
    });

    if (filters.setCode) {
      qb.andWhere('ps.code = :setCode', { setCode: filters.setCode });
    }

    if (filters.stores && filters.stores.length > 0) {
      qb.andWhere('s.name IN (:...stores)', { stores: filters.stores });
    }
    if (filters.conditions && filters.conditions.length > 0) {
      qb.andWhere('c.code IN (:...conditions)', { conditions: filters.conditions });
    }

    qb.orderBy('v.price', 'ASC').offset(offset).limit(limit);

    return qb.getMany();
  }

  /**
   * Map hydrated token variants to flat listing results.
   */
  private mapVariantsToResults(variants: TokenVariant[]): TokenListingResult[] {
    return variants.map((variant) => {
      const listing = variant.tokenListing;
      const tokenName = listing.tokenName;
      const printing = listing.tokenPrinting;
      const productLink = listing.productUrl
        ? `${listing.store.baseUrl}/products/${listing.productUrl.handle}`
        : listing.store.baseUrl;

      return {
        id: variant.id,
        printingId: printing?.id ?? null,
        scryfallId: printing?.scryfallId ?? null,
        tokenName: tokenName?.name ?? listing.rawTitle ?? '',
        typeLine: tokenName?.typeLine ?? '',
        cardType: tokenName?.cardType ?? '',
        subtypes: tokenName?.subtypes ?? '',
        power: tokenName?.power ?? '',
        toughness: tokenName?.toughness ?? '',
        colors: tokenName?.colors ?? '',
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
      };
    });
  }

  private async resolveSetCode(input: string): Promise<string | undefined> {
    const lower = input.toLowerCase();

    const byCode = await this.setRepository.findOne({
      where: { code: lower },
      select: ['code'],
    });
    if (byCode) return byCode.code;

    const byName = await this.setRepository
      .createQueryBuilder('s')
      .select('s.code', 'code')
      .where('s.name ILIKE :pattern', { pattern: `%${input}%` })
      .orderBy('LENGTH(s.name)', 'ASC')
      .limit(1)
      .getRawOne();

    return byName?.code;
  }

  private normalizeCardName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }

  private buildEmptyResponse(
    params: Record<string, any>,
    page: number,
    limit: number,
  ): TokenSearchResponse {
    return {
      query: {
        name: params.name,
        type: params.type,
        subtype: params.subtype,
        power: params.power,
        toughness: params.toughness,
        colors: params.colors,
        setCode: params.setCode,
      },
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
