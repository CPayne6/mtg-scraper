import {
  Controller,
  Put,
  Get,
  Body,
  Query,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '@scoutlgs/shared';
import type { StorefrontExtractionJobData } from '@scoutlgs/shared';
import { Store, UnmatchedCard } from '@scoutlgs/core';
import { PrintingMatcherService } from './printing-matcher.service';
import { BatchAccumulatorService } from './batch-accumulator.service';
import { TriggerExtractionDto, RetryUnmatchedDto } from './dto/trigger-extraction.dto';
import type { ListingRow, VariantRow } from './listing-upsert.service';

@Controller('extraction')
export class ExtractionController {
  private readonly logger = new Logger(ExtractionController.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(UnmatchedCard)
    private readonly unmatchedCardRepository: Repository<UnmatchedCard>,
    @InjectQueue(QUEUE_NAMES.STOREFRONT_EXTRACTION)
    private readonly storefrontQueue: Queue,
    private readonly dataSource: DataSource,
    private readonly printingMatcher: PrintingMatcherService,
    private readonly batchAccumulator: BatchAccumulatorService,
  ) {}

  /**
   * Trigger extraction for a store.
   * Routes to the appropriate extraction strategy based on the store's platform type.
   */
  @Put('trigger')
  async triggerExtraction(@Body() dto: TriggerExtractionDto) {
    const store = await this.storeRepository.findOne({
      where: { id: dto.storeId },
    });
    if (!store) {
      throw new NotFoundException(`Store ${dto.storeId} not found`);
    }

    switch (store.platformType) {
      case 'shopify_storefront': {
        const scope = store.scraperConfig?.storefrontScope;
        if (!scope) {
          throw new BadRequestException(
            `Store ${store.name} is missing scraperConfig.storefrontScope`,
          );
        }

        const job = await this.storefrontQueue.add(
          JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
          {
            storeId: store.id,
            scope,
            maxCardsAdded: dto.maxCardsAdded,
          } as StorefrontExtractionJobData,
          { removeOnComplete: 100, removeOnFail: 500 },
        );

        this.logger.warn(
          `Triggered storefront extraction for ${store.name} (job ${job.id})`,
        );

        return {
          message: `Extraction triggered for ${store.name}`,
          jobId: job.id,
          platformType: store.platformType,
          scope,
        };
      }

      // Future: case 'shopify': { ... old pipeline ... }
      // Future: case 'conduct_commerce': { ... }

      default:
        throw new BadRequestException(
          `Extraction not supported for platform type: ${store.platformType}`,
        );
    }
  }

  /**
   * Trigger extraction for all stores that support it.
   */
  @Put('trigger-all')
  async triggerAllExtractions(
    @Body() dto: Omit<TriggerExtractionDto, 'storeId'>,
  ) {
    const stores = await this.storeRepository.find({
      where: { isActive: true },
    });

    const results: { store: string; jobId?: string; error?: string }[] = [];

    for (const store of stores) {
      try {
        if (store.platformType === 'shopify_storefront') {
          const scope = store.scraperConfig?.storefrontScope;
          if (!scope) {
            results.push({ store: store.name, error: 'Missing storefrontScope' });
            continue;
          }

          const job = await this.storefrontQueue.add(
            JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
            {
              storeId: store.id,
              scope,
            } as StorefrontExtractionJobData,
            { removeOnComplete: 100, removeOnFail: 500 },
          );
          results.push({ store: store.name, jobId: String(job.id) });
        } else {
          results.push({
            store: store.name,
            error: `Unsupported platform: ${store.platformType}`,
          });
        }
      } catch (error) {
        results.push({
          store: store.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.warn(
      `Triggered extraction for ${results.filter((r) => r.jobId).length}/${stores.length} stores`,
    );

    return {
      triggered: results.filter((r) => r.jobId).length,
      total: stores.length,
      results,
    };
  }

  /**
   * Retry matching on unmatched cards.
   * Platform-agnostic: works for any extraction strategy.
   */
  @Put('retry-unmatched')
  async retryUnmatched(@Body() dto: RetryUnmatchedDto) {
    const limit = dto.limit ?? 1000;

    this.logger.warn(
      `Retrying unmatched cards` +
        (dto.storeId ? ` for store ${dto.storeId}` : ' for all stores') +
        ` (limit: ${limit})`,
    );

    const params: unknown[] = [limit];
    const storeFilter = dto.storeId ? 'AND uc.store_id = $2' : '';
    if (dto.storeId) params.push(dto.storeId);

    const unmatchedProducts: {
      product_url_id: number;
      store_id: number;
      raw_name: string;
      normalized_name: string;
      set_code: string | null;
      collector_number: string | null;
      set_name: string | null;
    }[] = await this.dataSource.query(
      `SELECT DISTINCT ON (uc.product_url_id)
        uc.product_url_id, uc.store_id, uc.raw_name, uc.normalized_name,
        uc.set_code, uc.collector_number, uc.set_name
       FROM unmatched_cards uc
       WHERE uc.product_url_id IS NOT NULL ${storeFilter}
       ORDER BY uc.product_url_id, uc.id
       LIMIT $1`,
      params,
    );

    let matched = 0;
    let stillUnmatched = 0;
    let errors = 0;

    for (const product of unmatchedProducts) {
      try {
        const matchResult = await this.printingMatcher.match(
          product.raw_name,
          product.set_code ?? undefined,
          product.collector_number ?? undefined,
          product.set_name ?? undefined,
        );

        if (matchResult.confidence !== 'none' && matchResult.cardNameId) {
          await this.promoteToListing(product, matchResult);
          matched++;
        } else {
          await this.dataSource.query(
            `UPDATE unmatched_cards
             SET retry_count = COALESCE(retry_count, 0) + 1, last_retry_at = NOW()
             WHERE product_url_id = $1 AND store_id = $2`,
            [product.product_url_id, product.store_id],
          );
          stillUnmatched++;
        }
      } catch (error) {
        errors++;
        this.logger.error(`Error retrying ${product.raw_name}: ${error}`);
      }
    }

    const result = {
      attempted: unmatchedProducts.length,
      matched,
      stillUnmatched,
      errors,
    };
    this.logger.warn(`Retry complete: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Get unmatched card statistics per store.
   */
  @Get('unmatched-stats')
  async unmatchedStats() {
    return this.dataSource.query(`
      SELECT s.name as store_name, s.id as store_id,
        COUNT(DISTINCT uc.product_url_id) as unmatched_products,
        COUNT(*) as unmatched_variants,
        COUNT(*) FILTER (WHERE cn.id IS NOT NULL) as has_card_name,
        COUNT(*) FILTER (WHERE cn.id IS NULL) as no_card_name,
        COUNT(*) FILTER (WHERE uc.retry_count > 0) as retried
      FROM unmatched_cards uc
      JOIN stores s ON s.id = uc.store_id
      LEFT JOIN card_names cn ON cn.normalized_name = uc.normalized_name
      GROUP BY s.id, s.name
      ORDER BY COUNT(*) DESC
    `);
  }

  /**
   * Get extraction progress for active stores.
   */
  @Get('status')
  async extractionStatus() {
    return this.dataSource.query(`
      SELECT s.name, s.platform_type,
        (SELECT COUNT(*) FROM product_urls pu WHERE pu.store_id = s.id) as product_urls,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.store_id = s.id) as shopify_products,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.store_id = s.id AND sp.match_status = 'matched') as matched,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.store_id = s.id AND sp.match_status = 'unmatched') as unmatched,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.store_id = s.id AND sp.match_status = 'token') as tokens,
        (SELECT COUNT(*) FROM card_listings cl WHERE cl.store_id = s.id) as listings,
        (SELECT COUNT(*) FROM unmatched_cards uc WHERE uc.store_id = s.id) as unmatched_cards
      FROM stores s
      WHERE s.is_active = true
      ORDER BY s.id
    `);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async promoteToListing(
    product: {
      product_url_id: number;
      store_id: number;
      raw_name: string;
    },
    matchResult: {
      cardNameId: number | null;
      cardPrintingId: number | null;
    },
  ): Promise<void> {
    const variants: {
      condition: string;
      foil: boolean;
      price: number;
      quantity: number | null;
      platform_variant_id: string | null;
      sku: string | null;
      image_url: string | null;
      currency: string;
      in_stock: boolean;
    }[] = await this.dataSource.query(
      `SELECT condition, foil, price, quantity, platform_variant_id,
              sku, image_url, currency, in_stock
       FROM unmatched_cards
       WHERE product_url_id = $1 AND store_id = $2`,
      [product.product_url_id, product.store_id],
    );

    const listing: ListingRow = {
      cardNameId: matchResult.cardNameId,
      cardPrintingId: matchResult.cardPrintingId,
      storeId: product.store_id,
      productUrlId: product.product_url_id,
      rawTitle: product.raw_name,
      imageUrl: variants[0]?.image_url || null,
      currency: variants[0]?.currency || 'CAD',
    };

    const inStockVariants = variants.filter(
      (v) => v.in_stock && (v.quantity === null || v.quantity > 0),
    );

    const variantRows: VariantRow[] = inStockVariants.map((v) => ({
      conditionCode: v.condition,
      foil: v.foil,
      price: Number(v.price),
      quantity: v.quantity,
      platformVariantId: v.platform_variant_id,
      sku: v.sku,
    }));

    const inStockVariantIds = inStockVariants
      .filter((v) => v.platform_variant_id)
      .map((v) => v.platform_variant_id!);

    if (variantRows.length > 0) {
      this.batchAccumulator.addMany([{
        listing,
        variants: variantRows,
        staleCleanup: { productUrlId: product.product_url_id, inStockVariantIds },
      }]);
    }

    await this.dataSource.query(
      `DELETE FROM unmatched_cards WHERE product_url_id = $1 AND store_id = $2`,
      [product.product_url_id, product.store_id],
    );

    await this.dataSource.query(
      `UPDATE shopify_products SET match_status = 'matched', updated_at = NOW()
       WHERE product_url_id = $1`,
      [product.product_url_id],
    );
  }
}
