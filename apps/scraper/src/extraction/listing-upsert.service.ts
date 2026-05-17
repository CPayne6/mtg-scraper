import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CardCondition } from '@scoutlgs/core';

export interface ListingRow {
  cardNameId: number | null;
  cardPrintingId: number | null;
  storeId: number;
  productUrlId: number;
  rawTitle: string;
  imageUrl: string | null;
  currency: string;
  /** How the card name was resolved by the matcher. */
  nameMatch: 'exact' | 'fuzzy' | 'frontface' | 'none';
  /** How the set was resolved from extractor input. */
  setMatch: 'code_provided' | 'name_exact' | 'name_fuzzy' | 'none';
  /** How the printing was selected for the resolved card. */
  printingMatch:
    | 'set_and_number'
    | 'set_only'
    | 'any'
    | 'ambiguous'
    | 'none';
}

export interface VariantRow {
  conditionCode: string;
  foil: boolean;
  price: number;
  quantity: number | null;
  platformVariantId: string | null;
  sku: string | null;
}

export interface ListingWithVariants {
  listing: ListingRow;
  variants: VariantRow[];
  staleCleanup?: {
    productUrlId: number;
    inStockVariantIds: string[];
  };
  discoveryRunId?: number;
}

@Injectable()
export class ListingUpsertService implements OnModuleInit {
  private readonly logger = new Logger(ListingUpsertService.name);

  /** Cached condition code → id mapping */
  private conditionMap = new Map<string, number>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CardCondition)
    private readonly cardConditionRepository: Repository<CardCondition>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadConditions();
  }

  private async loadConditions(): Promise<void> {
    const rows = await this.cardConditionRepository.find({
      select: ['id', 'code'],
    });
    this.conditionMap.clear();
    for (const row of rows) {
      this.conditionMap.set(row.code, row.id);
    }
    this.logger.log(`Loaded ${this.conditionMap.size} card conditions`);
  }

  getConditionId(code: string): number {
    return this.conditionMap.get(code) ?? this.conditionMap.get('unknown')!;
  }

  /**
   * Batch upsert listings and their variants in two steps:
   * 1. Upsert card_listings ON CONFLICT (store_id, product_url_id)
   * 2. Upsert card_variants ON CONFLICT (card_listing_id, condition_id, foil)
   */
  async upsertBatch(items: ListingWithVariants[]): Promise<number> {
    if (items.length === 0) return 0;

    // Deduplicate listings by (storeId, productUrlId) — keep last occurrence
    const seen = new Map<string, number>();
    const deduped: ListingWithVariants[] = [];
    for (const item of items) {
      const key = `${item.listing.storeId}:${item.listing.productUrlId}`;
      const existingIdx = seen.get(key);
      if (existingIdx !== undefined) {
        // Merge variants from duplicate into existing
        deduped[existingIdx].variants.push(...item.variants);
        deduped[existingIdx].listing = item.listing; // use latest listing data
        continue;
      }
      seen.set(key, deduped.length);
      deduped.push(item);
    }

    if (deduped.length < items.length) {
      this.logger.warn(
        `Deduplicated ${items.length - deduped.length} duplicate listings by (store_id, product_url_id)`,
      );
    }

    // Step 1: Upsert card_listings
    const cardNameIds: (number | null)[] = [];
    const cardPrintingIds: (number | null)[] = [];
    const storeIds: number[] = [];
    const productUrlIds: number[] = [];
    const rawTitles: string[] = [];
    const imageUrls: (string | null)[] = [];
    const currencies: string[] = [];
    const nameMatches: string[] = [];
    const setMatches: string[] = [];
    const printingMatches: string[] = [];

    for (const item of deduped) {
      cardNameIds.push(item.listing.cardNameId);
      cardPrintingIds.push(item.listing.cardPrintingId);
      storeIds.push(item.listing.storeId);
      productUrlIds.push(item.listing.productUrlId);
      rawTitles.push(item.listing.rawTitle);
      imageUrls.push(item.listing.imageUrl);
      currencies.push(item.listing.currency);
      nameMatches.push(item.listing.nameMatch);
      setMatches.push(item.listing.setMatch);
      printingMatches.push(item.listing.printingMatch);
    }

    // Upsert listings and get their IDs back
    const listingRows: Array<{ id: number }> = await this.dataSource.query(
      `
      INSERT INTO card_listings (
        card_name_id, card_printing_id, store_id, product_url_id,
        raw_title, image_url, currency,
        name_match, set_match, printing_match,
        price_updated_at
      )
      SELECT
        unnest($1::int[]),
        unnest($2::int[]),
        unnest($3::int[]),
        unnest($4::int[]),
        unnest($5::varchar[]),
        unnest($6::text[]),
        unnest($7::varchar[]),
        unnest($8::varchar[]),
        unnest($9::varchar[]),
        unnest($10::varchar[]),
        NOW()
      ON CONFLICT (store_id, product_url_id) DO UPDATE SET
        card_name_id = EXCLUDED.card_name_id,
        card_printing_id = EXCLUDED.card_printing_id,
        raw_title = EXCLUDED.raw_title,
        image_url = EXCLUDED.image_url,
        currency = EXCLUDED.currency,
        name_match = EXCLUDED.name_match,
        set_match = EXCLUDED.set_match,
        printing_match = EXCLUDED.printing_match,
        price_updated_at = NOW()
      RETURNING id
      `,
      [
        cardNameIds,
        cardPrintingIds,
        storeIds,
        productUrlIds,
        rawTitles,
        imageUrls,
        currencies,
        nameMatches,
        setMatches,
        printingMatches,
      ],
    );

    // Step 2: Upsert card_variants
    const variantListingIds: number[] = [];
    const variantConditionIds: number[] = [];
    const variantFoils: boolean[] = [];
    const variantPrices: number[] = [];
    const variantQuantities: (number | null)[] = [];
    const variantPlatformIds: (string | null)[] = [];
    const variantSkus: (string | null)[] = [];

    for (let i = 0; i < deduped.length; i++) {
      const listingId = listingRows[i]?.id;
      if (!listingId) continue;

      // Deduplicate variants by (condition, foil) within this listing
      const seenKeys = new Map<string, number>();
      for (const variant of deduped[i].variants) {
        const conditionId = this.getConditionId(variant.conditionCode);
        const dedupKey = `${conditionId}:${variant.foil}`;
        const existingIdx = seenKeys.get(dedupKey);
        if (existingIdx !== undefined) {
          // Keep the later variant (overwrite)
          const offset = existingIdx;
          variantPrices[offset] = variant.price;
          variantQuantities[offset] = variant.quantity;
          variantPlatformIds[offset] = variant.platformVariantId;
          variantSkus[offset] = variant.sku;
          continue;
        }
        seenKeys.set(dedupKey, variantListingIds.length);
        variantListingIds.push(listingId);
        variantConditionIds.push(conditionId);
        variantFoils.push(variant.foil);
        variantPrices.push(variant.price);
        variantQuantities.push(variant.quantity);
        variantPlatformIds.push(variant.platformVariantId);
        variantSkus.push(variant.sku);
      }
    }

    let variantsUpserted = 0;
    if (variantListingIds.length > 0) {
      const variantResult = await this.dataSource.query(
        `
        INSERT INTO card_variants (
          card_listing_id, condition_id, foil, price, quantity,
          platform_variant_id, sku, price_updated_at
        )
        SELECT
          unnest($1::int[]),
          unnest($2::smallint[]),
          unnest($3::boolean[]),
          unnest($4::numeric[]),
          unnest($5::int[]),
          unnest($6::varchar[]),
          unnest($7::varchar[]),
          NOW()
        ON CONFLICT (card_listing_id, condition_id, foil) DO UPDATE SET
          price = EXCLUDED.price,
          quantity = EXCLUDED.quantity,
          platform_variant_id = EXCLUDED.platform_variant_id,
          sku = EXCLUDED.sku,
          price_updated_at = NOW()
        `,
        [
          variantListingIds,
          variantConditionIds,
          variantFoils,
          variantPrices,
          variantQuantities,
          variantPlatformIds,
          variantSkus,
        ],
      );
      variantsUpserted = variantResult?.length ?? variantListingIds.length;
    }

    this.logger.debug(
      `Batch upserted ${listingRows.length} listings, ${variantsUpserted} variants`,
    );
    return listingRows.length;
  }

  /**
   * Delete variants for a product URL that are no longer in stock.
   * If inStockVariantIds is empty, deletes ALL variants for listings under the product URL.
   * Otherwise, deletes variants whose platform_variant_id is NOT in the given set.
   */
  /**
   * Increment extractions_succeeded counter on a discovery run.
   * Called once per batch flush (~every 500 items).
   */
  async incrementRunExtractions(runId: number, count: number): Promise<void> {
    await this.dataSource.query(
      'UPDATE discovery_runs SET extractions_succeeded = extractions_succeeded + $1 WHERE id = $2',
      [count, runId],
    );
  }

  async deleteStaleListings(
    productUrlId: number,
    inStockVariantIds: string[],
  ): Promise<number> {
    let result: any;

    if (inStockVariantIds.length === 0) {
      // Delete all variants for listings belonging to this product URL
      result = await this.dataSource.query(
        `DELETE FROM card_variants WHERE card_listing_id IN (
          SELECT id FROM card_listings WHERE product_url_id = $1
        )`,
        [productUrlId],
      );
    } else {
      // Delete variants whose platform_variant_id is not in the in-stock set
      result = await this.dataSource.query(
        `DELETE FROM card_variants
         WHERE card_listing_id IN (
           SELECT id FROM card_listings WHERE product_url_id = $1
         )
         AND (platform_variant_id IS NULL OR platform_variant_id NOT IN (${inStockVariantIds.map((_, i) => `$${i + 2}`).join(', ')}))`,
        [productUrlId, ...inStockVariantIds],
      );
    }

    const deletedCount = result?.[1] ?? 0;
    if (deletedCount > 0) {
      this.logger.debug(
        `Deleted ${deletedCount} stale variants for product URL ${productUrlId}`,
      );
    }
    return deletedCount;
  }
}
