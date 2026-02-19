import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CardName,
  CardPrinting,
  CardListing,
  Store,
  StoreService,
} from '@scoutlgs/core';

export interface V1CardResult {
  /** Printing info (null when set is unknown) */
  printingId: number | null;
  scryfallId: string | null;
  cardName: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity?: string;
  imageUri?: string;
  /** Listings for this printing, sorted by price */
  listings: V1ListingResult[];
}

export interface V1ListingResult {
  id: string;
  store: string;
  storeSlug: string;
  price: number;
  currency: string;
  condition: string;
  foil: boolean;
  inStock: boolean;
  quantity?: number;
  productLink: string;
  imageUrl?: string;
}

export interface V1SearchResponse {
  query: string;
  totalCards: number;
  totalListings: number;
  priceStats: {
    min: number;
    max: number;
    avg: number;
  };
  results: V1CardResult[];
}

@Injectable()
export class V1CardsService {
  private readonly logger = new Logger(V1CardsService.name);

  constructor(
    @InjectRepository(CardName)
    private readonly cardNameRepository: Repository<CardName>,
    @InjectRepository(CardPrinting)
    private readonly cardPrintingRepository: Repository<CardPrinting>,
    @InjectRepository(CardListing)
    private readonly cardListingRepository: Repository<CardListing>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly storeService: StoreService,
  ) {}

  async searchCards(
    name: string,
    inStock: boolean = true,
    limit: number = 50,
    setCode?: string,
  ): Promise<V1SearchResponse> {
    const normalizedName = this.normalizeCardName(name);

    // Step 1: Find matching CardName (exact, then fuzzy)
    let cardNameRecord = await this.cardNameRepository.findOne({
      where: { normalizedName },
    });

    if (!cardNameRecord) {
      cardNameRecord = await this.findCardNameByFuzzyMatch(name);
    }

    if (!cardNameRecord) {
      return this.buildEmptyResponse(name);
    }

    // Step 2: Get listings for this card name, LEFT JOIN printing + set for set info
    let listingsQuery = this.cardListingRepository
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.store', 'store')
      .leftJoinAndSelect('l.cardPrinting', 'printing')
      .leftJoinAndSelect('printing.set', 'printingSet')
      .where('l.card_name_id = :cardNameId', { cardNameId: cardNameRecord.id });

    if (inStock) {
      listingsQuery = listingsQuery.andWhere('l.in_stock = true');
    }

    if (setCode) {
      // Filter by set code from either the printing's set or the listing's own set_code
      listingsQuery = listingsQuery.andWhere(
        '(printingSet.code = :setCode OR l.set_code = :setCode)',
        { setCode: setCode.toLowerCase() },
      );
    }

    listingsQuery = listingsQuery.orderBy('l.price', 'ASC').limit(limit);

    const listings = await listingsQuery.getMany();

    if (listings.length === 0) {
      return this.buildEmptyResponse(name);
    }

    // Step 3: Group listings by printing (null printing → grouped under "unknown")
    const resultMap = new Map<string, V1CardResult>();

    for (const listing of listings) {
      const printing = listing.cardPrinting;
      // Use printingId as the group key, or 'unknown:{setName}' for unmatched
      const groupKey = printing
        ? `printing:${printing.id}`
        : `unknown:${listing.setName || 'Unknown'}`;

      if (!resultMap.has(groupKey)) {
        resultMap.set(groupKey, {
          printingId: printing?.id ?? null,
          scryfallId: printing?.scryfallId ?? null,
          cardName: cardNameRecord.name,
          setCode: printing?.set?.code ?? listing.setCode ?? '',
          setName: printing?.set?.name ?? listing.setName ?? '',
          collectorNumber: printing?.collectorNumber ?? listing.collectorNumber ?? '',
          rarity: printing?.rarity,
          imageUri: printing?.imageUri,
          listings: [],
        });
      }

      const result = resultMap.get(groupKey)!;
      result.listings.push({
        id: listing.id,
        store: listing.store.displayName,
        storeSlug: listing.store.name,
        price: Number(listing.price),
        currency: listing.currency,
        condition: listing.condition,
        foil: listing.foil,
        inStock: listing.inStock,
        quantity: listing.quantity,
        productLink: listing.productLink,
        imageUrl: listing.imageUrl,
      });
    }

    // Sort results: printings with cheapest listing first
    const results = [...resultMap.values()].sort((a, b) => {
      const aMin = a.listings[0]?.price ?? Infinity;
      const bMin = b.listings[0]?.price ?? Infinity;
      return aMin - bMin;
    });

    // Calculate price stats across all listings
    const allPrices = listings.map((l) => Number(l.price));
    const priceStats = {
      min: allPrices.length > 0 ? Math.min(...allPrices) : 0,
      max: allPrices.length > 0 ? Math.max(...allPrices) : 0,
      avg:
        allPrices.length > 0
          ? allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length
          : 0,
    };

    return {
      query: name,
      totalCards: results.length,
      totalListings: listings.length,
      priceStats,
      results,
    };
  }

  private async findCardNameByFuzzyMatch(
    name: string,
  ): Promise<CardName | null> {
    const results = await this.cardNameRepository
      .createQueryBuilder('cn')
      .where(`similarity(cn.name, :name) > 0.3`, { name })
      .orderBy(`similarity(cn.name, :name)`, 'DESC')
      .limit(1)
      .getMany();

    return results[0] ?? null;
  }

  private normalizeCardName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }

  private buildEmptyResponse(query: string): V1SearchResponse {
    return {
      query,
      totalCards: 0,
      totalListings: 0,
      priceStats: { min: 0, max: 0, avg: 0 },
      results: [],
    };
  }
}
