import { Controller, Put, Get, Query, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Store,
  UnmatchedCard,
  ShopifyProduct,
} from '@scoutlgs/core';
import { PrintingMatcherService } from '../extraction/printing-matcher.service';
import { BatchAccumulatorService } from '../extraction/batch-accumulator.service';
import type { ListingRow, VariantRow } from '../extraction/listing-upsert.service';

@Controller('storefront')
export class StorefrontController {
  private readonly logger = new Logger(StorefrontController.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(UnmatchedCard)
    private readonly unmatchedCardRepository: Repository<UnmatchedCard>,
    private readonly dataSource: DataSource,
    private readonly printingMatcher: PrintingMatcherService,
    private readonly batchAccumulator: BatchAccumulatorService,
  ) {}

  /**
   * Retry matching on unmatched cards.
   * Re-runs the printing matcher on cards that previously failed to match.
   * Cards that now match are moved to card_listings and removed from unmatched_cards.
   *
   * Query params:
   *   storeId - optional, retry only for a specific store
   *   limit - max cards to retry (default 1000)
   */
  @Put('retry-unmatched')
  async retryUnmatched(
    @Query('storeId') storeIdParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const storeId = storeIdParam ? parseInt(storeIdParam, 10) : undefined;
    const limit = parseInt(limitParam ?? '1000', 10);

    this.logger.warn(
      `Retrying unmatched cards` +
        (storeId ? ` for store ${storeId}` : ' for all stores') +
        ` (limit: ${limit})`,
    );

    // Fetch unmatched cards grouped by product_url_id (one card per product)
    const whereClause = storeId ? 'AND uc.store_id = $2' : '';
    const params: unknown[] = [limit];
    if (storeId) params.push(storeId);

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
       WHERE uc.product_url_id IS NOT NULL ${whereClause}
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
          // Matched! Create listing and remove from unmatched
          const store = await this.storeRepository.findOne({
            where: { id: product.store_id },
          });
          if (!store) continue;

          // Get all unmatched variants for this product
          const variants: {
            id: number;
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
            `SELECT id, condition, foil, price, quantity, platform_variant_id,
                    sku, image_url, currency, in_stock
             FROM unmatched_cards
             WHERE product_url_id = $1 AND store_id = $2`,
            [product.product_url_id, product.store_id],
          );

          // Build listing
          const listing: ListingRow = {
            cardNameId: matchResult.cardNameId,
            cardPrintingId: matchResult.cardPrintingId,
            storeId: product.store_id,
            productUrlId: product.product_url_id,
            rawTitle: product.raw_name,
            imageUrl: variants[0]?.image_url || null,
            currency: variants[0]?.currency || 'CAD',
          };

          // Build in-stock variant rows
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
            this.batchAccumulator.addMany([
              {
                listing,
                variants: variantRows,
                staleCleanup: {
                  productUrlId: product.product_url_id,
                  inStockVariantIds,
                },
              },
            ]);
          }

          // Remove from unmatched_cards
          await this.dataSource.query(
            `DELETE FROM unmatched_cards WHERE product_url_id = $1 AND store_id = $2`,
            [product.product_url_id, product.store_id],
          );

          // Update shopify_products if exists
          await this.dataSource.query(
            `UPDATE shopify_products SET match_status = 'matched', updated_at = NOW()
             WHERE product_url_id = $1`,
            [product.product_url_id],
          );

          matched++;
        } else {
          // Still unmatched - increment retry count
          await this.dataSource.query(
            `UPDATE unmatched_cards SET retry_count = COALESCE(retry_count, 0) + 1,
                    last_retry_at = NOW()
             WHERE product_url_id = $1 AND store_id = $2`,
            [product.product_url_id, product.store_id],
          );
          stillUnmatched++;
        }
      } catch (error) {
        errors++;
        this.logger.error(
          `Error retrying ${product.raw_name}: ${error}`,
        );
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
    const rows = await this.dataSource.query(`
      SELECT s.name as store_name, s.id as store_id,
        COUNT(*) as total_unmatched,
        COUNT(*) FILTER (WHERE cn.id IS NOT NULL) as has_card_name,
        COUNT(*) FILTER (WHERE cn.id IS NULL) as no_card_name,
        COUNT(*) FILTER (WHERE uc.retry_count > 0) as retried
      FROM unmatched_cards uc
      JOIN stores s ON s.id = uc.store_id
      LEFT JOIN card_names cn ON cn.normalized_name = uc.normalized_name
      GROUP BY s.id, s.name
      ORDER BY COUNT(*) DESC
    `);
    return rows;
  }
}
