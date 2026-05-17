import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Store,
  ProductUrl,
  PlatformAdapterFactory,
  ExtractionHttpError,
} from '@scoutlgs/core';
import type { ExtractedCardVariant } from '@scoutlgs/core';
import { ScrapeError, ScrapeErrorType, classifyHttpStatus } from '../scraper/errors';
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
    private readonly platformAdapterFactory: PlatformAdapterFactory,
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
   * Extract product data and upsert in-stock card variants to database.
   * Out-of-stock variants are deleted. Cards that can't be matched are stored
   * in unmatched_cards instead.
   */
  async extractProduct(
    productUrlId: number,
    storeId: number,
    handle: string,
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

      if (!store.platformType) {
        result.error = `Store ${store.name} has no platform type configured`;
        await this.updateProductUrlStatus(productUrlId, 'error', result.error);
        return result;
      }

      let adapter;
      try {
        adapter = this.platformAdapterFactory.getExtractionAdapter(store.platformType);
      } catch {
        result.error = `No extraction adapter for platform: ${store.platformType}`;
        await this.updateProductUrlStatus(productUrlId, 'error', result.error);
        return result;
      }

      // Extract product data
      const variants = await adapter.extractProduct(store, handle);

      return this.processExtractedVariants(
        productUrlId,
        storeId,
        handle,
        variants,
        discoveryRunId,
      );
    } catch (error) {
      if (error instanceof ExtractionHttpError) {
        const errorType = classifyHttpStatus(error.statusCode) ?? ScrapeErrorType.UNKNOWN;
        const scrapeError = new ScrapeError(error.message, errorType, {
          statusCode: error.statusCode,
          retryAfter: error.retryAfter,
          url: error.url,
        });

        this.logger.error(`Extraction HTTP error for ${handle}: ${scrapeError.message}`);
        await this.updateProductUrlStatus(productUrlId, 'error', scrapeError.message);
        throw scrapeError;
      }

      // Check for network-level errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT, etc.)
      // These are retryable — wrap as ScrapeError and throw so the processor backs off
      const cause = error instanceof Error && 'cause' in error ? (error as any).cause : undefined;
      const causeCode = cause?.code ?? '';
      const isNetworkError = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(causeCode)
        || (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout')));

      if (isNetworkError) {
        const scrapeError = ScrapeError.fromNetworkError(
          error instanceof Error ? error : new Error(String(error)),
          `${handle} @ store ${storeId}`,
        );
        this.logger.warn(`Network error for ${handle}: ${scrapeError.message} (${causeCode})`);
        await this.updateProductUrlStatus(productUrlId, 'error', `fetch failed (${causeCode})`);
        throw scrapeError;
      }

      const causeDetail = causeCode || cause?.message || '';
      result.error = error instanceof Error ? error.message : String(error);
      if (causeDetail) result.error += ` (${causeDetail})`;
      this.logger.error(`Extraction failed for ${handle}: ${result.error}`);
      await this.updateProductUrlStatus(productUrlId, 'error', result.error);
      return result;
    }
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
      result.variantsInStock = variants.filter(
        (v) => v.inStock && (v.quantity === undefined || v.quantity > 0),
      ).length;
      result.variantsOutOfStock = variants.length - result.variantsInStock;

      // All variants in a product share the same card — resolve once
      const firstVariant = variants[0];

      // Check if this is a token product — route to token pipeline
      if (this.detectToken(firstVariant)) {
        return this.handleTokenProduct(
          firstVariant,
          variants,
          store,
          productUrlId,
          result,
          discoveryRunId,
        );
      }

      const matchResult = await this.printingMatcher.match(
        firstVariant.cardName,
        firstVariant.setCode,
        firstVariant.collectorNumber,
        firstVariant.setName,
      );

      // Unmatched card name — store in unmatched_cards, skip listing creation
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
          `Extracted ${variants.length} variants (unmatched card name) ` +
            `for ${handle} @ ${store.name} → unmatched_cards`,
        );

        return result;
      }

      // Matched card — build listing + variant rows (in-stock only)
      if (matchResult.cardPrintingId) {
        result.matchedPrintings = 1;
      } else {
        result.unmatchedPrintings = 1;
      }

      // Filter to in-stock variants only
      const inStockVariants = variants.filter(
        (v) => v.inStock && (v.quantity === undefined || v.quantity > 0),
      );

      // Build one listing per product, with variants underneath
      const listing: ListingRow = {
        cardNameId: matchResult.cardNameId,
        cardPrintingId: matchResult.cardPrintingId,
        storeId: store.id,
        productUrlId,
        rawTitle: firstVariant.cardName,
        imageUrl: firstVariant.imageUrl || null,
        currency: firstVariant.currency,
      };

      const variantRows: VariantRow[] = [];
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
   * Detect whether an extracted variant represents a token product.
   * Checks multiple signals in priority order.
   */
  private detectToken(variant: ExtractedCardVariant): boolean {
    // 1. Explicit isToken from SKU parsing (e.g., 401 MTGTN/MTGTF)
    if (variant.isToken) return true;

    // 2. SKU prefix check
    if (variant.sku) {
      const skuUpper = variant.sku.toUpperCase();
      if (skuUpper.startsWith('MTGTN') || skuUpper.startsWith('MTGTF')) return true;
    }

    // 3. Set name contains token/emblem/art series keywords
    if (variant.setName) {
      const setNameLower = variant.setName.toLowerCase();
      if (
        setNameLower.includes('token') ||
        setNameLower.includes('emblem') ||
        setNameLower.includes('art series')
      ) {
        return true;
      }
    }

    // 4. Card name contains "Emblem" or "Art Card"
    if (variant.cardName) {
      const nameLower = variant.cardName.toLowerCase();
      if (nameLower.includes('emblem') || nameLower.includes('art card')) return true;
    }

    // 5. T-prefixed set code (e.g., TIKO, TM21) — token sets
    if (variant.setCode) {
      const codeUpper = variant.setCode.toUpperCase();
      if (/^T[A-Z0-9]{2,4}$/.test(codeUpper)) return true;
    }

    return false;
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

    const inStockVariants = variants.filter(
      (v) => v.inStock && (v.quantity === undefined || v.quantity > 0),
    );

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
