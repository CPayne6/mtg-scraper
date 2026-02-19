# Crystal Commerce Scraping Plan (V2 Architecture)

## Overview

This document outlines the V2 discovery/extraction architecture for scraping MTG singles from Crystal Commerce-powered stores, following the same adapter pattern as Shopify.

**API Documentation**: https://crystal-service.readme.io/

> **⚠️ CRITICAL FINDING**: Face to Face Games and 401 Games are **NOT** Crystal Commerce stores - they are Shopify stores. The API requires store authentication (Bearer token), which stores would need to provide us access to.

**Verified Crystal Commerce Stores**:
- TerraCrux Games (https://terracruxgames.crystalcommerce.com)
- MTG North (https://mtgnorth.crystalcommerce.com) - Uses non-standard category structure
- Various other US LGS

---

## Storefront Investigation Summary (February 2026)

### Key Findings

1. **No Sitemap Available**: Crystal Commerce stores have `robots.txt` that blocks all crawlers except Google. The `/sitemap.xml` endpoint returns error pages.

2. **API Requires Authentication**: The Crystal Service API requires Bearer tokens or OAuth authentication. Without store cooperation, we cannot use the API.

3. **HTML Scraping Required**: For scraping without API access, we must use the public storefront HTML.

### Storefront URL Patterns

Crystal Commerce storefronts follow consistent URL patterns:

```
Base URL: https://{store}.crystalcommerce.com

Category:     /catalog/magic_singles/{category_id}
              Example: /catalog/magic_singles/8

Subcategory:  /catalog/magic_singles-{set_slug}/{category_id}
              Example: /catalog/magic_singles-tarkir_dragonstorm/4499

Product:      /catalog/magic_singles-{set_slug}/{product_slug}/{product_id}
              Example: /catalog/magic_singles-tarkir_dragonstorm/elspeth_storm_slayer__foil__showcase/512590

Pagination:   ?page=2
Stock Filter: ?filter_by_stock=in-stock
```

### Advanced Search URL Structure

```
/advanced_search?
  search[fuzzy_search]=Lightning+Bolt     # Card name search
  &search[category_ids_with_descendants][]=8  # Magic Singles category ID
  &search[in_stock]=1                     # In-stock only
  &search[sort]=name                      # Sort by: name, sell_price, buy_price
  &search[direction]=ascend               # Ascending/descending
  &page=1                                 # Pagination
```

### Data Available on Storefront

**Product Listing Pages show:**
- Product name (e.g., "Lightning Bolt", "Lightning Bolt - Foil", "Lightning Bolt - Foil Etched")
- Set name (e.g., "Alpha", "3rd Edition", "Magic 2010")
- Product URL with product ID
- Price (in dollars)
- Stock status and quantity
- Condition variants inline (for in-stock items)

**Product Detail Pages show:**
- Full product name
- Image
- Price per variant
- Condition: "NM-Mint, English, 1 In Stock"
- "Details" tab with:
  - Color
  - Rarity (M, R, U, C)
  - Mana Cost
  - Card Type
  - Artist
  - Card Number
  - Set Name
  - Finish (Regular/Foil)

### Advanced Search Filter Fields

When "Magic Singles" category is selected, additional filters appear:

**Descriptors:**
- Color (checkboxes): Artifact, Black, Blue, Green, Land, Multi-Color, Red, White, Colorless
- Flavor Text, Card Text (text fields)
- Rarity: M, R, U, C, P, S, T, L
- Cost, Pow/Tgh, Card Type, Artist, Name, Card Number, Set Name
- Finish: Regular, Foil

**Product Variants:**
- Condition: NM-Mint, Light Play, Moderate Play, Heavy Play, Damaged
- Language: English, Japanese, T-Chinese, S-Chinese, French, Spanish, Portuguese, German, Italian, Russian, Korean

---

## Recommended Scraping Approach: HTML Scraping

Since API access requires store authentication, we'll use HTML scraping with the Advanced Search functionality.

### Strategy

1. **Discovery**: Use Advanced Search to enumerate all Magic Singles
2. **Search by Card Name**: For user searches, use `search[fuzzy_search]={cardName}`
3. **Extract from Search Results**: Parse HTML to extract card data directly from listings
4. **No Per-Product Fetch Needed**: Search results include all variant data inline

---

## API Discovery Summary (For Reference - Requires Authentication)

Crystal Commerce provides a well-documented REST API (Crystal Service) with the following key endpoints:

### Base URLs
- **Catalog API**: `https://catalog.crystalcommerce.com`
- **Store Admin API**: `https://{store}-admin.crystalcommerce.com`

### Authentication
- `Authorization` header with Bearer token
- OAuth token endpoint: `POST /oauth/token`
- Some endpoints use `client_id` or `access_token` query params

### Key Services
1. **Hive-Inventory Service** - catalog, categories, products, variants
2. **Inventory Service** - pricing, stock levels
3. **Core Admin Service** - admin operations, search

---

## Discovery Mechanism

### Step 1: Get Product Types (Magic Singles ID)

**Endpoint**: `GET /api/v2/product_types`

**Query Params**:
- `access_token` (required)
- `page`, `limit` for pagination
- `query` for elasticsearch search

**Response Structure**:
```typescript
[
  {
    id: 1,
    name: "Magic: The Gathering",
    icon: "string",
    logo: "string",
    listable_on_tcg_player: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z"
  },
  // ... other product types
]
```

### Step 2: Get Categories (MTG Sets)

**Endpoint**: `GET /api/v1/categories/{id}/tree`

Returns the hierarchical category tree for Magic: The Gathering sets.

**Alternative**: `GET /api/v1/categories/{id}/children`

### Step 3: Search Variants (Discovery + Extraction Combined)

**Endpoint**: `POST /api/v1/variants/search`

**Request Body**:
```json
{
  "variant": {
    "product_type_id_eq": 1,
    "category_id": 123,
    "in_stock": true,
    "last_updated_after": "2024-01-01T00:00:00Z"
  }
}
```

**Response Structure**:
```typescript
{
  id: 12345,
  product_id: 6789,
  product_name: "Lightning Bolt",
  category_name: "Magic 2010",
  sell_price: {
    money: {
      cents: 199,
      currency: "USD"
    }
  },
  buy_price: { money: { cents: 50, currency: "USD" } },
  qty: 10,
  available_qty: 8,
  inventory_qty: 10,
  descriptors: [
    { variant_descriptor: { name: "Condition", value: "Near Mint" } },
    { variant_descriptor: { name: "Finish", value: "Foil" } }
  ],
  is_default: false,
  _links: {
    self: { href: "/api/v1/variants/12345" },
    product: { href: "/api/v1/products/6789" }
  },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-15T00:00:00Z"
}
```

---

## V2 Adapter Implementation

### File Structure

```
packages/core/src/platform/adapters/crystal-commerce/
├── crystal-commerce-discovery.adapter.ts
├── crystal-commerce-extraction.adapter.ts
├── crystal-commerce.types.ts
└── index.ts
```

### Types Definition

```typescript
// packages/core/src/platform/adapters/crystal-commerce/crystal-commerce.types.ts

export interface CrystalCommerceProductType {
  id: number;
  name: string;
  icon?: string;
  logo?: string;
  listable_on_tcg_player?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrystalCommerceCategory {
  id: number;
  name: string;
  parent_id?: number;
  children?: CrystalCommerceCategory[];
}

export interface CrystalCommerceMoney {
  cents: number;
  currency: string;
}

export interface CrystalCommerceVariantDescriptor {
  variant_descriptor: {
    name: string;
    value: string;
  };
}

export interface CrystalCommerceVariant {
  id: number;
  product_id: number;
  product_name: string;
  category_name: string;
  sell_price: { money: CrystalCommerceMoney };
  buy_price?: { money: CrystalCommerceMoney };
  qty: number;
  available_qty: number;
  inventory_qty: number;
  reserved_qty?: number;
  catalog_id: number;
  product_catalog_id: number;
  descriptors: CrystalCommerceVariantDescriptor[];
  is_default: boolean;
  is_infinite_qty: boolean;
  _links: {
    self: { href: string };
    product: { href: string };
  };
  created_at: string;
  updated_at: string;
}

export interface CrystalCommerceStoreConfig {
  accessToken: string;
  adminHost: string;  // e.g., "mystore-admin.crystalcommerce.com"
  magicProductTypeId?: number;  // Discovered dynamically or configured
}
```

### CrystalCommerceDiscoveryAdapter

```typescript
// packages/core/src/platform/adapters/crystal-commerce/crystal-commerce-discovery.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { fetch, ProxyAgent } from 'undici';
import type { Store } from '../../../database/store.entity';
import type { MtgSinglesCollection } from '../../../database/mtg-singles-collection.entity';
import type {
  IDiscoveryAdapter,
  DiscoveredProduct,
  GetProxyAgentFn,
} from '../../platform.interfaces';
import type {
  CrystalCommerceProductType,
  CrystalCommerceCategory,
  CrystalCommerceVariant,
  CrystalCommerceStoreConfig,
} from './crystal-commerce.types';

@Injectable()
export class CrystalCommerceDiscoveryAdapter implements IDiscoveryAdapter {
  private readonly logger = new Logger(CrystalCommerceDiscoveryAdapter.name);
  private getProxyAgent?: GetProxyAgentFn;

  // Cache the Magic product type ID per store
  private magicProductTypeIdCache = new Map<string, number>();

  setProxyAgentFactory(factory: GetProxyAgentFn): void {
    this.getProxyAgent = factory;
  }

  /**
   * Discover all products from a Crystal Commerce store
   * Uses variants/search API with product_type_id filter
   */
  async *discoverProducts(
    store: Store,
    collection: MtgSinglesCollection,
  ): AsyncIterable<DiscoveredProduct> {
    const config = store.platformConfig as CrystalCommerceStoreConfig;
    const adminUrl = `https://${config.adminHost}`;

    this.logger.log(`Starting discovery for store: ${store.name}`);

    // 1. Get Magic product type ID if not configured
    const magicProductTypeId = await this.getMagicProductTypeId(adminUrl, config.accessToken);
    this.logger.log(`Using Magic product type ID: ${magicProductTypeId}`);

    // 2. Get all categories (sets) for Magic
    const categories = await this.fetchCategories(adminUrl, config.accessToken, magicProductTypeId);
    this.logger.log(`Found ${categories.length} Magic categories to discover`);

    // 3. For each category, fetch variants
    for (const category of categories) {
      try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const variants = await this.fetchVariantsByCategory(
            adminUrl,
            config.accessToken,
            magicProductTypeId,
            category.id,
            page,
          );

          if (variants.length === 0) {
            hasMore = false;
            continue;
          }

          this.logger.debug(
            `Found ${variants.length} variants in ${category.name} (page ${page})`,
          );

          for (const variant of variants) {
            yield {
              handle: String(variant.id),
              lastModified: variant.updated_at ? new Date(variant.updated_at) : undefined,
              imageUrl: undefined,  // Fetched during extraction if needed
              imageTitle: variant.product_name,
            };
          }

          // Check for more pages
          hasMore = variants.length >= 100;  // Assuming page size of 100
          page++;
        }
      } catch (error) {
        this.logger.error(`Error discovering category ${category.name}: ${error}`);
        // Continue with next category
      }
    }
  }

  /**
   * Crystal Commerce doesn't require validation - variants are filtered by product_type_id
   */
  async validateProduct(
    store: Store,
    collection: MtgSinglesCollection,
    handle: string,
  ): Promise<boolean> {
    return true;
  }

  /**
   * Get the Magic: The Gathering product type ID
   */
  private async getMagicProductTypeId(adminUrl: string, accessToken: string): Promise<number> {
    const cacheKey = adminUrl;
    if (this.magicProductTypeIdCache.has(cacheKey)) {
      return this.magicProductTypeIdCache.get(cacheKey)!;
    }

    const proxyAgent = this.getProxyAgent ? await this.getProxyAgent() : undefined;

    const response = await fetch(
      `${adminUrl}/api/v2/product_types?access_token=${encodeURIComponent(accessToken)}&limit=all`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch product types: ${response.status}`);
    }

    const productTypes = await response.json() as CrystalCommerceProductType[];

    // Find Magic: The Gathering
    const magic = productTypes.find(pt =>
      pt.name.toLowerCase().includes('magic') ||
      pt.name.toLowerCase().includes('mtg'),
    );

    if (!magic) {
      throw new Error('Magic: The Gathering product type not found');
    }

    this.magicProductTypeIdCache.set(cacheKey, magic.id);
    return magic.id;
  }

  /**
   * Fetch all categories (sets) for Magic product type
   */
  private async fetchCategories(
    adminUrl: string,
    accessToken: string,
    productTypeId: number,
  ): Promise<CrystalCommerceCategory[]> {
    const proxyAgent = this.getProxyAgent ? await this.getProxyAgent() : undefined;

    // Use category tree endpoint with Magic root
    const response = await fetch(
      `${adminUrl}/api/v1/categories/${productTypeId}/tree?Authorization=Bearer ${encodeURIComponent(accessToken)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch categories: ${response.status}`);
    }

    const tree = await response.json() as CrystalCommerceCategory;
    return this.flattenCategoryTree(tree);
  }

  /**
   * Flatten category tree to list of leaf categories
   */
  private flattenCategoryTree(
    category: CrystalCommerceCategory,
    result: CrystalCommerceCategory[] = [],
  ): CrystalCommerceCategory[] {
    if (category.children && category.children.length > 0) {
      for (const child of category.children) {
        this.flattenCategoryTree(child, result);
      }
    } else {
      result.push(category);
    }
    return result;
  }

  /**
   * Fetch variants by category using search API
   */
  private async fetchVariantsByCategory(
    adminUrl: string,
    accessToken: string,
    productTypeId: number,
    categoryId: number,
    page: number,
  ): Promise<CrystalCommerceVariant[]> {
    const proxyAgent = this.getProxyAgent ? await this.getProxyAgent() : undefined;

    const response = await fetch(`${adminUrl}/api/v1/variants/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        variant: {
          product_type_id_eq: productTypeId,
          category_id: categoryId,
          in_stock: true,
        },
        page,
        limit: 100,
      }),
      dispatcher: proxyAgent as ProxyAgent | undefined,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch variants: ${response.status}`);
    }

    return await response.json() as CrystalCommerceVariant[];
  }
}
```

### CrystalCommerceExtractionAdapter

```typescript
// packages/core/src/platform/adapters/crystal-commerce/crystal-commerce-extraction.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { fetch, ProxyAgent } from 'undici';
import { Condition } from '@scoutlgs/shared';
import type { Store } from '../../../database/store.entity';
import type {
  IExtractionAdapter,
  ExtractedCardVariant,
  GetProxyAgentFn,
} from '../../platform.interfaces';
import type {
  CrystalCommerceVariant,
  CrystalCommerceStoreConfig,
} from './crystal-commerce.types';

/**
 * Maps Crystal Commerce condition names to our Condition enum
 */
const CONDITION_MAP: Record<string, Condition> = {
  'Near Mint': Condition.NM,
  'NM': Condition.NM,
  'Lightly Played': Condition.LP,
  'LP': Condition.LP,
  'Slightly Played': Condition.LP,
  'SP': Condition.LP,
  'Moderately Played': Condition.MP,
  'MP': Condition.MP,
  'Heavily Played': Condition.HP,
  'HP': Condition.HP,
  'Damaged': Condition.DMG,
  'DMG': Condition.DMG,
};

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
export class CrystalCommerceExtractionAdapter implements IExtractionAdapter {
  private readonly logger = new Logger(CrystalCommerceExtractionAdapter.name);
  private getProxyAgent?: GetProxyAgentFn;

  setProxyAgentFactory(factory: GetProxyAgentFn): void {
    this.getProxyAgent = factory;
  }

  /**
   * Extract product data from Crystal Commerce API
   * Handle is the variant ID as a string
   */
  async extractProduct(
    store: Store,
    handle: string,
  ): Promise<ExtractedCardVariant[]> {
    const config = store.platformConfig as CrystalCommerceStoreConfig;
    const adminUrl = `https://${config.adminHost}`;
    const variantId = parseInt(handle, 10);

    try {
      const proxyAgent = this.getProxyAgent ? await this.getProxyAgent() : undefined;

      const response = await fetch(`${adminUrl}/api/v1/variants/${variantId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.accessToken}`,
        },
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        throw new ExtractionHttpError(
          `HTTP ${response.status} ${response.statusText}`,
          response.status,
          `${adminUrl}/api/v1/variants/${variantId}`,
          retryAfter ? parseInt(retryAfter, 10) : undefined,
        );
      }

      const variant = await response.json() as CrystalCommerceVariant;
      return [this.parseVariant(variant, store.baseUrl)];
    } catch (error) {
      this.logger.error(`Error extracting variant ${handle} from ${store.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Parse Crystal Commerce variant to ExtractedCardVariant
   */
  private parseVariant(
    variant: CrystalCommerceVariant,
    baseUrl: string,
  ): ExtractedCardVariant {
    // Extract condition and foil from descriptors
    const { condition, foil } = this.parseDescriptors(variant.descriptors);

    // Convert cents to dollars
    const price = variant.sell_price.money.cents / 100;
    const currency = variant.sell_price.money.currency;

    return {
      cardName: variant.product_name,
      setName: variant.category_name,
      condition,
      foil,
      price,
      currency,
      inStock: variant.available_qty > 0,
      quantity: variant.available_qty,
      imageUrl: undefined,  // Would need separate product fetch
      productUrl: `${baseUrl}/products/${variant.product_id}`,
      platformVariantId: String(variant.id),
      setCode: undefined,  // Not directly available
      collectorNumber: undefined,  // Not directly available
    };
  }

  /**
   * Parse condition and foil from variant descriptors
   */
  private parseDescriptors(
    descriptors: Array<{ variant_descriptor: { name: string; value: string } }>,
  ): { condition: Condition; foil: boolean } {
    let condition = Condition.UNKNOWN;
    let foil = false;

    for (const desc of descriptors) {
      const name = desc.variant_descriptor.name.toLowerCase();
      const value = desc.variant_descriptor.value;

      if (name === 'condition') {
        condition = CONDITION_MAP[value] ?? Condition.UNKNOWN;
      } else if (name === 'finish' || name === 'foil') {
        foil = value.toLowerCase().includes('foil') &&
               !value.toLowerCase().includes('non-foil');
      }
    }

    return { condition, foil };
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
import { CrystalCommerceDiscoveryAdapter } from './adapters/crystal-commerce/crystal-commerce-discovery.adapter';
import { CrystalCommerceExtractionAdapter } from './adapters/crystal-commerce/crystal-commerce-extraction.adapter';

@Injectable()
export class PlatformAdapterFactory {
  private readonly logger = new Logger(PlatformAdapterFactory.name);

  constructor(
    private readonly shopifyDiscovery: ShopifyDiscoveryAdapter,
    private readonly shopifyExtraction: ShopifyExtractionAdapter,
    private readonly crystalCommerceDiscovery: CrystalCommerceDiscoveryAdapter,
    private readonly crystalCommerceExtraction: CrystalCommerceExtractionAdapter,
  ) {}

  getDiscoveryAdapter(platformType: PlatformType): IDiscoveryAdapter {
    switch (platformType) {
      case 'shopify':
        return this.shopifyDiscovery;
      case 'crystal_commerce':
        return this.crystalCommerceDiscovery;
      default:
        throw new Error(`No discovery adapter for platform: ${platformType}`);
    }
  }

  getExtractionAdapter(platformType: PlatformType): IExtractionAdapter {
    switch (platformType) {
      case 'shopify':
        return this.shopifyExtraction;
      case 'crystal_commerce':
        return this.crystalCommerceExtraction;
      default:
        throw new Error(`No extraction adapter for platform: ${platformType}`);
    }
  }

  isSupported(platformType: PlatformType): boolean {
    return platformType === 'shopify' || platformType === 'crystal_commerce';
  }
}
```

---

## Database Configuration

### Store Entity

```typescript
// Add store to database with crystal_commerce platform type
{
  name: 'f2f',
  displayName: 'Face to Face Games',
  baseUrl: 'https://www.facetofacegames.com',
  platformType: 'crystal_commerce',
  platformConfig: {
    accessToken: 'STORE_API_TOKEN',  // From store admin panel
    adminHost: 'facetofacegames-admin.crystalcommerce.com',
    magicProductTypeId: 1,  // Optional - discovered dynamically
  },
  discoveryConfig: {
    discoveryEnabled: true,
    discoverySchedule: '0 2 * * 0',  // Weekly at 2 AM Sunday
  },
  isActive: true,
}
```

### Shared Types Update

```typescript
// packages/shared/src/types.ts

export type PlatformType = 'shopify' | 'crystal_commerce' | 'conduct_commerce';
```

---

## API Comparison: Shopify vs Crystal Commerce

| Aspect | Shopify | Crystal Commerce |
|--------|---------|------------------|
| Discovery | Sitemap XML crawling | Variants/search API |
| Validation | HEAD request to collection URL | Not needed (API pre-filtered) |
| Product Handle | URL slug | Variant ID |
| Extraction | `/products/{handle}.json` | `/api/v1/variants/{id}` |
| Condition | Variant option1/option2 | Descriptors array |
| Foil Detection | Variant options | Descriptors (Finish) |
| Price Format | String (dollars) | Cents with currency |
| Rate Limiting | Shopify limits | Unknown |
| Authentication | None (public) | Bearer token required |

---

## Discovery Flow

```
1. Get Magic product type ID
   └── GET /api/v2/product_types
   └── Find "Magic: The Gathering" entry
   └── Cache the ID

2. Get all categories (sets)
   └── GET /api/v1/categories/{id}/tree
   └── Flatten to leaf categories

3. For each category (set):
   └── POST /api/v1/variants/search with:
       - product_type_id_eq: Magic ID
       - category_id: set ID
       - in_stock: true (optional)
   └── Yield DiscoveredProduct for each variant
       - handle: variant.id
       - imageTitle: variant.product_name
       - lastModified: variant.updated_at

4. No validation needed (API filters by product type)

5. Queue extraction jobs for all discovered products
```

## Extraction Flow

```
1. GET /api/v1/variants/{id}
   └── Returns full variant with all details

2. Parse variant:
   - cardName: product_name
   - setName: category_name
   - condition: from descriptors["Condition"]
   - foil: from descriptors["Finish"]
   - price: sell_price.money.cents / 100
   - currency: sell_price.money.currency
   - quantity: available_qty

3. Return ExtractedCardVariant for database upsert
```

---

## Authentication Requirements

### Obtaining API Token

Crystal Commerce stores require an API token from the store admin panel:

1. Log into Crystal Commerce admin
2. Navigate to Settings > API Access
3. Generate or retrieve the access token
4. Store securely in environment variables

### Token Configuration

```env
# .env
CRYSTAL_COMMERCE_F2F_TOKEN=your_token_here
CRYSTAL_COMMERCE_401_TOKEN=your_token_here
```

```typescript
// Store configuration
{
  platformConfig: {
    accessToken: process.env.CRYSTAL_COMMERCE_F2F_TOKEN,
    adminHost: 'facetofacegames-admin.crystalcommerce.com',
  }
}
```

---

## Known Crystal Commerce Stores

| Store Name | Store URL | Status |
|------------|-----------|--------|
| TerraCrux Games | https://terracruxgames.crystalcommerce.com | ✅ Verified |
| MTG North | https://mtgnorth.crystalcommerce.com | ✅ Verified (different category structure) |

> **⚠️ IMPORTANT**: Face to Face Games and 401 Games are **NOT** Crystal Commerce stores - they use Shopify.

**Note**: Crystal Commerce stores typically have URLs in the format `{storename}.crystalcommerce.com` or custom domains.

---

## Alternative: HTML Scraping Adapter (Recommended)

Since API access requires store authentication, here's the HTML scraping approach:

### CrystalCommerceHtmlExtractionAdapter

```typescript
// packages/core/src/platform/adapters/crystal-commerce/crystal-commerce-html.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { fetch, ProxyAgent } from 'undici';
import { Condition } from '@scoutlgs/shared';
import type { Store } from '../../../database/store.entity';
import type {
  IExtractionAdapter,
  ExtractedCardVariant,
  GetProxyAgentFn,
} from '../../platform.interfaces';

/**
 * Maps Crystal Commerce condition strings to Condition enum
 */
const CONDITION_MAP: Record<string, Condition> = {
  'nm-mint': Condition.NM,
  'near mint': Condition.NM,
  'light play': Condition.LP,
  'lightly played': Condition.LP,
  'moderate play': Condition.MP,
  'moderately played': Condition.MP,
  'heavy play': Condition.HP,
  'heavily played': Condition.HP,
  'damaged': Condition.DMG,
};

interface CrystalCommerceHtmlConfig {
  magicSinglesCategoryId: number;  // e.g., 8 for TerraCrux
}

@Injectable()
export class CrystalCommerceHtmlExtractionAdapter implements IExtractionAdapter {
  private readonly logger = new Logger(CrystalCommerceHtmlExtractionAdapter.name);
  private getProxyAgent?: GetProxyAgentFn;

  setProxyAgentFactory(factory: GetProxyAgentFn): void {
    this.getProxyAgent = factory;
  }

  /**
   * Search for a card by name and extract all variants
   * Handle is the card name for search-based extraction
   */
  async extractProduct(
    store: Store,
    cardName: string,
  ): Promise<ExtractedCardVariant[]> {
    const config = store.platformConfig as CrystalCommerceHtmlConfig;
    const categoryId = config.magicSinglesCategoryId || 8;

    // Build Advanced Search URL
    const searchUrl = new URL(`${store.baseUrl}/advanced_search`);
    searchUrl.searchParams.set('search[fuzzy_search]', cardName);
    searchUrl.searchParams.set('search[category_ids_with_descendants][]', String(categoryId));
    searchUrl.searchParams.set('search[in_stock]', '1');
    searchUrl.searchParams.set('search[sort]', 'sell_price');
    searchUrl.searchParams.set('search[direction]', 'ascend');

    try {
      const proxyAgent = this.getProxyAgent ? await this.getProxyAgent() : undefined;

      const response = await fetch(searchUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)',
          'Accept': 'text/html',
        },
        dispatcher: proxyAgent as ProxyAgent | undefined,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      return this.parseSearchResults(html, store.baseUrl, cardName);
    } catch (error) {
      this.logger.error(`Error searching for ${cardName} at ${store.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Parse HTML search results to extract card variants
   */
  private parseSearchResults(
    html: string,
    baseUrl: string,
    searchedCard: string,
  ): ExtractedCardVariant[] {
    const variants: ExtractedCardVariant[] = [];

    // Match product listing items - Crystal Commerce uses <li> within a product list
    // Pattern: <li class="product"> ... product data ... </li>
    const productRegex = /<li[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;

    while ((match = productRegex.exec(html)) !== null) {
      const productHtml = match[1];

      // Extract product name from <h4> heading link
      const nameMatch = productHtml.match(/<h4[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      if (!nameMatch) continue;

      const fullName = this.decodeHtmlEntities(nameMatch[1].trim());

      // Skip if product name doesn't match searched card (fuzzy)
      if (!this.matchesCardName(fullName, searchedCard)) continue;

      // Extract set name from category link (usually in a sub-element)
      const setMatch = productHtml.match(/class="[^"]*category[^"]*"[^>]*>([^<]+)</i) ||
                       productHtml.match(/<a[^>]*catalog[^>]*>[\s\S]*?<[^>]*>([^<]+)<\/[^>]*>/i);
      const setName = setMatch ? this.decodeHtmlEntities(setMatch[1].trim()) : '';

      // Extract product URL
      const urlMatch = productHtml.match(/href="([^"]*\/catalog\/[^"]+)"/i);
      const productUrl = urlMatch ? (urlMatch[1].startsWith('http') ? urlMatch[1] : baseUrl + urlMatch[1]) : '';

      // Extract product ID from URL
      const idMatch = productUrl.match(/\/(\d+)$/);
      const productId = idMatch ? idMatch[1] : '';

      // Parse card name and foil status from full name
      const { cardName, foil } = this.parseCardNameAndFoil(fullName);

      // Extract variants (condition, stock, price)
      // Pattern: <div class="variant">NM-Mint, English</div> <div class="qty">1 In Stock</div> <div class="price">$1.66</div>
      const variantRegex = /(?:class="[^"]*(?:variant|condition)[^"]*"[^>]*>([^<]+)<)|(?:(\d+)\s*In\s*Stock)|(?:\$\s*([\d,.]+))/gi;

      let currentCondition = '';
      let currentLanguage = 'English';
      let currentStock = 0;
      let currentPrice = 0;

      // Also look for individual variant rows
      const variantRowRegex = /<div[^>]*class="[^"]*variant-row[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      let variantMatch;

      // Simple parsing: extract condition/stock/price patterns
      const conditionMatch = productHtml.match(/(?:NM-Mint|Near Mint|Light Play|Lightly Played|Moderate Play|Moderately Played|Heavy Play|Heavily Played|Damaged),?\s*(\w+)?/i);
      const stockMatch = productHtml.match(/(\d+)\s*In\s*Stock/i);
      const priceMatch = productHtml.match(/\$\s*([\d,.]+)/);

      if (conditionMatch || priceMatch) {
        const conditionStr = conditionMatch ? conditionMatch[0].split(',')[0].toLowerCase().trim() : 'nm-mint';
        const condition = CONDITION_MAP[conditionStr] ?? Condition.UNKNOWN;
        const inStock = stockMatch ? parseInt(stockMatch[1], 10) > 0 : false;
        const quantity = stockMatch ? parseInt(stockMatch[1], 10) : 0;
        const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : 0;

        if (price > 0) {
          variants.push({
            cardName,
            setName,
            condition,
            foil,
            price,
            currency: 'USD',  // Crystal Commerce US stores use USD
            inStock,
            quantity,
            imageUrl: undefined,
            productUrl,
            platformVariantId: productId,
          });
        }
      }
    }

    this.logger.debug(`Extracted ${variants.length} variants for "${searchedCard}" from search results`);
    return variants;
  }

  /**
   * Parse card name and foil status from full product name
   */
  private parseCardNameAndFoil(fullName: string): { cardName: string; foil: boolean } {
    // Patterns: "Lightning Bolt - Foil", "Lightning Bolt - Foil Etched", "Lightning Bolt - Showcase"
    const foilPatterns = [' - Foil Etched', ' - Foil', ' (Foil)'];
    let cardName = fullName;
    let foil = false;

    for (const pattern of foilPatterns) {
      if (fullName.toLowerCase().includes(pattern.toLowerCase())) {
        foil = true;
        cardName = fullName.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
        break;
      }
    }

    // Also remove showcase/extended art markers from card name for matching
    cardName = cardName.replace(/ - (Showcase|Extended Art|Borderless|Full Art)/i, '').trim();

    return { cardName, foil };
  }

  /**
   * Check if product name matches searched card name
   */
  private matchesCardName(productName: string, searchedCard: string): boolean {
    const normalizedProduct = productName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedSearch = searchedCard.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedProduct.includes(normalizedSearch) || normalizedSearch.includes(normalizedProduct);
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'");
  }
}
```

### Store Configuration for HTML Scraping

```typescript
// Database seed entry for a Crystal Commerce store
{
  name: 'terracrux',
  displayName: 'TerraCrux Games',
  baseUrl: 'https://terracruxgames.crystalcommerce.com',
  platformType: 'crystal_commerce',
  platformConfig: {
    magicSinglesCategoryId: 8,  // Found via storefront investigation
    useHtmlScraping: true,      // Flag to use HTML adapter
  },
  isActive: true,
}
```

---

## Implementation Checklist

**HTML Scraping Approach (Recommended):**
- [ ] Create `crystal-commerce-html.adapter.ts` for search-based extraction
- [ ] Create `crystal-commerce.types.ts` with config types
- [ ] Create `crystal-commerce/index.ts` barrel export
- [ ] Update `PlatformAdapterFactory` to include Crystal Commerce
- [ ] Update `PlatformModule` providers
- [ ] Add `'crystal_commerce'` to `PlatformType` in shared types
- [ ] Add TerraCrux Games store to database seed
- [ ] Test HTML scraping with sample card searches
- [ ] Implement rate limiting (respect robots.txt guidelines)
- [ ] Monitor for HTML structure changes

**API Approach (If store provides authentication):**
- [ ] Create `crystal-commerce-discovery.adapter.ts`
- [ ] Create `crystal-commerce-extraction.adapter.ts`
- [ ] Obtain API tokens from cooperating Crystal Commerce stores
- [ ] Test API-based discovery and extraction

---

## Open Questions

1. **API Token Access**: Requires store cooperation. Most stores unlikely to share API credentials.
   - **Resolved**: Use HTML scraping approach instead.

2. **Rate Limits**: robots.txt blocks crawlers. Need respectful scraping intervals.
   - **Recommendation**: 1-2 second delay between requests.

3. **Pagination**: HTML search results paginate with `?page=N` parameter.
   - **Verified**: Pagination links visible in search results.

4. **HTML Structure Stability**: Crystal Commerce storefronts may update their HTML structure.
   - **Mitigation**: Use robust regex patterns, test periodically.

5. **Category IDs**: Magic Singles category ID varies by store (8 for TerraCrux, may differ for others).
   - **Solution**: Discover category ID from `/catalog/magic_singles/{id}` link on homepage.

6. **Currency**: US Crystal Commerce stores use USD, Canadian stores may use CAD.
   - **Solution**: Configure per-store or detect from HTML.

---

## Comparison: Shopify vs Crystal Commerce (HTML Scraping)

| Aspect | Shopify | Crystal Commerce (HTML) |
|--------|---------|-------------------------|
| Discovery | Sitemap XML crawling | Advanced Search pagination |
| Card Search | Not supported (sitemap only) | Native search endpoint |
| Product Handle | URL slug | Card name (search-based) |
| Extraction | `/products/{handle}.json` | HTML parsing from search results |
| Condition | Variant option1/option2 | Inline in variant rows |
| Foil Detection | Variant options / product name | Product name suffix |
| Price Format | String (dollars) | String with $ symbol |
| Rate Limiting | Shopify limits | Unknown (respect robots.txt) |
| Authentication | None (public JSON) | None (public HTML) |
| Data Richness | Full product JSON | Limited to visible HTML |

**Summary**:
- **Shopify**: Better for inventory-based discovery (sitemap), excellent data from JSON endpoint
- **Crystal Commerce**: Better for search-based lookups (native search), HTML parsing required

**Recommendation**: For Crystal Commerce stores, use the Advanced Search endpoint to search for specific cards rather than trying to enumerate entire inventory. This aligns well with user-initiated searches.
