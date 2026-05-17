import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CardCondition, ExtractionRun } from '@scoutlgs/core';

export interface TokenListingRow {
  tokenNameId: number | null;
  tokenPrintingId: number | null;
  storeId: number;
  productUrlId: number;
  rawTitle: string;
  imageUrl: string | null;
  currency: string;
}

export interface TokenVariantRow {
  conditionCode: string;
  foil: boolean;
  price: number;
  quantity: number | null;
  platformVariantId: string | null;
  sku: string | null;
}

export interface TokenListingWithVariants {
  listing: TokenListingRow;
  variants: TokenVariantRow[];
  staleCleanup?: {
    productUrlId: number;
    inStockVariantIds: string[];
  };
  discoveryRunId?: number;
}

@Injectable()
export class TokenListingUpsertService implements OnModuleInit {
  private readonly logger = new Logger(TokenListingUpsertService.name);

  /** Cached condition code → id mapping */
  private conditionMap = new Map<string, number>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CardCondition)
    private readonly cardConditionRepository: Repository<CardCondition>,
    @InjectRepository(ExtractionRun)
    private readonly extractionRunRepository: Repository<ExtractionRun>,
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
   * Batch upsert token listings and their variants in two steps:
   * 1. Upsert token_listings ON CONFLICT (store_id, product_url_id)
   * 2. Upsert token_variants ON CONFLICT (token_listing_id, condition_id, foil)
   */
  async upsertBatch(items: TokenListingWithVariants[]): Promise<number> {
    if (items.length === 0) return 0;

    // Deduplicate listings by (storeId, productUrlId) — keep last occurrence
    const seen = new Map<string, number>();
    const deduped: TokenListingWithVariants[] = [];
    for (const item of items) {
      const key = `${item.listing.storeId}:${item.listing.productUrlId}`;
      const existingIdx = seen.get(key);
      if (existingIdx !== undefined) {
        deduped[existingIdx].variants.push(...item.variants);
        deduped[existingIdx].listing = item.listing;
        continue;
      }
      seen.set(key, deduped.length);
      deduped.push(item);
    }

    if (deduped.length < items.length) {
      this.logger.warn(
        `Deduplicated ${items.length - deduped.length} duplicate token listings by (store_id, product_url_id)`,
      );
    }

    // Step 1: Upsert token_listings
    const tokenNameIds: (number | null)[] = [];
    const tokenPrintingIds: (number | null)[] = [];
    const storeIds: number[] = [];
    const productUrlIds: number[] = [];
    const rawTitles: string[] = [];
    const imageUrls: (string | null)[] = [];
    const currencies: string[] = [];

    for (const item of deduped) {
      tokenNameIds.push(item.listing.tokenNameId);
      tokenPrintingIds.push(item.listing.tokenPrintingId);
      storeIds.push(item.listing.storeId);
      productUrlIds.push(item.listing.productUrlId);
      rawTitles.push(item.listing.rawTitle);
      imageUrls.push(item.listing.imageUrl);
      currencies.push(item.listing.currency);
    }

    const listingRows: Array<{ id: number }> = await this.dataSource.query(
      `
      INSERT INTO token_listings (
        token_name_id, token_printing_id, store_id, product_url_id,
        raw_title, image_url, currency, price_updated_at
      )
      SELECT
        unnest($1::int[]),
        unnest($2::int[]),
        unnest($3::int[]),
        unnest($4::int[]),
        unnest($5::varchar[]),
        unnest($6::text[]),
        unnest($7::varchar[]),
        NOW()
      ON CONFLICT (store_id, product_url_id) DO UPDATE SET
        token_name_id = EXCLUDED.token_name_id,
        token_printing_id = EXCLUDED.token_printing_id,
        raw_title = EXCLUDED.raw_title,
        image_url = EXCLUDED.image_url,
        currency = EXCLUDED.currency,
        price_updated_at = NOW()
      RETURNING id
      `,
      [
        tokenNameIds,
        tokenPrintingIds,
        storeIds,
        productUrlIds,
        rawTitles,
        imageUrls,
        currencies,
      ],
    );

    // Step 2: Upsert token_variants
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
        INSERT INTO token_variants (
          token_listing_id, condition_id, foil, price, quantity,
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
        ON CONFLICT (token_listing_id, condition_id, foil) DO UPDATE SET
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
      `Batch upserted ${listingRows.length} token listings, ${variantsUpserted} token variants`,
    );
    return listingRows.length;
  }

  /**
   * Increment extractions_succeeded counter on an extraction run.
   * Called once per batch flush (~every 500 items).
   */
  async incrementRunExtractions(runId: number, count: number): Promise<void> {
    await this.extractionRunRepository.increment(
      { id: runId },
      'extractionsSucceeded',
      count,
    );
  }

  async deleteStaleListings(
    productUrlId: number,
    inStockVariantIds: string[],
  ): Promise<number> {
    let result: any;

    if (inStockVariantIds.length === 0) {
      result = await this.dataSource.query(
        `DELETE FROM token_variants WHERE token_listing_id IN (
          SELECT id FROM token_listings WHERE product_url_id = $1
        )`,
        [productUrlId],
      );
    } else {
      result = await this.dataSource.query(
        `DELETE FROM token_variants
         WHERE token_listing_id IN (
           SELECT id FROM token_listings WHERE product_url_id = $1
         )
         AND (platform_variant_id IS NULL OR platform_variant_id NOT IN (${inStockVariantIds.map((_, i) => `$${i + 2}`).join(', ')}))`,
        [productUrlId, ...inStockVariantIds],
      );
    }

    const deletedCount = result?.[1] ?? 0;
    if (deletedCount > 0) {
      this.logger.debug(
        `Deleted ${deletedCount} stale token variants for product URL ${productUrlId}`,
      );
    }
    return deletedCount;
  }
}
