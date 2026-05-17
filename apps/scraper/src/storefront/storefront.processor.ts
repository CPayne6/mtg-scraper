import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  StorefrontPlanJobData,
  StorefrontPrefixJobData,
  StorefrontPrefixJobResult,
} from '@scoutlgs/shared';
import {
  Store,
  ProductUrl,
  MtgSinglesCollection,
  CardName,
  CacheService,
  PlatformAdapterFactory,
} from '@scoutlgs/core';
import type { StorefrontExtractionAdapter } from '@scoutlgs/core';
import { ExtractionService } from '../extraction/extraction.service';

const NON_ALPHA_PREFIX = '__nonalpha__';
const MAX_SPLIT_DEPTH = 3;

@Processor(QUEUE_NAMES.STOREFRONT_EXTRACTION)
export class StorefrontProcessor {
  private readonly logger = new Logger(StorefrontProcessor.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ProductUrl)
    private readonly productUrlRepository: Repository<ProductUrl>,
    @InjectRepository(MtgSinglesCollection)
    private readonly collectionRepository: Repository<MtgSinglesCollection>,
    @InjectRepository(CardName)
    private readonly cardNameRepository: Repository<CardName>,
    @InjectQueue(QUEUE_NAMES.STOREFRONT_EXTRACTION)
    private readonly storefrontQueue: Queue,
    private readonly cacheService: CacheService,
    private readonly platformAdapterFactory: PlatformAdapterFactory,
    private readonly extractionService: ExtractionService,
  ) {
    this.logger.log('StorefrontProcessor instantiated');
  }

  /**
   * Get the prefix list from card_names, backed by Redis cache (24h TTL).
   * Falls back to DB query if cache is empty, then stores the result.
   */
  private async getPrefixes(): Promise<{
    alpha: string[];
    hasNonAlpha: boolean;
  }> {
    // Try Redis cache first
    const cached = await this.cacheService.getStorefrontPrefixes();
    if (cached) return cached;

    // Compute from DB
    const rows: { prefix: string }[] = await this.cardNameRepository.query(
      `SELECT DISTINCT LOWER(LEFT(name, 1)) AS prefix
       FROM card_names
       WHERE name IS NOT NULL AND name != ''
       ORDER BY prefix`,
    );

    const alpha: string[] = [];
    let hasNonAlpha = false;
    for (const { prefix } of rows) {
      if (/^[a-z]$/.test(prefix)) {
        alpha.push(prefix);
      } else {
        hasNonAlpha = true;
      }
    }

    const result = { alpha, hasNonAlpha };

    // Store in Redis (24h TTL)
    await this.cacheService.setStorefrontPrefixes(result);
    this.logger.log(
      `Prefix cache built and stored in Redis: ${alpha.length} alpha prefixes, hasNonAlpha=${hasNonAlpha}`,
    );

    return result;
  }

  // ---------------------------------------------------------------------------
  // Phase 1: Plan — read cached prefixes, enqueue one job per prefix per store
  // ---------------------------------------------------------------------------

  @Process({ name: JOB_NAMES.STOREFRONT_PLAN, concurrency: 1 })
  async processPlan(job: Job<StorefrontPlanJobData>): Promise<void> {
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
      `Planning storefront extraction for ${store.name} (scope: "${scope}")`,
    );

    const { alpha: alphaPrefixes, hasNonAlpha } = await this.getPrefixes();

    // Enqueue one STOREFRONT_PREFIX job per alpha prefix
    const jobs: { name: string; data: StorefrontPrefixJobData }[] =
      alphaPrefixes.map((prefix) => ({
        name: JOB_NAMES.STOREFRONT_PREFIX,
        data: {
          storeId,
          prefix,
          scope,
          depth: 1,
          discoveryRunId,
          maxCardsAdded,
        },
      }));

    // Enqueue a single job for all non-alpha card names
    if (hasNonAlpha) {
      jobs.push({
        name: JOB_NAMES.STOREFRONT_PREFIX,
        data: {
          storeId,
          prefix: NON_ALPHA_PREFIX,
          scope,
          depth: 1,
          discoveryRunId,
          maxCardsAdded,
        },
      });
    }

    if (jobs.length > 0) {
      await this.storefrontQueue.addBulk(jobs);
    }

    this.logger.warn(
      `${store.name}: enqueued ${alphaPrefixes.length} alpha prefix jobs` +
        (hasNonAlpha ? ' + 1 non-alpha job' : ''),
    );
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Prefix — extract products matching a title prefix
  // ---------------------------------------------------------------------------

  @Process({ name: JOB_NAMES.STOREFRONT_PREFIX, concurrency: 5 })
  async processPrefix(
    job: Job<StorefrontPrefixJobData>,
  ): Promise<StorefrontPrefixJobResult> {
    const { storeId, prefix, scope, depth, discoveryRunId, maxCardsAdded } =
      job.data;

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    const adapter = this.platformAdapterFactory.getExtractionAdapter(
      store.platformType!,
    ) as StorefrontExtractionAdapter;

    const collection = await this.getCollection(store);
    const collectionId = collection?.id ?? 0;

    // Build the query string
    const query = await this.buildQuery(prefix, scope);

    this.logger.log(
      `${store.name}: extracting prefix "${prefix}" (depth ${depth})`,
    );

    let productsProcessed = 0;
    let cardsAdded = 0;
    let errors = 0;

    try {
      for await (const product of adapter.extractByProductsQuery(
        store,
        query,
      )) {
        try {
          const productUrl = await this.upsertProductUrl(
            store.id,
            product.handle,
            collectionId,
            product.updatedAt,
          );

          const extractResult =
            await this.extractionService.processExtractedVariants(
              productUrl.id,
              store.id,
              product.handle,
              product.variants,
              discoveryRunId,
            );

          if (extractResult.success) {
            productsProcessed++;
            cardsAdded += extractResult.cardsUpserted ?? 0;
          } else {
            errors++;
          }

          if (productsProcessed % 500 === 0) {
            this.logger.log(
              `${store.name} prefix "${prefix}": ${productsProcessed} products, ${cardsAdded} cards, ${errors} errors`,
            );
          }
        } catch (error) {
          errors++;
          this.logger.error(
            `Error processing ${product.handle} at ${store.name} (prefix "${prefix}"): ${error}`,
          );
        }
      }

      return {
        storeId,
        prefix,
        productsProcessed,
        cardsAdded,
        errors,
        wasSplit: false,
        success: true,
      };
    } catch (error) {
      // Check if this is the 25K pagination limit
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Platform limit') || msg.includes('pagination')) {
        return this.handlePaginationLimitSplit(
          store,
          prefix,
          scope,
          depth,
          discoveryRunId,
          maxCardsAdded,
          productsProcessed,
          cardsAdded,
          errors,
        );
      }

      // Unknown error — rethrow
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Handle 25K pagination limit by splitting into sub-prefix jobs
  // ---------------------------------------------------------------------------

  private async handlePaginationLimitSplit(
    store: Store,
    prefix: string,
    scope: string,
    depth: number,
    discoveryRunId: number | undefined,
    maxCardsAdded: number | undefined,
    productsProcessed: number,
    cardsAdded: number,
    errors: number,
  ): Promise<StorefrontPrefixJobResult> {
    if (depth >= MAX_SPLIT_DEPTH) {
      this.logger.warn(
        `${store.name}: prefix "${prefix}" hit 25K limit at max depth ${depth} — cannot split further`,
      );
      return {
        storeId: store.id,
        prefix,
        productsProcessed,
        cardsAdded,
        errors,
        wasSplit: false,
        success: true,
        error: `Hit 25K pagination limit at max depth ${depth}`,
      };
    }

    const nextDepth = depth + 1;

    // Query distinct sub-prefixes from card_names at the next depth level
    const subRows: { prefix: string }[] = await this.cardNameRepository.query(
      `SELECT DISTINCT LOWER(LEFT(name, $1)) AS prefix
       FROM card_names
       WHERE LOWER(name) LIKE $2 || '%'
       ORDER BY prefix`,
      [nextDepth, prefix],
    );

    const subPrefixes = subRows.map((r) => r.prefix).filter(Boolean);

    if (subPrefixes.length === 0) {
      this.logger.warn(
        `${store.name}: prefix "${prefix}" hit 25K limit but no sub-prefixes found`,
      );
      return {
        storeId: store.id,
        prefix,
        productsProcessed,
        cardsAdded,
        errors,
        wasSplit: false,
        success: true,
      };
    }

    const jobs = subPrefixes.map((subPrefix) => ({
      name: JOB_NAMES.STOREFRONT_PREFIX,
      data: {
        storeId: store.id,
        prefix: subPrefix,
        scope,
        depth: nextDepth,
        discoveryRunId,
        maxCardsAdded,
      } as StorefrontPrefixJobData,
    }));

    await this.storefrontQueue.addBulk(jobs);

    this.logger.warn(
      `${store.name}: prefix "${prefix}" hit 25K limit, splitting into ${subPrefixes.length} sub-prefixes at depth ${nextDepth}`,
    );

    return {
      storeId: store.id,
      prefix,
      productsProcessed,
      cardsAdded,
      errors,
      wasSplit: true,
      success: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Build the Storefront API query string for a prefix
  // ---------------------------------------------------------------------------

  private async buildQuery(prefix: string, scope: string): Promise<string> {
    if (prefix === NON_ALPHA_PREFIX) {
      // Fetch all card names starting with non-alpha characters
      const rows: { name: string }[] = await this.cardNameRepository.query(
        `SELECT name FROM card_names
         WHERE name IS NOT NULL AND name != ''
           AND LEFT(name, 1) !~ '[a-zA-Z]'
         ORDER BY name`,
      );

      if (rows.length === 0) {
        return scope;
      }

      // Build OR-joined exact title queries
      const titleClauses = rows
        .map((r) => `title:"${r.name}"`)
        .join(' OR ');
      return `${scope} ${titleClauses}`;
    }

    return `${scope} title:${prefix}*`;
  }

  // ---------------------------------------------------------------------------
  // Helpers (retained from previous processor)
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

  private async upsertProductUrl(
    storeId: number,
    handle: string,
    collectionId: number,
    updatedAt: Date,
  ): Promise<ProductUrl> {
    // Use ON CONFLICT upsert to avoid race conditions
    // when multiple prefix jobs process the same store in parallel
    await this.productUrlRepository
      .createQueryBuilder()
      .insert()
      .into(ProductUrl)
      .values({
        storeId,
        handle,
        mtgSinglesCollectionId: collectionId,
        sitemapLastmod: updatedAt,
        extractionStatus: 'pending',
      })
      .orUpdate(['sitemap_lastmod'], ['store_id', 'handle'])
      .execute();

    return this.productUrlRepository.findOneOrFail({
      where: { storeId, handle },
    });
  }
}
