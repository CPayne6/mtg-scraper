import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Store,
  ProductUrl,
} from '@scoutlgs/core';
import type { ExtractedCardVariant } from '@scoutlgs/core';
import { PrintingMatcherService } from './printing-matcher.service';
import { BatchAccumulatorService } from './batch-accumulator.service';
import { ListingUpsertService } from './listing-upsert.service';
import { UnmatchedCardService } from './unmatched-card.service';
import { TokenMatcherService } from './token-matcher.service';
import { TokenBatchAccumulatorService } from './token-batch-accumulator.service';
import { TokenListingUpsertService } from './token-listing-upsert.service';
import type { ListingRow, VariantRow, ListingWithVariants } from './listing-upsert.service';
import type { TokenListingRow, TokenVariantRow } from './token-listing-upsert.service';
import type { UnmatchedCardRow } from './unmatched-card.service';

export interface ExtractionResult {
  productUrlId: number;
  variantsExtracted: number;
  variantsInStock: number;
  variantsOutOfStock: number;
  cardsUpserted: number;
  matchedPrintings: number;
  unmatchedPrintings: number;
  unmatchedCards: number;
  success: boolean;
  error?: string;
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  // Cache store lookups
  private storeCache = new Map<number, Store>();

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    private readonly printingMatcher: PrintingMatcherService,
    private readonly batchAccumulator: BatchAccumulatorService,
    private readonly listingUpsertService: ListingUpsertService,
    private readonly unmatchedCardService: UnmatchedCardService,
    private readonly tokenMatcher: TokenMatcherService,
    private readonly tokenBatchAccumulator: TokenBatchAccumulatorService,
    private readonly tokenListingUpsertService: TokenListingUpsertService,
  ) {}

  /**
   * Get store by ID (cached).
   */
  async getStore(storeId: number): Promise<Store | null> {
    if (this.storeCache.has(storeId)) {
      return this.storeCache.get(storeId)!;
    }

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });

    if (store) {
      this.storeCache.set(storeId, store);
    }

    return store;
  }

  /**
   * Process pre-fetched variants through matching + upsert pipeline.
   * Used by the Storefront API processor which fetches variants inline.
   */
  async processExtractedVariants(
    productUrlId: number,
    storeId: number,
    handle: string,
    variants: ExtractedCardVariant[],
    discoveryRunId?: number,
  ): Promise<ExtractionResult> {
    const result: ExtractionResult = {
      productUrlId,
      variantsExtracted: 0,
      variantsInStock: 0,
      variantsOutOfStock: 0,
      cardsUpserted: 0,
      matchedPrintings: 0,
      unmatchedPrintings: 0,
      unmatchedCards: 0,
      success: false,
    };

    try {
      const store = await this.getStore(storeId);

      if (!store) {
        result.error = `Store ${storeId} not found`;
        await this.updateProductUrlStatus(productUrlId, 'error', result.error);
        return result;
      }

      result.variantsExtracted = variants.length;

      if (variants.length === 0) {
        result.error = 'No variants extracted';
        await this.updateProductUrlStatus(productUrlId, 'error', result.error);
        return result;
      }

      // Count in-stock vs out-of-stock
      result.variantsInStock = variants.filter((v) => v.inStock).length;
      result.variantsOutOfStock = variants.length - result.variantsInStock;

      // All variants in a product share the same card — resolve once
      const firstVariant = variants[0];

      // Try the regular card matcher first. Tokens make up ~3% of products
      // and real cards 95%+, so card-first avoids misrouting cards with
      // ambiguous signals (e.g. cards named "Leering Emblem" or with
      // T-prefixed set codes like TSR/THS/TMP) into the token pipeline.
      const matchResult = await this.printingMatcher.match(
        firstVariant.cardName,
        firstVariant.setCode,
        firstVariant.collectorNumber,
        firstVariant.setName,
      );

      // No card match — fall through to token matcher. handleTokenProduct
      // handles both successful token matches and final unmatched fallback.
      if (matchResult.confidence === 'none') {
        return this.handleTokenProduct(
          firstVariant,
          variants,
          store,
          productUrlId,
          result,
          discoveryRunId,
        );
      }

      // Matched card — build listing + variant rows (in-stock only)
      if (matchResult.cardPrintingId) {
        result.matchedPrintings = 1;
      } else {
        result.unmatchedPrintings = 1;
      }

      // Persist every variant with its current stock flag.
      // Build one listing per product, with variants underneath
      const listing: ListingRow = {
        cardNameId: matchResult.cardNameId,
        cardPrintingId: matchResult.cardPrintingId,
        storeId: store.id,
        productUrlId,
        rawTitle: firstVariant.cardName,
        imageUrl: firstVariant.imageUrl || null,
        currency: firstVariant.currency,
        nameMatch: matchResult.nameMatch,
        setMatch: matchResult.setMatch,
        printingMatch: matchResult.printingMatch,
      };

      const variantRows: VariantRow[] = [];
      const inStockVariantIds: string[] = [];

      for (const variant of variants) {
        try {
          variantRows.push({
            conditionCode: variant.condition,
            foil: variant.foil,
            price: variant.price,
            inStock: variant.inStock,
            quantity: variant.quantity ?? null,
            platformVariantId: variant.platformVariantId || null,
            sku: variant.sku || null,
          });

          if (variant.inStock && variant.platformVariantId) {
            inStockVariantIds.push(variant.platformVariantId);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to prepare variant ${variant.cardName}: ${error}`,
          );
        }
      }

      // Add to batch accumulator (non-blocking, flushed in background)
      // Stale cleanup runs after upsert in the flush cycle to avoid race condition
      if (variantRows.length > 0) {
        this.batchAccumulator.addMany([{
          listing,
          variants: variantRows,
          staleCleanup: { productUrlId, inStockVariantIds },
          discoveryRunId,
        }]);
        result.cardsUpserted = variantRows.length;
      } else {
        // All variants OOS — just delete, nothing to upsert
        await this.listingUpsertService.deleteStaleListings(productUrlId, []);
      }

      result.success = true;

      // Update product URL status
      await this.updateProductUrlStatus(productUrlId, 'success', undefined, variants.length);

      this.logger.log(
        `Extracted ${variants.length} variants (${result.variantsInStock} in stock), ` +
          `upserted ${result.cardsUpserted} listings, ` +
          `deleted stale (${result.variantsOutOfStock} OOS) ` +
          `(${result.matchedPrintings} matched, ${result.unmatchedPrintings} unmatched) ` +
          `for ${handle} @ ${store.name}`,
      );

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Processing failed for ${handle}: ${result.error}`);
      await this.updateProductUrlStatus(productUrlId, 'error', result.error);
      return result;
    }
  }

  /**
   * Handle a token product: match against token tables, upsert to token_listings/token_variants.
   * Falls through to unmatched_cards if no token name match is found.
   */
  private async handleTokenProduct(
    firstVariant: ExtractedCardVariant,
    variants: ExtractedCardVariant[],
    store: Store,
    productUrlId: number,
    result: ExtractionResult,
    discoveryRunId?: number,
  ): Promise<ExtractionResult> {
    const matchResult = await this.tokenMatcher.match(
      firstVariant.cardName,
      firstVariant.setCode,
      firstVariant.collectorNumber,
      firstVariant.setName,
    );

    // Unmatched token — store in unmatched_cards
    if (matchResult.confidence === 'none') {
      result.unmatchedPrintings = 1;

      const normalizedName = firstVariant.cardName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/['']/g, "'")
        .replace(/[""]/g, '"');

      const unmatchedRows: UnmatchedCardRow[] = [];
      for (const variant of variants) {
        unmatchedRows.push({
          storeId: store.id,
          productUrlId,
          rawName: variant.cardName,
          normalizedName,
          setName: variant.setName || null,
          setCode: variant.setCode || null,
          collectorNumber: variant.collectorNumber || null,
          condition: variant.condition,
          foil: variant.foil,
          price: variant.price,
          currency: variant.currency,
          inStock: variant.inStock ?? false,
          quantity: variant.quantity ?? null,
          imageUrl: variant.imageUrl || null,
          productLink: variant.productUrl,
          sku: variant.sku || null,
          platformVariantId: variant.platformVariantId || null,
        });
      }

      await this.unmatchedCardService.upsertBatch(unmatchedRows);
      result.unmatchedCards = unmatchedRows.length;
      result.success = true;

      await this.updateProductUrlStatus(productUrlId, 'success', undefined, variants.length);

      this.logger.log(
        `Extracted ${variants.length} token variants (unmatched) ` +
          `for product @ ${store.name} → unmatched_cards`,
      );

      return result;
    }

    // Matched token — build listing + variant rows (in-stock only)
    if (matchResult.tokenPrintingId) {
      result.matchedPrintings = 1;
    } else {
      result.unmatchedPrintings = 1;
    }

    const inStockVariants = variants.filter((v) => v.inStock);

    const listing: TokenListingRow = {
      tokenNameId: matchResult.tokenNameId,
      tokenPrintingId: matchResult.tokenPrintingId,
      storeId: store.id,
      productUrlId,
      rawTitle: firstVariant.cardName,
      imageUrl: firstVariant.imageUrl || null,
      currency: firstVariant.currency,
    };

    const variantRows: TokenVariantRow[] = [];
    const inStockVariantIds: string[] = [];

    for (const variant of inStockVariants) {
      try {
        variantRows.push({
          conditionCode: variant.condition,
          foil: variant.foil,
          price: variant.price,
          quantity: variant.quantity ?? null,
          platformVariantId: variant.platformVariantId || null,
          sku: variant.sku || null,
        });

        if (variant.platformVariantId) {
          inStockVariantIds.push(variant.platformVariantId);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to prepare token variant ${variant.cardName}: ${error}`,
        );
      }
    }

    // Stale cleanup runs after upsert in the flush cycle to avoid race condition
    if (variantRows.length > 0) {
      this.tokenBatchAccumulator.addMany([{
        listing,
        variants: variantRows,
        staleCleanup: { productUrlId, inStockVariantIds },
        discoveryRunId,
      }]);
      result.cardsUpserted = variantRows.length;
    } else {
      // All variants OOS — just delete, nothing to upsert
      await this.tokenListingUpsertService.deleteStaleListings(productUrlId, []);
    }

    result.success = true;

    await this.updateProductUrlStatus(productUrlId, 'success', undefined, variants.length);

    this.logger.log(
      `Extracted ${variants.length} token variants (${result.variantsInStock} in stock), ` +
        `upserted ${result.cardsUpserted} token listings ` +
        `(${result.matchedPrintings} matched, ${result.unmatchedPrintings} unmatched) ` +
        `for product @ ${store.name}`,
    );

    return result;
  }

  private async updateProductUrlStatus(
    productUrlId: number,
    status: 'success' | 'error',
    error?: string,
    variantsTotal?: number,
  ): Promise<void> {
    const updateData: Partial<ProductUrl> = {
      extractionStatus: status,
      lastExtractedAt: new Date(),
      extractionError: error ?? undefined,
    };

    if (variantsTotal !== undefined) {
      updateData.variantsTotal = variantsTotal;
    }

    await this.productUrlRepository.update(productUrlId, updateData);
  }
}
