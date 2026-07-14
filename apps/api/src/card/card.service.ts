import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CacheService, CardWithStore, StoreService, Card, CardName, Store } from '@scoutlgs/core';
import { CardSearchResponse, StoreInfo, PriceStats, Condition } from '@scoutlgs/shared';

@Injectable()
export class CardService {
  private readonly logger = new Logger(CardService.name);

  constructor(
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(CardName)
    private readonly cardNameRepository: Repository<CardName>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly cacheService: CacheService,
    private readonly storeService: StoreService,
    private readonly configService: ConfigService,
  ) {}

  async getCardByName(cardName: string): Promise<CardSearchResponse> {
    return this.getCardFromDatabase(cardName);
  }

  /**
   * Database-first approach - query cards table directly.
   * Results are pre-scraped via storefront extraction pipeline.
   */
  private async getCardFromDatabase(cardName: string): Promise<CardSearchResponse> {
    this.logger.debug(`Querying database for: ${cardName}`);

    // Normalize card name for lookup
    const normalizedName = this.normalizeCardName(cardName);

    // Find card name record
    const cardNameRecord = await this.cardNameRepository.findOne({
      where: { normalizedName },
    });

    if (!cardNameRecord) {
      this.logger.debug(`Card name not found: ${cardName}`);
      return this.buildEmptyResponse(cardName);
    }

    // Query all listings for this card name, join with store, product_url, variants, printing
    const listings = await this.cardRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.store', 'store')
      .leftJoinAndSelect('listing.productUrl', 'productUrl')
      .leftJoinAndSelect('listing.variants', 'variant')
      .leftJoinAndSelect('variant.condition', 'condition')
      .leftJoinAndSelect('listing.cardPrinting', 'printing')
      .leftJoinAndSelect('printing.set', 'printingSet')
      .where('listing.card_name_id = :cardNameId', { cardNameId: cardNameRecord.id })
      .andWhere('variant.inStock = :inStock', { inStock: true })
      .orderBy('variant.price', 'ASC')
      .getMany();

    this.logger.log(`Found ${listings.length} listings for: ${cardName}`);

    // Convert to CardWithStore format — one entry per variant
    const cardResults: CardWithStore[] = [];

    for (const listing of listings) {
      const setName = listing.cardPrinting?.set?.name ?? '';
      const collectorNumber = listing.cardPrinting?.collectorNumber ?? '';
      const scryfallId = listing.cardPrinting?.scryfallId;
      const title = `${cardNameRecord.name}${setName ? ` [${setName}]` : ''}`;
      const productLink = listing.productUrl
        ? `${listing.store.baseUrl}/products/${listing.productUrl.handle}`
        : listing.store.baseUrl;

      for (const variant of listing.variants ?? []) {
        cardResults.push({
          id: variant.id,
          price: Number(variant.price),
          condition: (variant.condition?.code ?? 'unknown') as Condition,
          foil: variant.foil,
          image: listing.imageUrl || '',
          title,
          currency: listing.currency,
          link: productLink,
          set: setName,
          card_number: collectorNumber,
          scryfall_id: scryfallId,
          variant_id: variant.platformVariantId,
          store: listing.store.displayName,
          store_key: listing.store.name,
        });
      }
    }

    // Get all stores that have results
    const storesWithCards = new Set(listings.map((l) => l.store.id));
    const allStores = await this.storeService.findAllActive();
    const storesInfo = allStores.filter((s) => storesWithCards.has(s.id));

    return this.buildResponse(cardName, cardResults, [], storesInfo);
  }

  /**
   * Normalize card name for consistent database lookups.
   */
  private normalizeCardName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }

  /**
   * Build an empty response when no cards are found.
   */
  private buildEmptyResponse(cardName: string): CardSearchResponse {
    return {
      cardName,
      stores: [],
      priceStats: { min: 0, max: 0, avg: 0, count: 0 },
      results: [],
      timestamp: Date.now(),
    };
  }

  private buildResponse(
    cardName: string,
    cards: CardWithStore[],
    storeErrors: Array<{ storeName: string; error: string }>,
    allStores: Awaited<ReturnType<StoreService['findAllActive']>>,
  ): CardSearchResponse {
    // Sort results by price (lowest first)
    cards.sort((a, b) => a.price - b.price);

    // Group cards by store and count
    const storeCardCounts = new Map<string, number>();
    for (const card of cards) {
      storeCardCounts.set(
        card.store,
        (storeCardCounts.get(card.store) || 0) + 1,
      );
    }

    // Build store info array (only stores with cards)
    const stores: StoreInfo[] = [];
    for (const store of allStores) {
      const count = storeCardCounts.get(store.displayName) || 0;
      if (count > 0) {
        stores.push({
          id: store.id,
          uuid: store.uuid,
          name: store.name,
          displayName: store.displayName,
          logoUrl: store.logoUrl,
          cardCount: count,
        });
      }
    }

    // Sort alphabetically by displayName
    stores.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Calculate price statistics
    const priceStats: PriceStats = {
      min: cards.length > 0 ? Math.min(...cards.map((c) => c.price)) : 0,
      max: cards.length > 0 ? Math.max(...cards.map((c) => c.price)) : 0,
      avg:
        cards.length > 0
          ? cards.reduce((sum, c) => sum + c.price, 0) / cards.length
          : 0,
      count: cards.length,
    };

    return {
      cardName,
      stores,
      priceStats,
      results: cards,
      timestamp: Date.now(),
      storeErrors: storeErrors.length > 0 ? storeErrors : undefined,
    };
  }
}
