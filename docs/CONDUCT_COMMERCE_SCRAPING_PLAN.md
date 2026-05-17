# ConductCommerce Scraping Plan (V2 Architecture)

## Overview

This document outlines the V2 discovery/extraction architecture for scraping MTG singles from ConductCommerce-powered stores, following the same adapter pattern as Shopify.

**Example Store**: https://backtobackgames.conductcommerce.com

---

## Discovery Mechanism

### Sitemap Status

The robots.txt file references a sitemap:
```
Sitemap: https://backtobackgames.conductcommerce.com/sitemaps/sitemap_index.xml
```

However, **all sitemap URLs redirect to the homepage HTML** - the sitemap is non-functional:
- `/sitemap.xml` → HTML
- `/sitemap_index.xml` → HTML
- `/sitemaps/sitemap_index.xml` → HTML
- `/sitemaps/sitemap.xml` → HTML

### API-Based Discovery (Required)

Since sitemaps are unavailable, ConductCommerce requires API-based discovery:

### Step 1: Get All Categories (Sets)

**Endpoint**: `POST https://api.conductcommerce.com/v1/getStoreSettings`

```json
{
  "host": "backtobackgames.conductcommerce.com",
  "getBuyCart": false
}
```

**Response Structure**:
```typescript
{
  success: true,
  result: {
    categories: {
      "0": {  // Index 0 = Magic Singles (productTypeID: 1)
        id: 1,
        name: "Magic Singles",
        categories: [  // Nested category tree
          {
            name: "Modern Sets",
            categories: [
              { name: "Dominaria", categories: [] },
              { name: "Innistrad", categories: [] },
              // ... 236 total Magic sets
            ]
          }
        ]
      },
      "1": { id: 2, name: "Pokemon Singles", ... }
    }
  }
}
```

### Step 2: Get All Products Per Category

**Endpoint**: `POST https://api.conductcommerce.com/v1/getProductListings`

```json
{
  "host": "backtobackgames.conductcommerce.com",
  "category": "Dominaria",
  "productTypeID": 1
}
```

**Response** (704 products for Dominaria):
```typescript
{
  success: true,
  result: {
    listings: [
      {
        inventoryID: 53448,
        inventoryName: "Academy Drake",
        categoryName: "Dominaria",
        image: "magic_singles/dom/uuid.jpg",
        variants: [
          { name: "NM/Mint", price: 0.25, quantity: 10 },
          { name: "Lightly Played", price: 0.20, quantity: 5 }
        ],
        filterFields: { Rarity: "Common", Finish: "Regular" }
      }
    ]
  }
}
```

---

## V2 Adapter Implementation

### File Structure

```
packages/core/src/platform/adapters/conduct-commerce/
├── conduct-commerce-discovery.adapter.ts
├── conduct-commerce-extraction.adapter.ts
└── index.ts
```

### ConductCommerceDiscoveryAdapter

```typescript
// packages/core/src/platform/adapters/conduct-commerce/conduct-commerce-discovery.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { fetch, ProxyAgent } from 'undici';
import type { Store } from '../../../database/store.entity';
import type { MtgSinglesCollection } from '../../../database/mtg-singles-collection.entity';
import type {
  IDiscoveryAdapter,
  DiscoveredProduct,
  GetProxyAgentFn,
} from '../../platform.interfaces';

const CONDUCT_COMMERCE_API = 'https://api.conductcommerce.com/v1';

interface ConductCommerceCategory {
  id?: number;
  name: string;
  categories?: ConductCommerceCategory[];
}

@Injectable()
export class ConductCommerceDiscoveryAdapter implements IDiscoveryAdapter {
  private readonly logger = new Logger(ConductCommerceDiscoveryAdapter.name);
  private getProxyAgent?: GetProxyAgentFn;

  setProxyAgentFactory(factory: GetProxyAgentFn): void {
    this.getProxyAgent = factory;
  }

  /**
   * Discover all products from a ConductCommerce store
   * Uses category-based enumeration (no sitemap available)
   */
  async *discoverProducts(
    store: Store,
    collection: MtgSinglesCollection,
  ): AsyncIterable<DiscoveredProduct> {
    const host = new URL(store.baseUrl).host;
    this.logger.log(`Starting discovery for store: ${store.name} (${host})`);

    // 1. Get all category names from store settings
    const categoryNames = await this.fetchCategoryNames(host);
    this.logger.log(`Found ${categoryNames.length} categories to discover`);

    // 2. Enumerate products in each category
    for (const categoryName of categoryNames) {
      try {
        const products = await this.fetchCategoryProducts(host, categoryName);
        this.logger.debug(`Found ${products.length} products in ${categoryName}`);

        for (const product of products) {
          yield {
            handle: String(product.inventoryID),
            lastModified: undefined,  // ConductCommerce doesn't provide lastmod
            imageUrl: product.image
              ? `https://images.conductcommerce.com/image/upload/f_webp,q_auto:best/${product.image}`
              : undefined,
            imageTitle: product.inventoryName,
          };
        }
      } catch (error) {
        this.logger.error(`Error discovering category ${categoryName}: ${error}`);
        // Continue with next category
      }
    }
  }

  /**
   * ConductCommerce doesn't require validation - all products from getProductListings
   * are valid MTG singles (filtered by productTypeID)
   */
  async validateProduct(
    store: Store,
    collection: MtgSinglesCollection,
    handle: string,
  ): Promise<boolean> {
    // All discovered products are already validated by productTypeID filter
    return true;
  }

  /**
   * Fetch all Magic Singles category names from store settings
   */
  private async fetchCategoryNames(host: string): Promise<string[]> {
    const proxyAgent = this.getProxyAgent ? await this.getProxyAgent() : undefined;

    const response = await fetch(`${CONDUCT_COMMERCE_API}/getStoreSettings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, getBuyCart: false }),
      dispatcher: proxyAgent as ProxyAgent | undefined,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch store settings: ${response.status}`);
    }

    const data = await response.json() as {
      success: boolean;
      result: { categories: Record<string, ConductCommerceCategory> };
    };

    if (!data.success) {
      throw new Error('Store settings request failed');
    }

    // Index 0 = Magic Singles (productTypeID: 1)
    const magicRoot = data.result.categories['0'];
    if (!magicRoot) {
      return [];
    }

    return this.extractLeafCategoryNames(magicRoot);
  }

  /**
   * Recursively extract leaf category names (sets) from category tree
   */
  private extractLeafCategoryNames(
    category: ConductCommerceCategory,
    names: string[] = [],
  ): string[] {
    if (category.categories && category.categories.length > 0) {
      for (const subCat of category.categories) {
        this.extractLeafCategoryNames(subCat, names);
      }
    } else if (category.name && category.name !== 'Magic Singles') {
      names.push(category.name);
    }
    return names;
  }

  /**
   * Fetch all products in a category
   */
  private async fetchCategoryProducts(
    host: string,
    categoryName: string,
  ): Promise<Array<{ inventoryID: number; inventoryName: string; image: string }>> {
    const proxyAgent = this.getProxyAgent ? await this.getProxyAgent() : undefined;

    const response = await fetch(`${CONDUCT_COMMERCE_API}/getProductListings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        category: categoryName,
        productTypeID: 1,  // Magic Singles
      }),
      dispatcher: proxyAgent as ProxyAgent | undefined,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch category ${categoryName}: ${response.status}`);
    }

    const data = await response.json() as {
      success: boolean;
      result: { listings: Array<{ inventoryID: number; inventoryName: string; image: string }> };
    };

    return data.success ? data.result.listings : [];
  }
}
```

### ConductCommerceExtractionAdapter

```typescript
// packages/core/src/platform/adapters/conduct-commerce/conduct-commerce-extraction.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { fetch, ProxyAgent } from 'undici';
import { Condition } from '@scoutlgs/shared';
import type { Store } from '../../../database/store.entity';
import type {
  IExtractionAdapter,
  ExtractedCardVariant,
  GetProxyAgentFn,
} from '../../platform.interfaces';

const CONDUCT_COMMERCE_API = 'https://api.conductcommerce.com/v1';
const IMAGE_BASE_URL = 'https://images.conductcommerce.com/image/upload/f_webp,q_auto:best/';

/**
 * Maps ConductCommerce condition names to our Condition enum
 */
const CONDITION_MAP: Record<string, Condition> = {
  'NM/Mint': Condition.NM,
  'Lightly Played': Condition.LP,
  'Moderately Played': Condition.MP,
  'Heavily Played': Condition.HP,
  'Damaged': Condition.DMG,
};

interface ConductCommerceProductDetails {
  inventoryID: number;
  inventoryName: string;
  categoryName: string;
  image: string;
  variants: Array<{
    name: string;
    price: number;
    quantity: number;
    id: number | null;
    variantCombinationID: number;
  }>;
  fields?: Array<{ name: string; value: string }>;
}

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

@Injectable()
export class ConductCommerceExtractionAdapter implements IExtractionAdapter {
  private readonly logger = new Logger(ConductCommerceExtractionAdapter.name);
  private getProxyAgent?: GetProxyAgentFn;

  setProxyAgentFactory(factory: GetProxyAgentFn): void {
    this.getProxyAgent = factory;
  }

  /**
   * Extract product data from ConductCommerce API
   * Handle is the inventoryID as a string
   */
  async extractProduct(
    store: Store,
    handle: string,
  ): Promise<ExtractedCardVariant[]> {
    const host = new URL(store.baseUrl).host;
    const inventoryID = parseInt(handle, 10);

    try {
      const proxyAgent = this.getProxyAgent ? await this.getProxyAgent() : undefined;

      const response = await fetch(`${CONDUCT_COMMERCE_API}/getProductDetails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          inventoryID,
          skipRelated: true,
        }),
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        throw new ExtractionHttpError(
          `HTTP ${response.status} ${response.statusText}`,
          response.status,
          `${CONDUCT_COMMERCE_API}/getProductDetails`,
          retryAfter ? parseInt(retryAfter, 10) : undefined,
        );
      }

      const data = await response.json() as {
        success: boolean;
        errors: string[];
        result: ConductCommerceProductDetails;
      };

      if (!data.success) {
        throw new Error(`API error: ${data.errors.join(', ')}`);
      }

      return this.parseProduct(data.result, store.baseUrl);
    } catch (error) {
      this.logger.error(`Error extracting product ${handle} from ${store.name}: ${error}`);
      throw error;
    }
  }

  private parseProduct(
    product: ConductCommerceProductDetails,
    baseUrl: string,
  ): ExtractedCardVariant[] {
    const variants: ExtractedCardVariant[] = [];
    const { cardName, foil } = this.parseInventoryName(product.inventoryName);
    const setName = product.categoryName;

    // Extract collector number from fields if available
    const collectorNumber = product.fields?.find(f => f.name === 'Collector Number')?.value;
    const setCode = this.extractSetCodeFromImage(product.image);

    for (const variant of product.variants) {
      const condition = CONDITION_MAP[variant.name] ?? Condition.UNKNOWN;

      variants.push({
        cardName,
        setName,
        condition,
        foil,
        price: variant.price,
        currency: 'CAD',
        inStock: variant.quantity > 0,
        quantity: variant.quantity,
        imageUrl: product.image ? `${IMAGE_BASE_URL}${product.image}` : undefined,
        productUrl: `${baseUrl}/store/item/${product.inventoryID}`,
        platformVariantId: `${product.inventoryID}-${variant.variantCombinationID}`,
        setCode,
        collectorNumber,
      });
    }

    return variants;
  }

  /**
   * Parse card name and foil status from inventory name
   * Examples:
   *   "Lightning Bolt" → { cardName: "Lightning Bolt", foil: false }
   *   "Lightning Bolt - Foil" → { cardName: "Lightning Bolt", foil: true }
   *   "Lightning Bolt - Extended Art" → { cardName: "Lightning Bolt", foil: false }
   */
  private parseInventoryName(inventoryName: string): { cardName: string; foil: boolean } {
    // Check for foil suffix patterns
    const foil = /[-–][^)]*\bfoil\b|\([^)]*\bfoil\b[^)]*\)/i.test(inventoryName);

    // Remove variant suffixes to get clean card name
    let cardName = inventoryName
      .replace(/\s*[-–]\s*(Foil|Extended Art|Showcase|Promo|Borderless|Etched).*$/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '')  // Remove trailing parentheses
      .trim();

    return { cardName, foil };
  }

  /**
   * Extract set code from image path
   * Example: "magic_singles/dom/uuid.jpg" → "DOM"
   */
  private extractSetCodeFromImage(imagePath: string): string | undefined {
    if (!imagePath) return undefined;
    const parts = imagePath.split('/');
    return parts[1]?.toUpperCase();
  }
}
```

### Update Platform Adapter Factory

```typescript
// packages/core/src/platform/platform-adapter.factory.ts

import { Injectable, Logger } from '@nestjs/common';
import type { PlatformType } from '@scoutlgs/shared';
import type { IDiscoveryAdapter, IExtractionAdapter } from './platform.interfaces';
import { ShopifyDiscoveryAdapter } from './adapters/shopify/shopify-discovery.adapter';
import { ShopifyExtractionAdapter } from './adapters/shopify/shopify-extraction.adapter';
import { ConductCommerceDiscoveryAdapter } from './adapters/conduct-commerce/conduct-commerce-discovery.adapter';
import { ConductCommerceExtractionAdapter } from './adapters/conduct-commerce/conduct-commerce-extraction.adapter';

@Injectable()
export class PlatformAdapterFactory {
  private readonly logger = new Logger(PlatformAdapterFactory.name);

  constructor(
    private readonly shopifyDiscovery: ShopifyDiscoveryAdapter,
    private readonly shopifyExtraction: ShopifyExtractionAdapter,
    private readonly conductCommerceDiscovery: ConductCommerceDiscoveryAdapter,
    private readonly conductCommerceExtraction: ConductCommerceExtractionAdapter,
  ) {}

  getDiscoveryAdapter(platformType: PlatformType): IDiscoveryAdapter {
    switch (platformType) {
      case 'shopify':
        return this.shopifyDiscovery;
      case 'conduct_commerce':
        return this.conductCommerceDiscovery;
      default:
        throw new Error(`No discovery adapter for platform: ${platformType}`);
    }
  }

  getExtractionAdapter(platformType: PlatformType): IExtractionAdapter {
    switch (platformType) {
      case 'shopify':
        return this.shopifyExtraction;
      case 'conduct_commerce':
        return this.conductCommerceExtraction;
      default:
        throw new Error(`No extraction adapter for platform: ${platformType}`);
    }
  }

  isSupported(platformType: PlatformType): boolean {
    return platformType === 'shopify' || platformType === 'conduct_commerce';
  }
}
```

### Update Platform Module

```typescript
// packages/core/src/platform/platform.module.ts

import { Module } from '@nestjs/common';
import { PlatformAdapterFactory } from './platform-adapter.factory';
import { ShopifyDiscoveryAdapter } from './adapters/shopify/shopify-discovery.adapter';
import { ShopifyExtractionAdapter } from './adapters/shopify/shopify-extraction.adapter';
import { ConductCommerceDiscoveryAdapter } from './adapters/conduct-commerce/conduct-commerce-discovery.adapter';
import { ConductCommerceExtractionAdapter } from './adapters/conduct-commerce/conduct-commerce-extraction.adapter';

@Module({
  providers: [
    PlatformAdapterFactory,
    ShopifyDiscoveryAdapter,
    ShopifyExtractionAdapter,
    ConductCommerceDiscoveryAdapter,
    ConductCommerceExtractionAdapter,
  ],
  exports: [PlatformAdapterFactory],
})
export class PlatformModule {}
```

---

## Database Configuration

### Store Entity

```typescript
// Add store to database with conduct_commerce platform type
{
  name: 'backtoback',
  displayName: 'Back to Back Games',
  baseUrl: 'https://backtobackgames.conductcommerce.com',
  platformType: 'conduct_commerce',
  discoveryConfig: {
    discoveryEnabled: true,
    discoverySchedule: '0 2 * * 0',  // Weekly at 2 AM Sunday
  },
  isActive: true,
}
```

### MtgSinglesCollection

ConductCommerce doesn't use collection slugs like Shopify. The collection is implicit via `productTypeID: 1` (Magic Singles). The `MtgSinglesCollection` entity can use a placeholder:

```typescript
{
  slug: 'conduct-commerce-magic-singles',
  displayName: 'Magic Singles (ConductCommerce)',
}
```

---

## API Comparison: Shopify vs ConductCommerce

| Aspect | Shopify | ConductCommerce |
|--------|---------|-----------------|
| Discovery | Sitemap XML crawling | API category enumeration |
| Validation | HEAD request to collection URL | Not needed (API pre-filtered) |
| Product Handle | URL slug (e.g., "lightning-bolt-m10") | inventoryID (e.g., "127479") |
| Extraction | `/products/{handle}.json` | `getProductDetails` API |
| Condition | Variant option1/option2 | Variant name field |
| Rate Limiting | Shopify limits apply | Unknown (appears generous) |

---

## Discovery Flow

```
1. getStoreSettings API
   └── Extract category tree for productTypeID 0 (Magic Singles)
   └── Flatten to 236 leaf category names (sets)

2. For each category (set):
   └── getProductListings API with category parameter
   └── Yield DiscoveredProduct for each listing
       - handle: inventoryID
       - imageTitle: inventoryName
       - imageUrl: constructed from image path

3. No validation needed (API filters by productTypeID)

4. Queue extraction jobs for all discovered products
```

## Extraction Flow

```
1. getProductDetails API with inventoryID
   └── Returns full product with all condition variants

2. Parse each variant:
   - cardName: parsed from inventoryName
   - setName: categoryName
   - condition: mapped from variant.name
   - foil: detected from inventoryName suffix
   - price/quantity: from variant
   - setCode: extracted from image path

3. Return ExtractedCardVariant[] for database upsert
```

---

## Known ConductCommerce Stores

| Store Name | Host | Status |
|------------|------|--------|
| Back to Back Games | backtobackgames.conductcommerce.com | Ready to add |

**Finding More Stores**: ConductCommerce stores can be identified by:
- Domain pattern: `*.conductcommerce.com`
- API calls to `api.conductcommerce.com`

---

## Implementation Checklist

- [ ] Create `conduct-commerce-discovery.adapter.ts`
- [ ] Create `conduct-commerce-extraction.adapter.ts`
- [ ] Create `conduct-commerce/index.ts` barrel export
- [ ] Update `PlatformAdapterFactory` to include ConductCommerce
- [ ] Update `PlatformModule` providers
- [ ] Add `'conduct_commerce'` to `PlatformType` in shared types
- [ ] Add Back to Back Games store to database seed
- [ ] Create MtgSinglesCollection for ConductCommerce
- [ ] Test discovery with Back to Back Games
- [ ] Test extraction with sample products
- [ ] Monitor for rate limiting during full discovery

---

## Legacy V1 Scraper

The existing `ConductCommerceLoader` and `ConductCommerceParser` in `apps/scraper/` can remain for on-demand search functionality until fully migrated to V2. They use the same `getProductListings` API with `search` parameter instead of `category`.
