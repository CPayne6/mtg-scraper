import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  QueueService,
  PlatformAdapterFactory,
  ShopifyDiscoveryAdapter,
  ProxyService,
} from '@scoutlgs/core';
import type { DiscoveredProduct } from '@scoutlgs/core';
import pLimit from 'p-limit';

export interface DiscoveryResult {
  storeId: number;
  storeName: string;
  discovered: number;
  newProducts: number;
  updatedProducts: number;
  skippedInvalid: number;
  invalidProducts: number;
  revalidatedProducts: number;
  extractionJobsQueued: number;
  errors: string[];
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private readonly STALENESS_HOURS = 24;
  private readonly REVALIDATION_DAYS = 7;

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(MtgSinglesCollection)
    private readonly collectionRepository: Repository<MtgSinglesCollection>,
    private readonly queueService: QueueService,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly shopifyDiscoveryAdapter: ShopifyDiscoveryAdapter,
    private readonly proxyService: ProxyService,
  ) {
    // Configure proxy for Shopify discovery adapter
    this.shopifyDiscoveryAdapter.setProxyAgentFactory(
      () => this.proxyService.getRotatingProxyAgent('discovery'),
    );
  }

  /**
   * Discover products for a single store (called by queue processor).
   */
  async discoverStore(storeId: number): Promise<DiscoveryResult> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['platform'],
    });

    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    this.logger.log(`Starting discovery for store: ${store.name} (ID: ${store.id})`);

    const result: DiscoveryResult = {
      storeId: store.id,
      storeName: store.name,
      discovered: 0,
      newProducts: 0,
      updatedProducts: 0,
      skippedInvalid: 0,
      invalidProducts: 0,
      revalidatedProducts: 0,
      extractionJobsQueued: 0,
      errors: [],
    };

    if (!store.platformType) {
      result.errors.push('Store has no platform type configured');
      return result;
    }

    if (!store.discoveryConfig?.mtgSinglesCollectionId) {
      result.errors.push('Store has no MTG singles collection configured');
      return result;
    }

    const collection = await this.collectionRepository.findOne({
      where: { id: store.discoveryConfig.mtgSinglesCollectionId },
    });

    if (!collection) {
      result.errors.push(
        `Collection ID ${store.discoveryConfig.mtgSinglesCollectionId} not found`,
      );
      return result;
    }

    let adapter;
    try {
      adapter = this.platformAdapterFactory.getDiscoveryAdapter(store.platformType);
    } catch {
      result.errors.push(`No discovery adapter for platform: ${store.platformType}`);
      return result;
    }

    // Discover products from sitemap
    const batchSize = 100;
    let batch: DiscoveredProduct[] = [];

    this.logger.log(`Discovering products from ${store.name} sitemap...`);

    for await (const product of adapter.discoverProducts(store, collection)) {
      batch.push(product);
      result.discovered++;

      if (batch.length >= batchSize) {
        await this.processBatch(store, collection, batch, result);
        batch = [];
      }

      if (result.discovered % 1000 === 0) {
        this.logger.log(
          `${store.name}: Discovered ${result.discovered} products so far`,
        );
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      await this.processBatch(store, collection, batch, result);
    }

    this.logger.log(
      `${store.name} discovery complete: ${result.discovered} discovered, ` +
        `${result.newProducts} new, ${result.updatedProducts} updated, ` +
        `${result.skippedInvalid} skipped invalid, ${result.invalidProducts} newly invalid, ` +
        `${result.revalidatedProducts} revalidated, ${result.extractionJobsQueued} extraction jobs queued`,
    );

    return result;
  }

  /**
   * Process a batch of discovered products: diff DB, validate new, upsert, enqueue extraction.
   */
  private async processBatch(
    store: Store,
    collection: MtgSinglesCollection,
    products: DiscoveredProduct[],
    result: DiscoveryResult,
  ): Promise<void> {
    // Check which handles already exist
    const handles = products.map((p) => p.handle);
    const existingUrls = await this.productUrlRepository.find({
      where: handles.map((handle) => ({
        storeId: store.id,
        handle,
      })),
      select: ['id', 'handle', 'sitemapLastmod', 'lastExtractedAt', 'isInvalid', 'lastValidatedAt'],
    });

    const existingMap = new Map(existingUrls.map((u) => [u.handle, u]));

    const newProducts: DiscoveredProduct[] = [];
    const staleProducts: DiscoveredProduct[] = [];
    const revalidateProducts: DiscoveredProduct[] = [];

    const now = new Date();
    const stalenessThreshold = new Date(
      Date.now() - this.STALENESS_HOURS * 60 * 60 * 1000,
    );
    const revalidationThreshold = new Date(
      Date.now() - this.REVALIDATION_DAYS * 24 * 60 * 60 * 1000,
    );

    for (const product of products) {
      const existing = existingMap.get(product.handle);
      if (!existing) {
        newProducts.push(product);
      } else if (existing.isInvalid) {
        // Known invalid — check if due for re-validation
        if (
          !existing.lastValidatedAt ||
          existing.lastValidatedAt < revalidationThreshold
        ) {
          revalidateProducts.push(product);
        } else {
          result.skippedInvalid++;
        }
      } else {
        // Valid product — check if stale
        const hasNewLastmod =
          product.lastModified &&
          existing.sitemapLastmod &&
          product.lastModified > existing.sitemapLastmod;

        const isStale =
          !existing.lastExtractedAt ||
          existing.lastExtractedAt < stalenessThreshold;

        if (hasNewLastmod || isStale) {
          staleProducts.push(product);
        }
      }
    }

    // Validate new + re-validate products via HEAD request (p-limit for concurrency)
    const limit = pLimit(100);
    const adapter = this.platformAdapterFactory.getDiscoveryAdapter(store.platformType!);
    const validatedProducts: DiscoveredProduct[] = [];
    const invalidatedProducts: DiscoveredProduct[] = [];
    const productsToValidate = [...newProducts, ...revalidateProducts];
    const revalidateHandles = new Set(revalidateProducts.map((p) => p.handle));

    await Promise.all(
      productsToValidate.map((product) =>
        limit(async () => {
          try {
            const isValid = await adapter.validateProduct(store, collection, product.handle);
            if (isValid) {
              validatedProducts.push(product);
            } else {
              invalidatedProducts.push(product);
            }
          } catch (error) {
            this.logger.warn(
              `Validation error for ${product.handle} at ${store.name}: ${error}`,
            );
            invalidatedProducts.push(product);
          }
        }),
      ),
    );

    // Count re-validated products that passed
    const revalidatedCount = validatedProducts.filter((p) =>
      revalidateHandles.has(p.handle),
    ).length;
    result.newProducts += validatedProducts.length - revalidatedCount;
    result.revalidatedProducts += revalidatedCount;
    result.updatedProducts += staleProducts.length;
    result.invalidProducts += invalidatedProducts.length;

    // Bulk upsert invalid products
    if (invalidatedProducts.length > 0) {
      const invalidUrls = invalidatedProducts.map((p) =>
        this.productUrlRepository.create({
          storeId: store.id,
          mtgSinglesCollectionId: collection.id,
          handle: p.handle,
          sitemapLastmod: p.lastModified,
          imageUrl: p.imageUrl,
          imageTitle: p.imageTitle,
          isInvalid: true,
          lastValidatedAt: now,
        }),
      );

      await this.productUrlRepository.upsert(invalidUrls, {
        conflictPaths: ['storeId', 'handle'],
        skipUpdateIfNoValuesChanged: true,
      });
    }

    // Upsert validated products
    if (validatedProducts.length > 0) {
      const productUrls = validatedProducts.map((p) =>
        this.productUrlRepository.create({
          storeId: store.id,
          mtgSinglesCollectionId: collection.id,
          handle: p.handle,
          sitemapLastmod: p.lastModified,
          imageUrl: p.imageUrl,
          imageTitle: p.imageTitle,
          isInvalid: false,
          lastValidatedAt: now,
          extractionStatus: 'pending',
        }),
      );

      await this.productUrlRepository.upsert(productUrls, {
        conflictPaths: ['storeId', 'handle'],
        skipUpdateIfNoValuesChanged: true,
      });

      // Get IDs for newly inserted
      const insertedUrls = await this.productUrlRepository.find({
        where: validatedProducts.map((p) => ({
          storeId: store.id,
          handle: p.handle,
        })),
        select: ['id', 'handle'],
      });

      const extractionJobs = insertedUrls.map((url) => ({
        productUrlId: url.id,
        storeId: store.id,
        handle: url.handle,
        priority: 1,
      }));

      if (extractionJobs.length > 0) {
        await this.queueService.enqueueExtractionJobsBulk(extractionJobs);
        result.extractionJobsQueued += extractionJobs.length;
      }
    }

    // Mark stale/updated products for re-extraction
    if (staleProducts.length > 0) {
      const staleHandles = staleProducts.map((p) => p.handle);

      await this.productUrlRepository
        .createQueryBuilder()
        .update(ProductUrl)
        .set({ extractionStatus: 'pending' })
        .where('store_id = :storeId', { storeId: store.id })
        .andWhere('handle IN (:...handles)', { handles: staleHandles })
        .execute();

      const staleUrls = await this.productUrlRepository.find({
        where: staleProducts.map((p) => ({
          storeId: store.id,
          handle: p.handle,
        })),
        select: ['id', 'handle'],
      });

      const extractionJobs = staleUrls.map((url) => ({
        productUrlId: url.id,
        storeId: store.id,
        handle: url.handle,
        priority: 1,
      }));

      if (extractionJobs.length > 0) {
        await this.queueService.enqueueExtractionJobsBulk(extractionJobs);
        result.extractionJobsQueued += extractionJobs.length;
      }
    }
  }
}
