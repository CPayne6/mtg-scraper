import { Inject, Injectable, Logger } from '@nestjs/common';
import { fetch, ProxyAgent } from 'undici';
import { Condition } from '@scoutlgs/shared';
import type { Store } from '../../../database/store.entity';
import type {
  IExtractionAdapter,
  ExtractedCardVariant,
} from '../../platform.interfaces';
import type { ICardDetailExtractor } from './card-detail-extractor.interface';
import { DefaultCardDetailExtractor } from './extractors/default-card-detail.extractor';
import { ProxyService } from '../../../proxy/proxy.service';
import { CacheService } from '../../../cache/cache.service';
import { RateLimiterService } from '../../../rate-limiter/rate-limiter.service';
import { parseConditionAndFoil as parseConditionAndFoilUtil } from './shopify-variant.utils';

/**
 * Error thrown during extraction with HTTP context
 */
export class ExtractionHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly url: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ExtractionHttpError';
  }
}

/**
 * Shopify product response structure (storefront .js endpoint)
 *
 * Uses the .js endpoint instead of .json because:
 * - .js includes `available` boolean on every variant for ALL stores
 * - .json omits `available` for F2F and Binderpos stores
 * - .js still has `inventory_quantity` for stores that expose it (e.g., 401)
 *
 * Key differences from .json:
 * - No `{ product: ... }` wrapper — response is the product directly
 * - `description` instead of `body_html` (same content)
 * - `price` is in cents (integer) instead of dollars (string)
 * - `tags` is always an array (not comma-separated string)
 */
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  type?: string;
  tags?: string[];
  description?: string;
  variants: ShopifyVariant[];
  images: string[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  /** Price in cents (e.g., 200 = $2.00) */
  price: number;
  sku?: string;
  available: boolean;
  inventory_quantity?: number;
  inventory_management?: string;
  option1?: string;
  option2?: string;
  option3?: string;
}

/**
 * Shopify-specific extraction adapter
 * Fetches product JSON and normalizes to ExtractedCardVariant format.
 * Delegates store-specific card detail parsing to injected ICardDetailExtractor instances.
 */
@Injectable()
export class ShopifyExtractionAdapter implements IExtractionAdapter {
  private readonly logger = new Logger(ShopifyExtractionAdapter.name);
  private readonly extractorMap: Record<string, ICardDetailExtractor>;

  constructor(
    @Inject('CARD_DETAIL_EXTRACTORS')
    extractors: Record<string, ICardDetailExtractor>,
    private readonly defaultExtractor: DefaultCardDetailExtractor,
    private readonly proxyService: ProxyService,
    private readonly cacheService: CacheService,
    private readonly rateLimiter: RateLimiterService,
  ) {
    this.extractorMap = extractors;
  }

  /**
   * Extract product data from Shopify JSON endpoint
   */
  async extractProduct(
    store: Store,
    handle: string,
  ): Promise<ExtractedCardVariant[]> {
    const productUrl = `${store.baseUrl}/products/${handle}.js`;

    try {
      // Acquire rate limit permit with IP rotation (per-store proxy counter)
      const ipCount = this.proxyService.getIpCount();
      const { proxyNumber } = await this.rateLimiter.acquireWithRotation(
        store.name,
        store.rateLimitPerSecond,
        () => this.cacheService.getNextProxyNumber(store.name, ipCount),
      );
      const proxyAgent = this.proxyService.getProxyAgentForNumber(proxyNumber);

      const response = await fetch(productUrl, {
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

        throw new ExtractionHttpError(
          `HTTP ${response.status} ${response.statusText}`,
          response.status,
          productUrl,
          retryAfterSeconds,
        );
      }

      const product = (await response.json()) as ShopifyProduct;

      // Select the right extractor for this store's scraper type
      const extractor = this.extractorMap[store.scraperType] ?? this.defaultExtractor;

      // Parse product-level info
      const titleInfo = extractor.parseTitle(product.title);
      const tagsInfo = extractor.parseTags(product.tags);
      // .js endpoint returns images as string array (URLs directly)
      const firstImageUrl = product.images[0];
      const imageInfo = extractor.parseImageFilename(firstImageUrl);
      const metaInfo = extractor.parseProductMeta?.(product.vendor, product.description) ?? {};

      // Merge card name: structured HTML (body_html) > title parsing
      const cardName = metaInfo.cardName || titleInfo.cardName;
      // Merge product-level set name: structured meta (vendor) > title > tags
      const setName = metaInfo.setName || titleInfo.setName || tagsInfo.setName || '';

      // Extract variants
      const variants: ExtractedCardVariant[] = [];

      for (const variant of product.variants) {
        const { condition, foil } = this.parseConditionAndFoil(variant);
        const skuInfo = extractor.parseSkuInfo(variant.sku);

        // Merge set code: SKU > image filename > title-derived
        const setCode = skuInfo.setCode || imageInfo.setCode || undefined;
        // Merge collector number: SKU > title bracket > image filename
        const collectorNumber =
          skuInfo.collectorNumber || titleInfo.collectorNumber || imageInfo.collectorNumber || undefined;
        // Merge foil: SKU is most reliable when present, else variant parsing
        const resolvedFoil = skuInfo.foil !== undefined ? skuInfo.foil : foil;

        variants.push({
          cardName,
          setName,
          condition,
          foil: resolvedFoil,
          price: variant.price / 100,
          currency: 'CAD',
          inStock: variant.available,
          quantity: variant.inventory_quantity,
          imageUrl: firstImageUrl,
          productUrl: `${store.baseUrl}/products/${handle}`,
          sku: variant.sku,
          platformVariantId: String(variant.id),
          setCode,
          collectorNumber,
          isToken: skuInfo.isToken,
        });
      }

      this.logger.debug(
        `Extracted ${variants.length} variants from ${handle} at ${store.name}`,
      );

      return variants;
    } catch (error) {
      // Log the underlying cause for fetch errors (ECONNRESET, ETIMEDOUT, etc.)
      const cause = error instanceof Error && 'cause' in error ? (error as any).cause : undefined;
      const causeMsg = cause ? ` [cause: ${cause.code ?? cause.message ?? cause}]` : '';
      this.logger.error(
        `Error extracting product ${handle} from ${store.name}: ${error}${causeMsg}`,
      );
      throw error;
    }
  }

  /**
   * Parse condition and foil status from variant.
   * Delegates to the standalone utility for reuse across adapters.
   */
  parseConditionAndFoil(variant: ShopifyVariant): {
    condition: Condition;
    foil: boolean;
  } {
    return parseConditionAndFoilUtil(variant);
  }
}
