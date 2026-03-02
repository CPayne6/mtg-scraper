import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  InvalidProductHandle,
  QueueService,
  PlatformAdapterFactory,
  ShopifyDiscoveryAdapter,
  ProxyService,
  CacheService,
  RateLimiterService,
} from '@scoutlgs/core';
import type { DiscoveredProduct } from '@scoutlgs/core';
import { QUEUE_NAMES } from '@scoutlgs/shared';
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

const EXTRACTION_BACKPRESSURE = { maxDepth: 5_000 };
const BACKPRESSURE_CHECK_INTERVAL = 50;

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
    @InjectRepository(InvalidProductHandle)
    private readonly invalidHandleRepository: Repository<InvalidProductHandle>,
    private readonly queueService: QueueService,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly shopifyDiscoveryAdapter: ShopifyDiscoveryAdapter,
    private readonly proxyService: ProxyService,
    private readonly cacheService: CacheService,
    private readonly rateLimiterService: RateLimiterService,
  ) {
    // Configure rate-limited proxy for Shopify discovery adapter
    this.shopifyDiscoveryAdapter.setProxyAgentFactory(
      () => this.proxyService.getRotatingProxyAgent('discovery'),
    );
    this.shopifyDiscoveryAdapter.setRateLimiter(
      this.rateLimiterService,
      this.cacheService,
      this.proxyService,
    );
  }

  /**
   * Discover products for a single store (called by queue processor).
   */
  async discoverStore(
    storeId: number,
    options?: { skipExtraction?: boolean; discoveryRunId?: number },
  ): Promise<DiscoveryResult> {
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

    // Configure per-store rate limiting for discovery
    this.shopifyDiscoveryAdapter.setRateLimitConfig(
      store.name,
      store.rateLimitPerSecond,
      this.proxyService.getIpCount(),
    );

    // Discover products from sitemap
    const batchSize = 100;
    let batch: DiscoveredProduct[] = [];

    this.logger.log(`Discovering products from ${store.name} sitemap...`);

    try {
      for await (const product of adapter.discoverProducts(store, collection)) {
        batch.push(product);
        result.discovered++;

        if (batch.length >= batchSize) {
          await this.processBatch(store, collection, batch, result, options);
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
        await this.processBatch(store, collection, batch, result, options);
      }
    } finally {
      // Clean up any stale waitlist entries for this store (in case of crash/timeout)
      await this.queueService.cleanupBackpressureWaiters(QUEUE_NAMES.PRODUCT_EXTRACTION, store.name);
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
    options?: { skipExtraction?: boolean; discoveryRunId?: number },
  ): Promise<void> {
    // Deduplicate by handle (sitemaps can contain duplicates), keeping the last occurrence
    const deduped = [...new Map(products.map((p) => [p.handle, p])).values()];

    // Check which handles already exist in both tables in parallel
    const handles = deduped.map((p) => p.handle);
    const [existingUrls, existingInvalid] = await Promise.all([
      this.productUrlRepository.find({
        where: { storeId: store.id, handle: In(handles) },
        select: ['id', 'handle', 'sitemapLastmod', 'lastExtractedAt'],
      }),
      this.invalidHandleRepository.find({
        where: { storeId: store.id, handle: In(handles) },
      }),
    ]);

    const existingMap = new Map(existingUrls.map((u) => [u.handle, u]));
    const invalidMap = new Map(existingInvalid.map((u) => [u.handle, u]));

    const newProducts: DiscoveredProduct[] = [];
    const staleProducts: DiscoveredProduct[] = [];
    const revalidateProducts: DiscoveredProduct[] = [];

    const now = new Date();
    const revalidationThreshold = new Date(
      Date.now() - this.REVALIDATION_DAYS * 24 * 60 * 60 * 1000,
    );

    for (const product of deduped) {
      const invalid = invalidMap.get(product.handle);
      if (invalid) {
        // Known invalid — check if due for re-validation
        if (invalid.lastValidatedAt < revalidationThreshold) {
          revalidateProducts.push(product);
        } else {
          result.skippedInvalid++;
        }
      } else {
        const existing = existingMap.get(product.handle);
        if (!existing) {
          newProducts.push(product);
        } else {
          // Always re-extract existing products
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

    // Bulk upsert invalid product handles
    if (invalidatedProducts.length > 0) {
      const invalidHandles = invalidatedProducts.map((p) =>
        this.invalidHandleRepository.create({
          storeId: store.id,
          handle: p.handle,
          lastValidatedAt: now,
        }),
      );

      await this.invalidHandleRepository.upsert(invalidHandles, {
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
          extractionStatus: 'pending',
        }),
      );

      await this.productUrlRepository.upsert(productUrls, {
        conflictPaths: ['storeId', 'handle'],
        skipUpdateIfNoValuesChanged: true,
      });

      // Remove re-validated handles from invalid table
      const revalidatedHandles = validatedProducts
        .filter((p) => revalidateHandles.has(p.handle))
        .map((p) => p.handle);
      if (revalidatedHandles.length > 0) {
        await this.invalidHandleRepository.delete({
          storeId: store.id,
          handle: In(revalidatedHandles),
        });
      }

      // Get IDs for newly inserted
      const insertedUrls = await this.productUrlRepository.find({
        where: {
          storeId: store.id,
          handle: In(validatedProducts.map((p) => p.handle)),
        },
        select: ['id', 'handle'],
      });

      const extractionJobs = insertedUrls.map((url) => ({
        productUrlId: url.id,
        storeId: store.id,
        handle: url.handle,
        priority: 1,
        discoveryRunId: options?.discoveryRunId,
      }));

      if (extractionJobs.length > 0 && !options?.skipExtraction) {
        for (let i = 0; i < extractionJobs.length; i++) {
          if (i % BACKPRESSURE_CHECK_INTERVAL === 0) {
            await this.queueService.waitForCapacity(
              QUEUE_NAMES.PRODUCT_EXTRACTION,
              Math.min(BACKPRESSURE_CHECK_INTERVAL, extractionJobs.length - i),
              store.name,
              EXTRACTION_BACKPRESSURE,
            );
          }
          const job = extractionJobs[i];
          await this.queueService.enqueueExtractionJob(
            job.productUrlId,
            job.storeId,
            job.handle,
            job.priority,
            job.discoveryRunId,
          );
        }
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
        where: {
          storeId: store.id,
          handle: In(staleProducts.map((p) => p.handle)),
        },
        select: ['id', 'handle'],
      });

      const extractionJobs = staleUrls.map((url) => ({
        productUrlId: url.id,
        storeId: store.id,
        handle: url.handle,
        priority: 1,
        discoveryRunId: options?.discoveryRunId,
      }));

      if (extractionJobs.length > 0 && !options?.skipExtraction) {
        for (let i = 0; i < extractionJobs.length; i++) {
          if (i % BACKPRESSURE_CHECK_INTERVAL === 0) {
            await this.queueService.waitForCapacity(
              QUEUE_NAMES.PRODUCT_EXTRACTION,
              Math.min(BACKPRESSURE_CHECK_INTERVAL, extractionJobs.length - i),
              store.name,
              EXTRACTION_BACKPRESSURE,
            );
          }
          const job = extractionJobs[i];
          await this.queueService.enqueueExtractionJob(
            job.productUrlId,
            job.storeId,
            job.handle,
            job.priority,
            job.discoveryRunId,
          );
        }
        result.extractionJobsQueued += extractionJobs.length;
      }
    }
  }
}
