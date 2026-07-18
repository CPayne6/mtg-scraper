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
} from './storefront.queries';
import type {
  StorefrontProduct,
  CollectionProductsData,
  ProductsQueryData,
  ProductByHandleData,
} from './storefront.types';

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
      updatedAt: Date;
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
      updatedAt: new Date(product.updatedAt),
      variants: this.extractVariantsFromProduct(store, product),
    })) };
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
      updatedAt: Date;
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
      updatedAt: new Date(product.updatedAt),
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
    const extractor = this.extractorRegistry.get(store.scraperType);

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
}
