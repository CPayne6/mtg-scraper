import { Injectable, Logger } from '@nestjs/common';
import type { Dispatcher } from 'undici';
import type { Store } from '../../../database/store.entity';
import type {
  IExtractionAdapter,
  ExtractedCardVariant,
} from '../../platform.interfaces';
import { CardDetailExtractorRegistry } from '../shopify/card-detail-extractor.registry';
import { ExtractionHttpError } from '../shopify/extraction-http-error';
import { parseConditionAndFoil } from '../shopify/shopify-variant.utils';
import { StorefrontPaginationLimitError } from './pagination-limit-error';
import { StorefrontClient } from './storefront-client';
import {
  COLLECTION_PRODUCTS_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
  PRODUCT_BUCKET_PROBE_QUERY,
  PRODUCT_CREATED_AT_ASC_QUERY,
  PRODUCT_CREATED_AT_DESC_QUERY,
  PRODUCTS_BY_CREATED_AT_QUERY,
  PRODUCTS_BY_QUERY,
  PRODUCTS_BY_IDS_QUERY,
} from './storefront.queries';
import type {
  StorefrontProduct,
  CollectionProductsData,
  ProductsQueryData,
  ProductByHandleData,
  ProductsByIdsData,
} from './storefront.types';
import { normalizeStorefrontProfileInputs } from '@scoutlgs/shared';
import type { ProfileEvaluationInput } from '@scoutlgs/shared';
import { ProfiledStorefrontCardParser } from './profiled-storefront-card-parser';
import type { ProfileParseFailureCode, ProfileParseResult } from './profiled-storefront-card-parser';

export type StorefrontParserDryRunReport = { sampledProducts: number; sampledVariants: number; validVariants: number; rejectedVariants: number; coverage: number; failuresByCode: Record<ProfileParseFailureCode, number>; variants: Array<{ productId: string; variantId: string; result: ProfileParseResult }> };

@Injectable()
export class StorefrontExtractionAdapter implements IExtractionAdapter {
  private readonly logger = new Logger(StorefrontExtractionAdapter.name);

  constructor(
    private readonly storefrontClient: StorefrontClient,
    private readonly extractorRegistry: CardDetailExtractorRegistry,
  ) {}

  /**
   * Extract product data from a single product by handle via Storefront API.
   * Implements IExtractionAdapter.
   */
  async extractProduct(
    store: Store,
    handle: string,
    dispatcher?: Dispatcher,
  ): Promise<ExtractedCardVariant[]> {
    const data = await this.storefrontClient.query<ProductByHandleData>(
      store,
      PRODUCT_BY_HANDLE_QUERY,
      { handle },
      dispatcher,
    );

    if (!data.product) {
      throw new ExtractionHttpError(
        `Product not found: ${handle} at ${store.name}`,
        404,
        `${store.baseUrl}/products/${handle}`,
      );
    }

    const variants = this.extractVariantsFromProduct(store, data.product);

    if (store.scraperConfig?.parser?.kind === 'mapping' && data.product.variants.edges.length > 0 && variants.length === 0) {
      throw new ExtractionHttpError(`Mapping profile rejected every variant for ${handle} at ${store.name}`, 422, `${store.baseUrl}/products/${handle}`);
    }

    this.logger.debug(
      `Extracted ${variants.length} variants from ${handle} at ${store.name}`,
    );

    return variants;
  }

  /**
   * Iterate over all products in a collection via Storefront API pagination.
   * Yields one product at a time with its extracted variants.
   */
  async *extractCollection(
    store: Store,
    collectionSlug: string,
  ): AsyncGenerator<{
    handle: string;
    updatedAt: Date;
    variants: ExtractedCardVariant[];
  }> {
    let cursor: string | undefined;
    let pageNumber = 0;
    let totalYielded = 0;

    while (true) {
      pageNumber++;

      const data = await this.storefrontClient.query<CollectionProductsData>(
        store,
        COLLECTION_PRODUCTS_QUERY,
        { handle: collectionSlug, first: 100, after: cursor ?? null },
      );

      if (!data.collection) {
        this.logger.error(
          `Collection "${collectionSlug}" not found at ${store.name}`,
        );
        return;
      }

      const { edges, pageInfo } = data.collection.products;

      for (const { node: product } of edges) {
        const variants = this.extractVariantsFromProduct(store, product);
        totalYielded++;

        yield {
          handle: product.handle,
          updatedAt: new Date(product.updatedAt),
          variants,
        };
      }

      if (pageNumber % 10 === 0) {
        this.logger.log(
          `${store.name} collection "${collectionSlug}": processed ${totalYielded} products (page ${pageNumber})`,
        );
      }

      if (!pageInfo.hasNextPage) {
        break;
      }

      cursor = pageInfo.endCursor;
    }

    this.logger.log(
      `${store.name} collection "${collectionSlug}": finished — ${totalYielded} products total`,
    );
  }

  /** Fetch products that match an exact Storefront search query. */
  async fetchProductsByQuery(
    store: Store,
    query: string,
  ): Promise<{
    products: Array<{
      shopifyProductId: string;
      handle: string;
      rawProductTitle: string;
      updatedAt: Date;
      isArtSeries: boolean;
      variants: ExtractedCardVariant[];
    }>;
  }> {
    const data = await this.storefrontClient.query<ProductsQueryData>(
      store,
      PRODUCTS_BY_QUERY,
      { query, first: 250 },
    );

    const { edges } = data.products;
    return { products: edges.map(({ node: product }) => ({
      shopifyProductId: product.id.split('/').pop()!,
      handle: product.handle,
      rawProductTitle: product.title,
      updatedAt: new Date(product.updatedAt),
      isArtSeries: this.isArtSeriesProduct(store, product),
      variants: this.extractVariantsFromProduct(store, product),
    })) };
  }

  /**
   * Fetch known products directly, rather than relying on an undocumented
   * `id:` product-search filter. Numeric database IDs are normalized to the
   * Storefront global-ID form required by `nodes`.
   */
  async fetchProductsByIds(
    store: Store,
    productIds: string[],
  ): Promise<{
    products: Array<{
      shopifyProductId: string;
      handle: string;
      rawProductTitle: string;
      updatedAt: Date;
      isArtSeries: boolean;
      variants: ExtractedCardVariant[];
    }>;
  }> {
    const ids = [...new Set(productIds)]
      .slice(0, 250)
      .map((id) => id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`);
    if (!ids.length) return { products: [] };
    const data = await this.storefrontClient.query<ProductsByIdsData>(
      store,
      PRODUCTS_BY_IDS_QUERY,
      { ids },
    );
    const products = data.nodes
      .filter((product): product is StorefrontProduct => Boolean(product?.id && product.handle && product.variants))
      .map((product) => ({
        shopifyProductId: product.id.split('/').pop()!,
        handle: product.handle,
        rawProductTitle: product.title,
        updatedAt: new Date(product.updatedAt),
        isArtSeries: this.isArtSeriesProduct(store, product),
        variants: this.extractVariantsFromProduct(store, product),
      }));
    return { products };
  }

  /**
   * Cursor-paginate one page within a created_at date bucket.
   *
   * Replaces the leaky `id:>X` filter strategy that silently dropped products
   * (`id` isn't a documented Storefront filter — Shopify partially ignores it).
   * Here the bucketing is by `created_at` (officially supported with range
   * operators) and pagination is by opaque cursor (officially exhaustive
   * within the snapshot).
   *
   * Throws `StorefrontPaginationLimitError` when the bucket exceeds Shopify's
   * 25K depth cap — the processor catches that and splits the date range.
   *
   * @param store         - Store to extract from
   * @param scope         - Per-store scope query (e.g. 'product_type:"MTG Single"')
   * @param createdAtStart - Inclusive ISO-8601 lower bound on created_at
   * @param createdAtEnd  - Exclusive ISO-8601 upper bound on created_at
   * @param cursor        - Opaque pageInfo.endCursor from the previous page
   *                        (null for the first page of the bucket)
   */
  async fetchPageByCursor(
    store: Store,
    scope: string,
    createdAtStart: string,
    createdAtEnd: string,
    cursor: string | null,
  ): Promise<{
    products: Array<{
      shopifyProductId: string;
      handle: string;
      rawProductTitle: string;
      updatedAt: Date;
      isArtSeries: boolean;
      variants: ExtractedCardVariant[];
    }>;
    nextCursor: string | null;
  }> {
    const query =
      `${scope} created_at:>='${createdAtStart}' created_at:<'${createdAtEnd}'`;

    let data: ProductsQueryData;
    try {
      data = await this.storefrontClient.query<ProductsQueryData>(
        store,
        PRODUCTS_BY_CREATED_AT_QUERY,
        { query, first: 250, after: cursor },
      );
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (StorefrontPaginationLimitError.isPaginationLimitMessage(message)) {
        throw new StorefrontPaginationLimitError(message, store.name);
      }
      throw err;
    }

    const { edges, pageInfo } = data.products;

    const products = edges.map(({ node: product }) => ({
      shopifyProductId: product.id.split('/').pop()!,
      handle: product.handle,
      rawProductTitle: product.title,
      updatedAt: new Date(product.updatedAt),
      isArtSeries: this.isArtSeriesProduct(store, product),
      variants: this.extractVariantsFromProduct(store, product),
    }));

    const nextCursor = pageInfo.hasNextPage ? pageInfo.endCursor ?? null : null;

    return { products, nextCursor };
  }

  /**
   * Returns the oldest and newest `created_at` timestamps for the scope.
   * Used by the per-store plan job to decide which year/month buckets to
   * enqueue. Cheap — two single-product queries.
   *
   * Returns `null` for both endpoints when the scope matches no products.
   */
  async findCreatedAtRange(
    store: Store,
    scope: string,
  ): Promise<{ minCreatedAt: string | null; maxCreatedAt: string | null }> {
    const [asc, desc] = await Promise.all([
      this.storefrontClient.query<{
        products: { edges: { node: { createdAt: string } }[] };
      }>(store, PRODUCT_CREATED_AT_ASC_QUERY, { query: scope }),
      this.storefrontClient.query<{
        products: { edges: { node: { createdAt: string } }[] };
      }>(store, PRODUCT_CREATED_AT_DESC_QUERY, { query: scope }),
    ]);

    return {
      minCreatedAt: asc.products.edges[0]?.node.createdAt ?? null,
      maxCreatedAt: desc.products.edges[0]?.node.createdAt ?? null,
    };
  }

  /**
   * Cheap "does this date bucket have any products?" probe. Bucket processor
   * uses this to skip empty windows (common for stores migrated to Shopify
   * in a particular date range — pre-migration buckets are entirely empty).
   */
  async probeBucketHasProducts(
    store: Store,
    scope: string,
    createdAtStart: string,
    createdAtEnd: string,
  ): Promise<boolean> {
    const query =
      `${scope} created_at:>='${createdAtStart}' created_at:<'${createdAtEnd}'`;
    const data = await this.storefrontClient.query<{
      products: { edges: { node: { id: string } }[] };
    }>(store, PRODUCT_BUCKET_PROBE_QUERY, { query });
    return data.products.edges.length > 0;
  }

  /**
   * Shared extraction logic: parse a StorefrontProduct into ExtractedCardVariant[].
   * Mirrors the approach in ShopifyExtractionAdapter but adapted for Storefront API shapes.
   */
  private extractVariantsFromProduct(
    store: Store,
    product: StorefrontProduct,
  ): ExtractedCardVariant[] {
    const profile = store.scraperConfig?.parser;
    if (profile?.kind === 'mapping') {
      const compiled = ProfiledStorefrontCardParser.compile(store.uuid, profile);
      return this.toProfileInputs(product).flatMap(input => {
        const parsed = ProfiledStorefrontCardParser.parse(compiled, input, store.baseUrl);
        if (!parsed.ok) {
          this.logger.warn(`Rejected Storefront mapping variant store=${store.name} product=${product.id.split('/').pop()} variant=${input.variant.id.split('/').pop()} failures=${parsed.failures.map(failure => failure.code).join(',')}`);
          return [];
        }
        return [parsed.variant];
      });
    }
    const extractor = this.extractorRegistry.get(this.parserType(store));

    // Parse product-level info
    const titleInfo = extractor.parseTitle(product.title);
    const tagsInfo = extractor.parseTags(product.tags);
    const firstImageUrl = product.images.edges[0]?.node.url;
    const imageInfo = extractor.parseImageFilename(firstImageUrl);
    const metaInfo =
      extractor.parseProductMeta?.(product.vendor, product.descriptionHtml) ??
      {};

    // Merge card name: structured meta > title parsing
    const cardName = metaInfo.cardName || titleInfo.cardName;
    // Merge set name: structured meta > title > tags
    const setName =
      metaInfo.setName || titleInfo.setName || tagsInfo.setName || '';

    const productUrl =
      product.onlineStoreUrl || `${store.baseUrl}/products/${product.handle}`;

    const variants: ExtractedCardVariant[] = [];

    for (const { node: variant } of product.variants.edges) {
      // Map selectedOptions positionally to option1/option2/option3
      const option1 = variant.selectedOptions[0]?.value;
      const option2 = variant.selectedOptions[1]?.value;
      const option3 = variant.selectedOptions[2]?.value;

      const { condition, foil } = parseConditionAndFoil({
        option1,
        option2,
        title: variant.title,
      });

      const skuInfo = extractor.parseSkuInfo(variant.sku ?? undefined);

      // Merge set code: SKU > title > image filename
      const setCode =
        skuInfo.setCode || titleInfo.setCode || imageInfo.setCode || undefined;
      // Merge collector number: SKU > title bracket > image filename
      const collectorNumber =
        skuInfo.collectorNumber ||
        titleInfo.collectorNumber ||
        imageInfo.collectorNumber ||
        undefined;
      // Merge foil: SKU > title > variant parsing
      const resolvedFoil =
        skuInfo.foil !== undefined
          ? skuInfo.foil
          : titleInfo.foil !== undefined
            ? titleInfo.foil || foil
            : foil;

      variants.push({
        cardName,
        setName,
        condition,
        foil: resolvedFoil,
        price: parseFloat(variant.price.amount),
        currency: variant.price.currencyCode,
        inStock: variant.availableForSale,
        imageUrl: firstImageUrl,
        productUrl,
        sku: variant.sku ?? undefined,
        platformVariantId: variant.id.split('/').pop(),
        setCode,
        collectorNumber,
        isToken: skuInfo.isToken,
      });
    }

    return variants;
  }

  /**
   * Art Series products share a playable card's name, so they must be
   * identified before their title can enter the printing-matching pipeline.
   * 401 Games identifies these both in the title and with MTGA SKUs.
   */
  private isArtSeriesProduct(
    store: Store,
    product: StorefrontProduct,
  ): boolean {
    const profile = store.scraperConfig?.parser;
    if (profile?.kind === 'mapping') {
      const compiled = ProfiledStorefrontCardParser.compile(store.uuid, profile);
      return ProfiledStorefrontCardParser.isArtSeries(compiled, this.toProfileInputs(product));
    }
    const extractor = this.extractorRegistry.get(this.parserType(store));
    if (extractor.parseTitle(product.title).isArtSeries) {
      return true;
    }

    const variants = product.variants.edges;
    return variants.length > 0 && variants.every(({ node: variant }) =>
      extractor.parseSkuInfo(variant.sku ?? undefined).isArtSeries,
    );
  }

  private parserType(store: Store): string {
    const profile = store.scraperConfig?.parser;
    return profile?.kind === 'builtin' ? profile.parserType : store.scraperType;
  }

  /** Converts Storefront edges to the profile contract. Tools can create this same shape from nodes. */
  private toProfileInputs(product: StorefrontProduct): ProfileEvaluationInput[] {
    return normalizeStorefrontProfileInputs(product);
  }

  /** Read-only production parser boundary for onboarding and profile diagnostics. */
  dryRunParser(store: Store, products: StorefrontProduct[]): StorefrontParserDryRunReport {
    const failuresByCode: Record<ProfileParseFailureCode, number> = { 'missing-card-name': 0, 'missing-set-identity': 0, 'unknown-condition': 0, 'unknown-finish': 0, 'invalid-price': 0, 'missing-currency': 0, 'missing-variant-id': 0 };
    const variants: StorefrontParserDryRunReport['variants'] = [];
    const profile = store.scraperConfig?.parser;
    if (profile?.kind !== 'mapping') throw new Error('Store does not have a mapping parser profile');
    const compiled = ProfiledStorefrontCardParser.compile(store.uuid, profile);
    for (const product of products) for (const input of this.toProfileInputs(product)) {
      const result = ProfiledStorefrontCardParser.parse(compiled, input, store.baseUrl);
      if (!result.ok) for (const failure of result.failures) failuresByCode[failure.code]++;
      variants.push({ productId: product.id.split('/').pop() ?? product.id, variantId: input.variant.id.split('/').pop() ?? input.variant.id, result });
    }
    const sampledVariants = variants.length, validVariants = variants.filter(variant => variant.result.ok).length;
    return { sampledProducts: products.length, sampledVariants, validVariants, rejectedVariants: sampledVariants - validVariants, coverage: sampledVariants ? validVariants / sampledVariants : 1, failuresByCode, variants };
  }
}
