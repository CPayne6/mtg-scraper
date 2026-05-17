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
import { StorefrontClient } from './storefront-client';
import {
  COLLECTION_PRODUCTS_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
  PRODUCTS_QUERY,
  PRODUCT_ID_ASC_QUERY,
  PRODUCT_ID_DESC_QUERY,
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

  /**
   * Fetch a single page of products using ID-based stepping.
   * Returns the extracted products and the last ID for the next page.
   * Returns empty products array when the catalog is exhausted.
   *
   * @param store         - Store to extract from
   * @param scope         - Query scope (e.g. 'product_type:"MTG Single"')
   * @param lastId        - Shopify product ID to start after (null for first page)
   * @param maxId         - Optional upper bound. When set, only products with
   *                        `id <= maxId` are returned (used for range-split jobs).
   * @param updatedSince  - Optional ISO-8601 timestamp. When set, only products
   *                        with `updated_at > updatedSince` are returned.
   */
  async fetchPage(
    store: Store,
    scope: string,
    lastId?: string | null,
    maxId?: string | null,
    updatedSince?: string | null,
  ): Promise<{
    products: Array<{
      shopifyProductId: string;
      handle: string;
      updatedAt: Date;
      variants: ExtractedCardVariant[];
    }>;
    nextLastId: string | null;
  }> {
    const parts = [scope];
    if (lastId) parts.push(`id:>${lastId}`);
    if (maxId) parts.push(`id:<=${maxId}`);
    if (updatedSince) parts.push(`updated_at:>'${updatedSince}'`);
    const query = parts.join(' ');

    const data = await this.storefrontClient.query<ProductsQueryData>(
      store,
      PRODUCTS_QUERY,
      { query, first: 250 },
    );

    const { edges } = data.products;
    if (edges.length === 0) {
      return { products: [], nextLastId: null };
    }

    const products = edges.map(({ node: product }) => ({
      shopifyProductId: product.id.split('/').pop()!,
      handle: product.handle,
      updatedAt: new Date(product.updatedAt),
      variants: this.extractVariantsFromProduct(store, product),
    }));

    const nextLastId = edges.length < 250
      ? null  // last page
      : edges[edges.length - 1].node.id.split('/').pop()!;

    return { products, nextLastId };
  }

  /**
   * Get the lowest and highest Shopify product IDs for the given scope.
   * Two cheap single-product queries (sorted by ID asc / desc).
   *
   * Returns `null` for both endpoints if the scope matches no products.
   */
  async fetchIdRange(
    store: Store,
    scope: string,
    updatedSince?: string | null,
  ): Promise<{ minId: string | null; maxId: string | null }> {
    const query = updatedSince
      ? `${scope} updated_at:>'${updatedSince}'`
      : scope;
    const [asc, desc] = await Promise.all([
      this.storefrontClient.query<{
        products: { edges: { node: { id: string } }[] };
      }>(store, PRODUCT_ID_ASC_QUERY, { query }),
      this.storefrontClient.query<{
        products: { edges: { node: { id: string } }[] };
      }>(store, PRODUCT_ID_DESC_QUERY, { query }),
    ]);

    const ascEdge = asc.products.edges[0]?.node.id;
    const descEdge = desc.products.edges[0]?.node.id;

    return {
      minId: ascEdge ? ascEdge.split('/').pop() ?? null : null,
      maxId: descEdge ? descEdge.split('/').pop() ?? null : null,
    };
  }

  /**
   * Paginate through all products matching a scope using ID-based stepping.
   *
   * Uses `products(query: "scope id:>lastId", sortKey: ID)` to step through
   * the entire catalog. Each request starts fresh from the last seen ID,
   * so there's no cursor accumulation and no 25K pagination limit.
   *
   * Products are yielded in ascending ID order with zero duplicates.
   *
   * @param store - Store to extract from
   * @param scope - Query scope (e.g. 'product_type:"MTG Single"')
   */
  async *extractByIdPagination(
    store: Store,
    scope: string,
  ): AsyncGenerator<{
    shopifyProductId: string;
    handle: string;
    updatedAt: Date;
    variants: ExtractedCardVariant[];
  }> {
    let lastId: string | undefined;
    let totalYielded = 0;
    let pageNumber = 0;

    while (true) {
      pageNumber++;
      const query = lastId ? `${scope} id:>${lastId}` : scope;

      const data = await this.storefrontClient.query<ProductsQueryData>(
        store,
        PRODUCTS_QUERY,
        { query, first: 250 },
      );

      const { edges } = data.products;
      if (edges.length === 0) break;

      for (const { node: product } of edges) {
        const variants = this.extractVariantsFromProduct(store, product);
        totalYielded++;

        yield {
          shopifyProductId: product.id.split('/').pop()!,
          handle: product.handle,
          updatedAt: new Date(product.updatedAt),
          variants,
        };
      }

      // Use the last product's numeric ID for the next page
      const lastProduct = edges[edges.length - 1].node;
      lastId = lastProduct.id.split('/').pop()!;

      if (edges.length < 250) break;

      if (pageNumber % 20 === 0) {
        this.logger.warn(
          `${store.name}: page ${pageNumber}, ${totalYielded} products extracted (lastId: ${lastId})`,
        );
      }
    }

    this.logger.warn(
      `${store.name}: finished ID-based extraction — ${totalYielded} products in ${pageNumber} pages`,
    );
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
