# Scraping Strategy V2: Two-Stage Discovery & Extraction

## Overview

This document outlines a new architecture for onboarding stores with a two-stage approach:
1. **Discovery**: Sitemap/catalog crawling + URL validation
2. **Extraction**: Product data fetching + database storage

This replaces the current on-demand scraping model with a pre-populated database approach.

**Key Design Principles:**
- Platform-agnostic data model (no Shopify/WooCommerce/etc specific fields in final output)
- Dependency injection for platform-specific logic
- Normalized database schema
- Support for both V2 discovery-based stores and legacy V1 API-based stores

---

## Current Architecture (V1)

```
User Search → Cache Check → Cache Miss → Queue Job → Scrape Store API → Cache Result → Return
```

**Problems:**
- First search for any card is slow (waits for all stores to scrape)
- Rate limiting causes delays and errors
- No historical price data
- Relies on store search APIs (can break, rate limit, or change)

---

## Proposed Architecture (V2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DISCOVERY SERVICE                                  │
│  (Runs periodically - daily/weekly per store)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Platform adapter fetches product catalog (sitemap, API, feed, etc.)     │
│  2. Filter to MTG singles via collection/category validation                │
│  3. Store valid product references in `product_urls` table                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTRACTION SERVICE                                  │
│  (Runs continuously - processes product_urls queue)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Pull unprocessed/stale product URLs from queue                          │
│  2. Platform adapter fetches product data                                   │
│  3. Platform adapter normalizes to common Card format                       │
│  4. Upsert into `cards` table with normalized card_name_id                  │
│  5. Mark product_url as processed with timestamp                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API SERVICE                                     │
│  (Serves user requests)                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Normalize card name → lookup card_name_id                               │
│  2. Check Redis cache for singles:card:{id}                                 │
│  3. Cache miss → Query cards table by card_name_id                          │
│  4. Cache result, return to user                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Platform Abstraction Layer

### Core Interfaces

All platform-specific logic is encapsulated behind interfaces, injected via DI:

```typescript
// packages/core/src/platform/platform.interfaces.ts

/**
 * Represents a discovered product from a store's catalog
 * Platform-agnostic - adapters normalize to this format
 */
interface DiscoveredProduct {
  handle: string;              // Unique product identifier within the store
  lastModified?: Date;         // When product was last updated (from sitemap/feed)
  imageUrl?: string;
  imageTitle?: string;         // Often contains card name + set
}

/**
 * Represents a single card variant extracted from a product
 * Platform-agnostic - this is the normalized output format
 */
interface ExtractedCardVariant {
  cardName: string;            // Parsed card name (e.g., "Lightning Bolt")
  setName: string;             // Set name (e.g., "Magic 2010")
  condition: Condition;
  foil: boolean;
  price: number;
  currency: string;
  inStock: boolean;
  quantity?: number;
  imageUrl?: string;
  productUrl: string;          // Direct link to purchase
  sku?: string;
  platformVariantId?: string;  // Platform's internal ID (for deduplication)
}

/**
 * Discovery adapter - fetches product catalog from a store
 * Implementations: ShopifyDiscoveryAdapter, ConductCommerceDiscoveryAdapter
 */
interface IDiscoveryAdapter {
  /**
   * Fetch all product handles from the store's catalog
   * @param store - Store configuration
   * @param collection - MTG singles collection to filter by
   * @returns Stream/iterator of discovered products
   */
  discoverProducts(
    store: Store,
    collection: MtgSinglesCollection
  ): AsyncIterable<DiscoveredProduct>;

  /**
   * Validate if a product belongs to the MTG singles collection
   * @returns true if product is a valid MTG single
   */
  validateProduct(
    store: Store,
    collection: MtgSinglesCollection,
    handle: string
  ): Promise<boolean>;
}

/**
 * Extraction adapter - fetches and normalizes product data
 * Implementations: ShopifyExtractionAdapter, ConductCommerceExtractionAdapter
 */
interface IExtractionAdapter {
  /**
   * Fetch product data and normalize to common format
   * @param store - Store configuration
   * @param handle - Product handle/identifier
   * @returns Array of card variants (one product may have multiple conditions/foils)
   */
  extractProduct(
    store: Store,
    handle: string
  ): Promise<ExtractedCardVariant[]>;
}

/**
 * Platform type enum - determines which adapters to use
 */
enum PlatformType {
  SHOPIFY = 'shopify',
  CONDUCT_COMMERCE = 'conduct_commerce',  // Future: for stores using ConductCommerce
}
```

### Platform Adapter Factory

```typescript
// packages/core/src/platform/platform-adapter.factory.ts

@Injectable()
export class PlatformAdapterFactory {
  constructor(
    private readonly shopifyDiscovery: ShopifyDiscoveryAdapter,
    private readonly shopifyExtraction: ShopifyExtractionAdapter,
    // Future: ConductCommerce adapters (not yet implemented)
    // private readonly conductCommerceDiscovery: ConductCommerceDiscoveryAdapter,
    // private readonly conductCommerceExtraction: ConductCommerceExtractionAdapter,
  ) {}

  getDiscoveryAdapter(platformType: PlatformType): IDiscoveryAdapter {
    switch (platformType) {
      case PlatformType.SHOPIFY:
        return this.shopifyDiscovery;
      case PlatformType.CONDUCT_COMMERCE:
        throw new Error('ConductCommerce adapter not yet implemented');
      default:
        throw new Error(`No discovery adapter for platform: ${platformType}`);
    }
  }

  getExtractionAdapter(platformType: PlatformType): IExtractionAdapter {
    switch (platformType) {
      case PlatformType.SHOPIFY:
        return this.shopifyExtraction;
      case PlatformType.CONDUCT_COMMERCE:
        throw new Error('ConductCommerce adapter not yet implemented');
      default:
        throw new Error(`No extraction adapter for platform: ${platformType}`);
    }
  }
}
```

### Shopify Adapter Implementation (Example)

```typescript
// packages/core/src/platform/adapters/shopify/shopify-discovery.adapter.ts

@Injectable()
export class ShopifyDiscoveryAdapter implements IDiscoveryAdapter {
  async *discoverProducts(
    store: Store,
    collection: MtgSinglesCollection
  ): AsyncIterable<DiscoveredProduct> {
    // 1. Fetch sitemap index
    const sitemapIndex = await this.fetchSitemapIndex(store.baseUrl);

    // 2. Filter to product sitemaps
    const productSitemaps = sitemapIndex.filter(url =>
      url.includes('sitemap_products')
    );

    // 3. Process each sitemap
    for (const sitemapUrl of productSitemaps) {
      const entries = await this.parseSitemap(sitemapUrl);

      for (const entry of entries) {
        const handle = this.extractHandle(entry.loc);

        yield {
          handle,
          lastModified: entry.lastmod ? new Date(entry.lastmod) : undefined,
          imageUrl: entry.image?.loc,
          imageTitle: entry.image?.title,
        };
      }
    }
  }

  async validateProduct(
    store: Store,
    collection: MtgSinglesCollection,
    handle: string
  ): Promise<boolean> {
    // Build collection URL and perform HEAD request
    const collectionUrl = `${store.baseUrl}/collections/${collection.slug}/products/${handle}`;

    try {
      const response = await fetch(collectionUrl, { method: 'HEAD' });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private extractHandle(productUrl: string): string {
    const match = productUrl.match(/\/products\/([^/?]+)/);
    return match ? match[1] : '';
  }

  private async fetchSitemapIndex(baseUrl: string): Promise<string[]> {
    // ... implementation
  }

  private async parseSitemap(url: string): Promise<SitemapEntry[]> {
    // ... implementation
  }
}

// packages/core/src/platform/adapters/shopify/shopify-extraction.adapter.ts

@Injectable()
export class ShopifyExtractionAdapter implements IExtractionAdapter {
  async extractProduct(
    store: Store,
    handle: string
  ): Promise<ExtractedCardVariant[]> {
    // Fetch JSON endpoint
    const jsonUrl = `${store.baseUrl}/products/${handle}.json`;
    const response = await fetch(jsonUrl);
    const { product } = await response.json();

    // Parse card name and set from title
    const { cardName, setName } = this.parseTitle(product.title);

    // Extract variants
    const variants: ExtractedCardVariant[] = [];

    for (const variant of product.variants) {
      const { condition, foil } = this.parseConditionAndFoil(variant);

      variants.push({
        cardName,
        setName,
        condition,
        foil,
        price: parseFloat(variant.price),
        currency: 'CAD',
        inStock: variant.available,
        quantity: variant.inventory_quantity,
        imageUrl: product.images[0]?.src,
        productUrl: `${store.baseUrl}/products/${handle}`,
        sku: variant.sku,
        platformVariantId: String(variant.id),
      });
    }

    return variants;
  }

  private parseTitle(title: string): { cardName: string; setName: string } {
    // "Lightning Bolt [Magic 2010]" → { cardName: "Lightning Bolt", setName: "Magic 2010" }
    const match = title.match(/^(.+?)\s*\[([^\]]+)\]$/);
    if (match) {
      return { cardName: match[1].trim(), setName: match[2].trim() };
    }
    return { cardName: title, setName: '' };
  }

  private parseConditionAndFoil(variant: any): { condition: Condition; foil: boolean } {
    const conditionStr = variant.option1 || variant.title;
    const foilStr = variant.option2 || variant.title;

    const condition = mapCondition(conditionStr);
    const foil = /foil/i.test(foilStr) && !/non-foil/i.test(foilStr);

    return { condition, foil };
  }
}
```

---

## Phase 1: Discovery Service

### Discovery Process (Platform-Agnostic)

```typescript
// apps/discovery/src/discovery.service.ts

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly platformFactory: PlatformAdapterFactory,
    private readonly productUrlRepo: ProductUrlRepository,
    private readonly collectionRepo: MtgSinglesCollectionRepository,
  ) {}

  async discoverStore(store: Store): Promise<DiscoveryResult> {
    const config = store.scraperConfig as StoreDiscoveryConfig;

    // Get platform adapter via DI
    const adapter = this.platformFactory.getDiscoveryAdapter(store.platformType);

    // Get the MTG singles collection for this store
    const collection = await this.collectionRepo.findOneOrFail({
      where: { id: config.mtgSinglesCollectionId }
    });

    let discovered = 0;
    let validated = 0;

    // Stream products from platform adapter
    for await (const product of adapter.discoverProducts(store, collection)) {
      discovered++;

      // Validate product belongs to MTG singles
      const isValid = await adapter.validateProduct(store, collection, product.handle);

      if (isValid) {
        validated++;

        // Upsert to product_urls table
        await this.productUrlRepo.upsert({
          storeId: store.id,
          mtgSinglesCollectionId: collection.id,
          handle: product.handle,
          sitemapLastmod: product.lastModified,
          imageUrl: product.imageUrl,
          imageTitle: product.imageTitle,
          validationStatus: 'valid',
          lastValidatedAt: new Date(),
        });
      }
    }

    return { discovered, validated };
  }
}
```

### Rate Limiting for Discovery

Discovery should be respectful of store servers:
- **Concurrency**: 5-10 concurrent HEAD requests per store
- **Delay**: 100-200ms between requests
- **Scheduling**: Run during off-peak hours (2-4 AM)
- **Incremental**: Only process new/changed URLs based on `lastmod`

---

## Phase 2: Database Schema

### New Tables

```sql
-- E-commerce platforms (normalized)
CREATE TABLE platforms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,               -- e.g., "shopify", "woocommerce", "custom_api"
  display_name VARCHAR(100),               -- e.g., "Shopify", "WooCommerce"
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT uq_platforms_name UNIQUE (name)
);

-- Seed platforms
INSERT INTO platforms (name, display_name) VALUES
  ('shopify', 'Shopify'),
  ('conduct_commerce', 'ConductCommerce');  -- Future support

-- MTG singles collections (normalized - one entry per unique collection slug)
CREATE TABLE mtg_singles_collections (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) NOT NULL,              -- e.g., "mtg-singles-all-products", "magic-singles"
  display_name VARCHAR(255),               -- e.g., "MTG Singles"
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT uq_mtg_singles_collections_slug UNIQUE (slug)
);

CREATE INDEX idx_mtg_singles_collections_slug ON mtg_singles_collections (slug);

-- Canonical card names with numeric IDs for fast lookups
CREATE TABLE card_names (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,   -- lowercase, trimmed
  scryfall_id UUID,                        -- optional link to Scryfall
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT uq_card_names_normalized UNIQUE (normalized_name)
);

CREATE INDEX idx_card_names_normalized ON card_names (normalized_name);
CREATE INDEX idx_card_names_name_trgm ON card_names USING gin (name gin_trgm_ops);

-- Discovered product references from store catalogs
CREATE TABLE product_urls (
  id BIGSERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  mtg_singles_collection_id INTEGER NOT NULL REFERENCES mtg_singles_collections(id),
  handle VARCHAR(255) NOT NULL,            -- product identifier (platform-agnostic)
  sitemap_lastmod TIMESTAMP,               -- when product was last modified in source
  image_url TEXT,
  image_title TEXT,                        -- often contains card name + set

  -- Discovery tracking
  discovered_at TIMESTAMP DEFAULT NOW(),
  last_validated_at TIMESTAMP,
  validation_status VARCHAR(20) DEFAULT 'pending',  -- pending, valid, invalid, error

  -- Extraction tracking
  last_extracted_at TIMESTAMP,
  extraction_status VARCHAR(20) DEFAULT 'pending',  -- pending, success, error
  extraction_error TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT uq_product_urls_store_handle UNIQUE (store_id, handle)
);

CREATE INDEX idx_product_urls_store_status ON product_urls (store_id, extraction_status);
CREATE INDEX idx_product_urls_extraction ON product_urls (extraction_status, last_extracted_at);
CREATE INDEX idx_product_urls_collection ON product_urls (mtg_singles_collection_id);

-- Card price data (platform-agnostic final output)
CREATE TABLE cards (
  id BIGSERIAL PRIMARY KEY,
  card_name_id INTEGER NOT NULL REFERENCES card_names(id),
  store_id INTEGER NOT NULL REFERENCES stores(id),
  product_url_id BIGINT REFERENCES product_urls(id),

  -- Card identification (normalized, platform-agnostic)
  title VARCHAR(500) NOT NULL,             -- full product title
  set_name VARCHAR(255),                   -- e.g., "Magic 2010", "Aetherdrift"
  set_code VARCHAR(10),                    -- e.g., "M10", "DFT"
  collector_number VARCHAR(20),

  -- Variant info
  condition VARCHAR(20) NOT NULL,          -- nm, lp, mp, hp, dmg
  foil BOOLEAN DEFAULT FALSE,

  -- Pricing
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CAD',
  in_stock BOOLEAN DEFAULT TRUE,
  quantity INTEGER,

  -- Links
  image_url TEXT,
  product_url TEXT NOT NULL,               -- direct purchase link
  sku VARCHAR(100),

  -- Platform reference (for deduplication, not exposed to API)
  platform_variant_id VARCHAR(100),        -- platform's internal variant ID

  -- Timestamps
  price_updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT uq_cards_store_platform_variant UNIQUE (store_id, platform_variant_id)
);

-- Critical indexes for card lookups
CREATE INDEX idx_cards_card_name_id ON cards (card_name_id);
CREATE INDEX idx_cards_store_card ON cards (store_id, card_name_id);
CREATE INDEX idx_cards_price ON cards (card_name_id, price);
CREATE INDEX idx_cards_updated ON cards (price_updated_at);

-- Historical price data (for analysis)
CREATE TABLE card_price_history (
  id BIGSERIAL PRIMARY KEY,
  card_id BIGINT NOT NULL,
  card_name_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,

  price DECIMAL(10, 2) NOT NULL,
  condition VARCHAR(20) NOT NULL,
  foil BOOLEAN DEFAULT FALSE,
  in_stock BOOLEAN,

  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_price_history_card_date ON card_price_history (card_id, recorded_at DESC);
CREATE INDEX idx_price_history_name_date ON card_price_history (card_name_id, recorded_at DESC);
```

### Updated Store Entity

```sql
-- Add platform_id to stores table
ALTER TABLE stores ADD COLUMN platform_id INTEGER REFERENCES platforms(id);
ALTER TABLE stores ADD COLUMN discovery_config JSONB;

-- discovery_config structure (platform-agnostic):
-- {
--   "mtgSinglesCollectionId": 1,
--   "discoveryEnabled": true,
--   "discoverySchedule": "0 3 * * 0"
-- }
```

### TypeORM Entities

```typescript
// packages/core/src/database/platform.entity.ts
@Entity('platforms')
export class Platform {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;  // e.g., "shopify", "woocommerce"

  @Column({ name: 'display_name', nullable: true })
  displayName?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// packages/core/src/database/mtg-singles-collection.entity.ts
@Entity('mtg_singles_collections')
export class MtgSinglesCollection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  slug: string;

  @Column({ name: 'display_name', nullable: true })
  displayName?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

// packages/core/src/database/card-name.entity.ts
@Entity('card_names')
export class CardName {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'normalized_name', unique: true })
  normalizedName: string;

  @Column({ name: 'scryfall_id', type: 'uuid', nullable: true })
  scryfallId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

// packages/core/src/database/product-url.entity.ts
@Entity('product_urls')
export class ProductUrl {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ManyToOne(() => Store)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ name: 'store_id' })
  storeId: number;

  @ManyToOne(() => MtgSinglesCollection)
  @JoinColumn({ name: 'mtg_singles_collection_id' })
  mtgSinglesCollection: MtgSinglesCollection;

  @Column({ name: 'mtg_singles_collection_id' })
  mtgSinglesCollectionId: number;

  @Column()
  handle: string;

  @Column({ name: 'sitemap_lastmod', nullable: true })
  sitemapLastmod?: Date;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl?: string;

  @Column({ name: 'image_title', nullable: true })
  imageTitle?: string;

  @Column({ name: 'discovered_at' })
  discoveredAt: Date;

  @Column({ name: 'last_validated_at', nullable: true })
  lastValidatedAt?: Date;

  @Column({ name: 'validation_status', default: 'pending' })
  validationStatus: 'pending' | 'valid' | 'invalid' | 'error';

  @Column({ name: 'last_extracted_at', nullable: true })
  lastExtractedAt?: Date;

  @Column({ name: 'extraction_status', default: 'pending' })
  extractionStatus: 'pending' | 'success' | 'error';

  @Column({ name: 'extraction_error', type: 'text', nullable: true })
  extractionError?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

// packages/core/src/database/card.entity.ts
@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ManyToOne(() => CardName)
  @JoinColumn({ name: 'card_name_id' })
  cardName: CardName;

  @Column({ name: 'card_name_id' })
  cardNameId: number;

  @ManyToOne(() => Store)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ name: 'store_id' })
  storeId: number;

  @Column({ name: 'product_url_id', type: 'bigint', nullable: true })
  productUrlId?: string;

  @Column()
  title: string;

  @Column({ name: 'set_name', nullable: true })
  setName?: string;

  @Column({ name: 'set_code', nullable: true })
  setCode?: string;

  @Column({ name: 'collector_number', nullable: true })
  collectorNumber?: string;

  @Column()
  condition: string;

  @Column({ default: false })
  foil: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ default: 'CAD' })
  currency: string;

  @Column({ name: 'in_stock', default: true })
  inStock: boolean;

  @Column({ nullable: true })
  quantity?: number;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl?: string;

  @Column({ name: 'product_url', type: 'text' })
  productUrl: string;

  @Column({ nullable: true })
  sku?: string;

  // Internal reference for deduplication - not exposed to API
  @Column({ name: 'platform_variant_id', nullable: true })
  platformVariantId?: string;

  @Column({ name: 'price_updated_at' })
  priceUpdatedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

// Updated Store entity
@Entity('stores')
export class Store {
  // ... existing fields ...

  @ManyToOne(() => Platform)
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @Column({ name: 'platform_id', nullable: true })
  platformId?: number;

  @Column({ name: 'discovery_config', type: 'jsonb', nullable: true })
  discoveryConfig?: StoreDiscoveryConfig;
}

interface StoreDiscoveryConfig {
  mtgSinglesCollectionId: number;
  discoveryEnabled: boolean;
  discoverySchedule?: string;  // Cron expression
}
```

---

## Phase 3: Extraction Service

### Extraction Process (Platform-Agnostic)

```typescript
// apps/extraction/src/extraction.service.ts

@Injectable()
export class ExtractionService {
  constructor(
    private readonly platformFactory: PlatformAdapterFactory,
    private readonly productUrlRepo: ProductUrlRepository,
    private readonly cardRepo: CardRepository,
    private readonly cardNameService: CardNameService,
  ) {}

  async extractProduct(productUrl: ProductUrl, store: Store): Promise<void> {
    // Get platform adapter via DI
    const adapter = this.platformFactory.getExtractionAdapter(store.platform.name);

    try {
      // Extract product data (platform adapter handles normalization)
      const variants = await adapter.extractProduct(store, productUrl.handle);

      for (const variant of variants) {
        // Get or create card_name_id
        const cardNameId = await this.cardNameService.getOrCreate(variant.cardName);

        // Upsert card (platform-agnostic data)
        await this.cardRepo.upsert({
          cardNameId,
          storeId: store.id,
          productUrlId: productUrl.id,
          title: `${variant.cardName} [${variant.setName}]`,
          setName: variant.setName,
          condition: variant.condition,
          foil: variant.foil,
          price: variant.price,
          currency: variant.currency,
          inStock: variant.inStock,
          quantity: variant.quantity,
          imageUrl: variant.imageUrl,
          productUrl: variant.productUrl,
          sku: variant.sku,
          platformVariantId: variant.platformVariantId,
          priceUpdatedAt: new Date(),
        });
      }

      // Mark extraction complete
      await this.productUrlRepo.update(productUrl.id, {
        extractionStatus: 'success',
        lastExtractedAt: new Date(),
        extractionError: null,
      });
    } catch (error) {
      await this.productUrlRepo.update(productUrl.id, {
        extractionStatus: 'error',
        extractionError: error.message,
      });
      throw error;
    }
  }
}
```

### Card Name Normalization

```typescript
// packages/core/src/card-name/card-name.service.ts

@Injectable()
export class CardNameService {
  constructor(
    private readonly cardNameRepo: CardNameRepository,
  ) {}

  normalize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }

  async getOrCreate(name: string): Promise<number> {
    const normalized = this.normalize(name);

    let cardName = await this.cardNameRepo.findOne({
      where: { normalizedName: normalized }
    });

    if (!cardName) {
      cardName = await this.cardNameRepo.save({
        name: name,
        normalizedName: normalized,
      });
    }

    return cardName.id;
  }
}
```

---

## Phase 4: API Changes

### Updated Card Search Flow

```typescript
// apps/api/src/card/card.service.ts

@Injectable()
export class CardService {
  constructor(
    private readonly cardNameService: CardNameService,
    private readonly cardRepo: CardRepository,
    private readonly cacheService: CacheService,
  ) {}

  async searchCard(cardName: string): Promise<CardSearchResponse> {
    const normalized = this.cardNameService.normalize(cardName);

    // 1. Lookup card_name_id
    const cardNameEntity = await this.cardNameService.findByNormalized(normalized);

    if (!cardNameEntity) {
      // Card name not in our database - could fallback to legacy scraping
      return this.legacySearch(cardName);
    }

    // 2. Check Redis cache (keyed by card_name_id with singles: prefix)
    const cacheKey = `singles:card:${cardNameEntity.id}`;
    const cached = await this.cacheService.get<CardSearchResponse>(cacheKey);

    if (cached && !this.isStale(cached)) {
      return cached;
    }

    // 3. Query database (platform-agnostic data)
    const cards = await this.cardRepo.find({
      where: {
        cardNameId: cardNameEntity.id,
        inStock: true,
      },
      relations: ['store'],
      order: { price: 'ASC' },
    });

    // 4. Transform to response format (no platform-specific fields exposed)
    const response = this.buildResponse(cardName, cards);

    // 5. Cache result
    await this.cacheService.set(cacheKey, response, 300);

    return response;
  }

  private buildResponse(cardName: string, cards: Card[]): CardSearchResponse {
    const storeMap = new Map<number, StoreInfo>();
    const results: CardWithStore[] = [];

    for (const card of cards) {
      if (!storeMap.has(card.storeId)) {
        storeMap.set(card.storeId, {
          id: card.store.id,
          uuid: card.store.uuid,
          name: card.store.name,
          displayName: card.store.displayName,
          logoUrl: card.store.logoUrl,
          cardCount: 0,
        });
      }
      storeMap.get(card.storeId)!.cardCount++;

      // Response is platform-agnostic - no Shopify/etc fields
      results.push({
        price: card.price,
        condition: card.condition as Condition,
        foil: card.foil,
        image: card.imageUrl,
        title: card.title,
        currency: card.currency,
        link: card.productUrl,
        set: card.setName,
        card_number: card.collectorNumber,
        store: card.store.displayName,
      });
    }

    const prices = cards.map(c => card.price);
    const priceStats: PriceStats = prices.length > 0 ? {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length,
    } : { min: 0, max: 0, avg: 0, count: 0 };

    return {
      cardName,
      stores: Array.from(storeMap.values()),
      priceStats,
      results,
      timestamp: Date.now(),
    };
  }
}
```

### Cache Key Format

**Before (V1):**
```
card:lightning bolt:store:f2f
card:lightning bolt:store:401-games
... (7 keys per card)
```

**After (V2):**
```
singles:card:12345  (where 12345 is card_name_id)
```

Benefits:
- Single cache key per card (not per store)
- `singles:` prefix clearly identifies MTG singles data
- Numeric keys are faster to index
- Smaller memory footprint

---

## Phase 5: Legacy Store Support (V1 Scrapers)

During the transition period, V1 scrapers (F2F, 401, Hobbies, BinderPOS) will continue running until:
- Shopify stores are migrated to the V2 discovery/extraction pipeline
- ConductCommerce adapter is implemented for applicable stores

### Hybrid Approach (Recommended)

Keep V1 scrapers running but write results to the normalized `cards` table for unified API access:

```typescript
// apps/scraper/src/scraper/scraper.processor.ts

async processLegacyScrape(job: Job<ScrapeCardJobData>): Promise<void> {
  const { cardName, storeName } = job.data;

  // Use existing V1 scraper
  const result = await this.scraperService.searchCardAtStore(cardName, storeName);

  if (result.results.length > 0) {
    const cardNameId = await this.cardNameService.getOrCreate(cardName);

    for (const card of result.results) {
      await this.cardRepo.upsert({
        cardNameId,
        storeId: result.storeId,
        title: card.title,
        setName: card.set,
        condition: card.condition,
        foil: card.foil,
        price: card.price,
        currency: card.currency,
        inStock: true,
        imageUrl: card.image,
        productUrl: card.link,
        platformVariantId: `legacy:${storeName}:${card.link}`,  // Synthetic ID
        priceUpdatedAt: new Date(),
      });
    }
  }
}
```

This approach ensures all card data (V1 and V2) is queryable from a single `cards` table.

---

## Phase 6: Data Expiration & Archival

### Freshness Tiers

| Data Age | Status | Action |
|----------|--------|--------|
| < 1 hour | Fresh | Serve from cache/DB directly |
| 1-24 hours | Stale | Serve, but queue for refresh |
| 24-72 hours | Aging | Lower priority, mark as "price may have changed" |
| > 72 hours | Expired | Move to history table, trigger re-extraction |

### Archival Options

**Option A: PostgreSQL Partitioning**
```sql
CREATE TABLE card_price_history (...) PARTITION BY RANGE (recorded_at);
```

**Option B: TimescaleDB**
```sql
SELECT create_hypertable('card_price_history', 'recorded_at');
SELECT add_retention_policy('card_price_history', INTERVAL '1 year');
```

**Option C: Cold Storage Export**
- Export old data to S3/Parquet files
- Keep 90 days in PostgreSQL
- Archive older data for analytics

---

## Migration Path

### Step 1: Schema Migration
1. Create new tables (`platforms`, `mtg_singles_collections`, `card_names`, `product_urls`, `cards`)
2. Add `platform_id` and `discovery_config` to stores
3. Keep existing Redis cache and V1 scrapers working

### Step 2: Platform Adapters
1. Implement `IDiscoveryAdapter` and `IExtractionAdapter` interfaces
2. Create Shopify adapter implementations
3. Create `PlatformAdapterFactory` with DI registration

### Step 3: Discovery Service
1. Run discovery for one pilot store
2. Validate URL filtering accuracy
3. Monitor rate limiting and errors

### Step 4: Extraction Service
1. Process discovered products
2. Validate data quality
3. Compare with V1 scraper results

### Step 5: API Migration
1. Add feature flag: `USE_DATABASE_FIRST`
2. API checks DB first, falls back to V1 on miss
3. Monitor for gaps

### Step 6: Full Rollout
1. Enable discovery for all Shopify-based stores
2. Gradually deprecate V1 scrapers for migrated stores
3. Implement ConductCommerce adapter when stores become available

---

## Open Questions

1. **Scryfall integration**: Should we link `card_names` to Scryfall for metadata enrichment?

2. **Real-time refresh**: Should user searches trigger immediate re-extraction for stale products?

3. **Price alerts**: With historical data, we could offer price drop notifications - future feature?

4. **Collection auto-discovery**: Can we detect MTG singles collection slugs automatically?

5. **ConductCommerce stores**: Which stores will use ConductCommerce, and what does their API/sitemap structure look like?
