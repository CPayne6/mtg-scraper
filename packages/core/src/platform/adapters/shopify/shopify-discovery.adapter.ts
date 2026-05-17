import { Injectable, Logger } from '@nestjs/common';
import { fetch, ProxyAgent } from 'undici';
import type { Store } from '../../../database/store.entity';
import type { MtgSinglesCollection } from '../../../database/mtg-singles-collection.entity';
import type {
  IDiscoveryAdapter,
  DiscoveredProduct,
  SitemapEntry,
  GetProxyAgentFn,
} from '../../platform.interfaces';

/**
 * Shopify-specific discovery adapter
 * Crawls Shopify sitemaps and validates products via HEAD requests
 */
@Injectable()
export class ShopifyDiscoveryAdapter implements IDiscoveryAdapter {
  private readonly logger = new Logger(ShopifyDiscoveryAdapter.name);
  private getProxyAgent?: GetProxyAgentFn;

  /**
   * Set the proxy agent factory function
   */
  setProxyAgentFactory(factory: GetProxyAgentFn): void {
    this.getProxyAgent = factory;
  }

  /**
   * Discover all products from a Shopify store's sitemap
   */
  async *discoverProducts(
    store: Store,
    collection: MtgSinglesCollection,
  ): AsyncIterable<DiscoveredProduct> {
    this.logger.log(`Starting discovery for store: ${store.name}`);

    // 1. Fetch sitemap index
    const sitemapUrls = await this.fetchSitemapIndex(store.baseUrl);
    this.logger.log(`Found ${sitemapUrls.length} product sitemaps`);

    // 2. Process each product sitemap
    for (const sitemapUrl of sitemapUrls) {
      this.logger.debug(`Processing sitemap: ${sitemapUrl}`);

      try {
        const entries = await this.parseSitemap(sitemapUrl);
        this.logger.debug(`Found ${entries.length} entries in sitemap`);

        for (const entry of entries) {
          const handle = this.extractHandle(entry.loc);
          if (!handle) continue;

          yield {
            handle,
            lastModified: entry.lastmod ? new Date(entry.lastmod) : undefined,
            imageUrl: entry.image?.loc,
            imageTitle: entry.image?.title,
          };
        }
      } catch (error) {
        this.logger.error(`Error processing sitemap ${sitemapUrl}: ${error}`);
        // Continue with next sitemap
      }
    }
  }

  /**
   * Validate if a product belongs to the MTG singles collection via HEAD request
   */
  async validateProduct(
    store: Store,
    collection: MtgSinglesCollection,
    handle: string,
  ): Promise<boolean> {
    const collectionUrl = `${store.baseUrl}/collections/${collection.slug}/products/${handle}`;

    try {
      const proxyAgent = this.getProxyAgent
        ? await this.getProxyAgent()
        : undefined;

      const response = await fetch(collectionUrl, {
        method: 'HEAD',
        redirect: 'manual', // Don't follow redirects - detect 301/302 as "not in collection"
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)',
        },
      });

      // 200 = product IS in collection
      // 301/302 = product exists but NOT in collection (F2F redirects to /products/{handle})
      // 404 = product doesn't exist or not in collection
      return response.status === 200;
    } catch (error) {
      this.logger.warn(
        `Validation failed for ${handle} at ${store.name}: ${error}`,
      );
      return false;
    }
  }

  /**
   * Fetch and parse the sitemap index to get product sitemap URLs
   */
  private async fetchSitemapIndex(baseUrl: string): Promise<string[]> {
    const sitemapUrl = `${baseUrl}/sitemap.xml`;

    try {
      const proxyAgent = this.getProxyAgent
        ? await this.getProxyAgent()
        : undefined;

      const response = await fetch(sitemapUrl, {
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(30000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sitemap: ${response.status}`);
      }

      const xml = await response.text();

      // Extract sitemap URLs that contain 'sitemap_products'
      const sitemapMatches = xml.matchAll(
        /<loc>([^<]*sitemap_products[^<]*)<\/loc>/g,
      );
      const sitemapUrls: string[] = [];

      for (const match of sitemapMatches) {
        sitemapUrls.push(match[1]);
      }

      // Filter out language-prefixed sitemaps (e.g. /en-eu/, /fr/, /fr-intl/)
      // to avoid duplicate products — only keep root-level sitemaps
      const filtered = sitemapUrls.filter((url) => {
        const pathname = new URL(url).pathname;
        return pathname.startsWith('/sitemap_products');
      });

      if (filtered.length < sitemapUrls.length) {
        this.logger.log(
          `Filtered ${sitemapUrls.length - filtered.length} language-prefixed sitemaps (kept ${filtered.length})`,
        );
      }

      return filtered;
    } catch (error) {
      this.logger.error(`Error fetching sitemap index: ${error}`);
      throw error;
    }
  }

  /**
   * Parse a product sitemap XML to extract entries
   */
  private async parseSitemap(sitemapUrl: string): Promise<SitemapEntry[]> {
    try {
      const proxyAgent = this.getProxyAgent
        ? await this.getProxyAgent()
        : undefined;

      const response = await fetch(sitemapUrl, {
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(60000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sitemap: ${response.status}`);
      }

      const xml = await response.text();
      const entries: SitemapEntry[] = [];

      // Parse <url> entries
      const urlMatches = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);

      for (const urlMatch of urlMatches) {
        const urlContent = urlMatch[1];

        // Extract loc
        const locMatch = urlContent.match(/<loc>([^<]+)<\/loc>/);
        if (!locMatch) continue;

        const loc = locMatch[1];

        // Skip non-product URLs
        if (!loc.includes('/products/')) continue;

        const entry: SitemapEntry = { loc };

        // Extract lastmod
        const lastmodMatch = urlContent.match(/<lastmod>([^<]+)<\/lastmod>/);
        if (lastmodMatch) {
          entry.lastmod = lastmodMatch[1];
        }

        // Extract image info
        const imageLocMatch = urlContent.match(
          /<image:loc>([^<]+)<\/image:loc>/,
        );
        const imageTitleMatch = urlContent.match(
          /<image:title>([^<]*)<\/image:title>/,
        );

        if (imageLocMatch || imageTitleMatch) {
          entry.image = {
            loc: imageLocMatch?.[1],
            title: imageTitleMatch?.[1],
          };
        }

        entries.push(entry);
      }

      return entries;
    } catch (error) {
      this.logger.error(`Error parsing sitemap ${sitemapUrl}: ${error}`);
      throw error;
    }
  }

  /**
   * Extract product handle from a Shopify product URL
   */
  private extractHandle(productUrl: string): string {
    // https://store.com/products/lightning-bolt-magic-2010 → "lightning-bolt-magic-2010"
    const match = productUrl.match(/\/products\/([^/?#]+)/);
    return match ? match[1] : '';
  }
}
