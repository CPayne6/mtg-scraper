import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Store,
  ProductUrl,
  PlatformAdapterFactory,
  ExtractionHttpError,
} from '@scoutlgs/core';
import { ScrapeError, ScrapeErrorType, classifyHttpStatus } from '../scraper/errors';
import { PrintingMatcherService } from './printing-matcher.service';
import { BatchAccumulatorService } from './batch-accumulator.service';
import { UnmatchedCardService } from './unmatched-card.service';
import type { ListingRow } from './listing-upsert.service';
import type { UnmatchedCardRow } from './unmatched-card.service';

export interface ExtractionResult {
  productUrlId: string;
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
    private readonly unmatchedCardService: UnmatchedCardService,
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
   * Extract product data and upsert card variants to database.
   * V2: Stores ALL variants (not just in-stock), matches to card_printings.
   * Cards that can't be matched are stored in unmatched_cards instead.
   */
  async extractProduct(
    productUrlId: string,
    storeId: number,
    handle: string,
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

      // Matched card — build listing rows
      if (matchResult.cardPrintingId) {
        result.matchedPrintings = 1;
      } else {
        result.unmatchedPrintings = 1;
      }

      const rows: ListingRow[] = [];
      const title = `${firstVariant.cardName} [${firstVariant.setName || 'Unknown'}]`;

      for (const variant of variants) {
        try {
          rows.push({
            cardNameId: matchResult.cardNameId,
            cardPrintingId: matchResult.cardPrintingId,
            storeId: store.id,
            productUrlId,
            title,
            rawTitle: variant.cardName,
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
        } catch (error) {
          this.logger.warn(
            `Failed to prepare variant ${variant.cardName}: ${error}`,
          );
        }
      }

      // Add to batch accumulator (non-blocking, flushed in background)
      if (rows.length > 0) {
        this.batchAccumulator.addMany(rows);
        result.cardsUpserted = rows.length;
      }

      result.success = true;

      // Update product URL status
      await this.updateProductUrlStatus(productUrlId, 'success', undefined, variants.length);

      this.logger.log(
        `Extracted ${variants.length} variants (${result.variantsInStock} in stock), ` +
          `upserted ${result.cardsUpserted} listings ` +
          `(${result.matchedPrintings} matched, ${result.unmatchedPrintings} unmatched) ` +
          `for ${handle} @ ${store.name}`,
      );

      return result;
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

      const cause = error instanceof Error && 'cause' in error ? (error as any).cause : undefined;
      const causeDetail = cause?.code ?? cause?.message ?? '';
      result.error = error instanceof Error ? error.message : String(error);
      if (causeDetail) result.error += ` (${causeDetail})`;
      this.logger.error(`Extraction failed for ${handle}: ${result.error}`);
      await this.updateProductUrlStatus(productUrlId, 'error', result.error);
      return result;
    }
  }

  private async updateProductUrlStatus(
    productUrlId: string,
    status: 'success' | 'error',
    error?: string,
    variantsTotal?: number,
  ): Promise<void> {
    const updateData: Partial<ProductUrl> = {
      extractionStatus: status,
      lastExtractedAt: new Date(),
    };

    if (error) {
      updateData.extractionError = error;
    }

    if (variantsTotal !== undefined) {
      updateData.variantsTotal = variantsTotal;
    }

    await this.productUrlRepository.update(productUrlId, updateData);
  }
}
