import { Process, Processor } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  StorefrontExtractionJobData,
  StorefrontExtractionJobResult,
} from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  ShopifyProduct,
  PlatformAdapterFactory,
} from '@scoutlgs/core';
import type { ExtractedCardVariant } from '@scoutlgs/core';
import type { StorefrontExtractionAdapter } from '@scoutlgs/core';
import { ExtractionService } from '../extraction/extraction.service';
import { PrintingMatcherService } from '../extraction/printing-matcher.service';

/** A single extracted product from the Shopify API */
interface ExtractedProduct {
  shopifyProductId: string;
  handle: string;
  updatedAt: Date;
  variants: ExtractedCardVariant[];
}

@Processor(QUEUE_NAMES.STOREFRONT_EXTRACTION)
export class StorefrontProcessor implements OnModuleInit {
  private readonly logger = new Logger(StorefrontProcessor.name);
  private readonly PAGE_SIZE = 250;

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(MtgSinglesCollection)
    private readonly collectionRepository: Repository<MtgSinglesCollection>,
    @InjectRepository(ShopifyProduct)
    private readonly shopifyProductRepository: Repository<ShopifyProduct>,
    private readonly dataSource: DataSource,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly extractionService: ExtractionService,
    private readonly printingMatcher: PrintingMatcherService,
  ) {
    this.logger.log('StorefrontProcessor instantiated');
  }

  async onModuleInit() {
    await this.printingMatcher.warmCaches();
  }

  @Process({
    name: JOB_NAMES.EXTRACT_STOREFRONT_COLLECTION,
    concurrency: 1,
  })
  async process(
    job: Job<StorefrontExtractionJobData>,
  ): Promise<StorefrontExtractionJobResult> {
    const { storeId, discoveryRunId, maxCardsAdded } = job.data;

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    const scope = store.scraperConfig?.storefrontScope;
    if (!scope) {
      throw new Error(
        `Store ${store.name} (${storeId}) is missing scraperConfig.storefrontScope`,
      );
    }

    this.logger.warn(
      `Starting Storefront ID-based extraction for ${store.name}` +
        (maxCardsAdded ? ` (limit: ${maxCardsAdded} cards)` : ''),
    );

    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    const collection = await this.getCollection(store);
    const collectionId = collection?.id ?? 0;

    let productsProcessed = 0;
    let productsSkipped = 0;
    let cardsAdded = 0;
    let errors = 0;
    let limitReached = false;

    let pageBatch: ExtractedProduct[] = [];

    try {
      for await (const product of adapter.extractByIdPagination(
        store,
        scope,
      )) {
        pageBatch.push(product);

        if (pageBatch.length >= this.PAGE_SIZE) {
          const pageResult = await this.processPage(
            pageBatch, store.id, collectionId, discoveryRunId,
          );
          productsProcessed += pageResult.processed;
          productsSkipped += pageResult.skipped;
          cardsAdded += pageResult.cards;
          errors += pageResult.errors;
          pageBatch = [];

          if (maxCardsAdded && cardsAdded >= maxCardsAdded) {
            limitReached = true;
            this.logger.warn(
              `${store.name}: Card limit reached (${cardsAdded}/${maxCardsAdded}). Stopping.`,
            );
            break;
          }

          const total = productsProcessed + productsSkipped;
          if (total % 500 === 0 && total > 0) {
            this.logger.warn(
              `${store.name}: ${productsProcessed} processed, ${productsSkipped} skipped, ${cardsAdded} cards, ${errors} errors`,
            );
          }
        }
      }

      if (pageBatch.length > 0 && !limitReached) {
        const pageResult = await this.processPage(
          pageBatch, store.id, collectionId, discoveryRunId,
        );
        productsProcessed += pageResult.processed;
        productsSkipped += pageResult.skipped;
        cardsAdded += pageResult.cards;
        errors += pageResult.errors;
      }
    } catch (error) {
      this.logger.error(
        `Storefront extraction failed for ${store.name}: ${error}`,
      );
      throw error;
    }

    this.logger.warn(
      `Completed Storefront extraction for ${store.name}: ` +
        `${productsProcessed} processed, ${productsSkipped} skipped, ${cardsAdded} cards, ${errors} errors` +
        (limitReached ? ` (limit ${maxCardsAdded} reached)` : ''),
    );

    return {
      storeId,
      collectionHandle: collection?.slug ?? '',
      productsAttempted: productsProcessed + productsSkipped + errors,
      productsProcessed,
      productsSkipped,
      errors,
      variantsExtracted: 0,
      cardsAdded,
      maxCardsAdded,
      limitReached,
      success: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Page processing with shopify_products lookup
  // ---------------------------------------------------------------------------

  private async processPage(
    products: ExtractedProduct[],
    storeId: number,
    collectionId: number,
    discoveryRunId?: number,
  ): Promise<{ processed: number; skipped: number; cards: number; errors: number }> {
    // Step 1: Bulk lookup shopify_products by PK (bigint, fastest possible)
    const shopifyIds = products.map((p) => p.shopifyProductId);
    const existingRows: {
      shopify_product_id: string;
      product_url_id: number | null;
      card_listing_id: number | null;
      match_status: string;
    }[] = await this.dataSource.query(
      `SELECT shopify_product_id, product_url_id, card_listing_id, match_status
       FROM shopify_products
       WHERE shopify_product_id = ANY($1)`,
      [shopifyIds],
    );

    const existingMap = new Map(
      existingRows.map((r) => [r.shopify_product_id, r]),
    );

    // Step 2: Separate into known (already matched) vs new products
    const newProducts: ExtractedProduct[] = [];
    const knownProducts: {
      product: ExtractedProduct;
      productUrlId: number;
      cardListingId: number | null;
      matchStatus: string;
    }[] = [];

    for (const product of products) {
      const existing = existingMap.get(product.shopifyProductId);
      if (existing?.product_url_id && existing.match_status === 'matched') {
        knownProducts.push({
          product,
          productUrlId: existing.product_url_id,
          cardListingId: existing.card_listing_id,
          matchStatus: existing.match_status,
        });
      } else {
        newProducts.push(product);
      }
    }

    let processed = 0;
    let skipped = 0;
    let cards = 0;
    let errors = 0;

    // Step 3: Known products — skip matching, just update variants
    if (knownProducts.length > 0) {
      for (const { product, productUrlId } of knownProducts) {
        try {
          const result = await this.extractionService.processExtractedVariants(
            productUrlId,
            storeId,
            product.handle,
            product.variants,
            discoveryRunId,
          );
          if (result.success) {
            processed++;
            cards += result.cardsUpserted ?? 0;
          } else {
            errors++;
          }
        } catch (error) {
          errors++;
        }
      }
    }

    // Step 4: New products — full pipeline (upsert product_url + match + extract)
    if (newProducts.length > 0) {
      const productUrlMap = await this.bulkUpsertProductUrls(
        storeId, collectionId, newProducts,
      );

      const successIds: number[] = [];
      const errorUpdates: { id: number; error: string }[] = [];
      const shopifyProductInserts: {
        shopifyProductId: string;
        productUrlId: number;
        matchStatus: string;
        isToken: boolean;
        cardListingId: number | null;
      }[] = [];

      for (const product of newProducts) {
        const productUrlId = productUrlMap.get(product.handle);
        if (!productUrlId) {
          errors++;
          continue;
        }

        try {
          const result = await this.extractionService.processExtractedVariants(
            productUrlId,
            storeId,
            product.handle,
            product.variants,
            discoveryRunId,
          );

          if (result.success) {
            processed++;
            cards += result.cardsUpserted ?? 0;
            successIds.push(productUrlId);

            // Determine match status and card_listing_id for shopify_products
            let matchStatus = 'unmatched';
            let cardListingId: number | null = null;
            const isToken = result.unmatchedCards === 0 && result.matchedPrintings === 0 && result.unmatchedPrintings === 0;

            if (isToken) {
              matchStatus = 'token';
            } else if (result.matchedPrintings > 0) {
              matchStatus = 'matched';
              // Look up the card_listing we just created
              const listing = await this.dataSource.query(
                `SELECT id FROM card_listings WHERE product_url_id = $1 LIMIT 1`,
                [productUrlId],
              );
              cardListingId = listing[0]?.id ?? null;
            }

            shopifyProductInserts.push({
              shopifyProductId: product.shopifyProductId,
              productUrlId,
              matchStatus,
              isToken,
              cardListingId,
            });
          } else {
            errors++;
            errorUpdates.push({
              id: productUrlId,
              error: result.error ?? 'Processing failed',
            });

            shopifyProductInserts.push({
              shopifyProductId: product.shopifyProductId,
              productUrlId,
              matchStatus: 'unmatched',
              isToken: false,
              cardListingId: null,
            });
          }
        } catch (error) {
          errors++;
          errorUpdates.push({
            id: productUrlId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Step 5: Bulk update product_url statuses
      await this.bulkUpdateProductUrlStatus(successIds, errorUpdates);

      // Step 6: Bulk insert shopify_products mappings
      if (shopifyProductInserts.length > 0) {
        await this.bulkUpsertShopifyProducts(storeId, shopifyProductInserts);
      }
    }

    return { processed, skipped, cards, errors };
  }

  // ---------------------------------------------------------------------------
  // Bulk DB operations
  // ---------------------------------------------------------------------------

  private async bulkUpsertProductUrls(
    storeId: number,
    collectionId: number,
    products: ExtractedProduct[],
  ): Promise<Map<string, number>> {
    if (products.length === 0) return new Map();

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const product of products) {
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, 'pending')`,
      );
      params.push(storeId, collectionId, product.handle, product.updatedAt);
      paramIdx += 4;
    }

    await this.dataSource.query(
      `INSERT INTO product_urls (store_id, mtg_singles_collection_id, handle, sitemap_lastmod, extraction_status)
       VALUES ${values.join(', ')}
       ON CONFLICT (store_id, handle) DO UPDATE SET sitemap_lastmod = EXCLUDED.sitemap_lastmod`,
      params,
    );

    const handles = products.map((p) => p.handle);
    const rows: { id: number; handle: string }[] = await this.dataSource.query(
      `SELECT id, handle FROM product_urls WHERE store_id = $1 AND handle = ANY($2)`,
      [storeId, handles],
    );

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.handle, row.id);
    }
    return map;
  }

  private async bulkUpsertShopifyProducts(
    storeId: number,
    inserts: {
      shopifyProductId: string;
      productUrlId: number;
      matchStatus: string;
      isToken: boolean;
      cardListingId: number | null;
    }[],
  ): Promise<void> {
    if (inserts.length === 0) return;

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const row of inserts) {
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`,
      );
      params.push(
        row.shopifyProductId,
        storeId,
        row.productUrlId,
        row.cardListingId,
        row.isToken,
        row.matchStatus,
      );
      paramIdx += 6;
    }

    await this.dataSource.query(
      `INSERT INTO shopify_products (shopify_product_id, store_id, product_url_id, card_listing_id, is_token, match_status)
       VALUES ${values.join(', ')}
       ON CONFLICT (shopify_product_id) DO UPDATE SET
         card_listing_id = EXCLUDED.card_listing_id,
         match_status = EXCLUDED.match_status,
         is_token = EXCLUDED.is_token,
         updated_at = NOW()`,
      params,
    );
  }

  private async bulkUpdateProductUrlStatus(
    successIds: number[],
    errorUpdates: { id: number; error: string }[],
  ): Promise<void> {
    if (successIds.length > 0) {
      await this.dataSource.query(
        `UPDATE product_urls
         SET extraction_status = 'success',
             last_extracted_at = NOW(),
             extraction_error = NULL
         WHERE id = ANY($1)`,
        [successIds],
      );
    }

    for (const { id, error } of errorUpdates) {
      await this.dataSource.query(
        `UPDATE product_urls
         SET extraction_status = 'error',
             last_extracted_at = NOW(),
             extraction_error = $1
         WHERE id = $2`,
        [error, id],
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getCollection(
    store: Store,
  ): Promise<MtgSinglesCollection | null> {
    if (!store.discoveryConfig?.mtgSinglesCollectionId) {
      return null;
    }

    return this.collectionRepository.findOne({
      where: { id: store.discoveryConfig.mtgSinglesCollectionId },
    });
  }
}
