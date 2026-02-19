# V2 Extraction Pipeline - Implementation Plan

> This document outlines the complete V2 scraping system with unified storage across all platforms.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Platform Adapters](#platform-adapters)
5. [Workflow](#workflow)
6. [Batch Processing](#batch-processing)
7. [Caching Strategy](#caching-strategy)
8. [Implementation Order](#implementation-order)

---

## Overview

### Goals

- **Unified storage**: All stores write to PostgreSQL (no more Redis-only caching)
- **Multiple adapters**: Extensible platform adapter pattern (Shopify initially, more later)
- **Daily refresh**: Scheduled discovery and extraction for all stores
- **Efficient writes**: Batch upserts with UNNEST, skip unchanged rows
- **Out-of-stock tracking**: Keep cards with `in_stock=false, quantity=0`

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | PostgreSQL only | Unified queries, persistent data |
| Out-of-stock | Keep with quantity=0 | "Out of stock at $X" info, notify features |
| Batch writes | UNNEST + conditional upsert | Skip unchanged rows, reduce WAL writes |
| Discovery/Extraction | Combined (single pass) | Simpler, fewer moving parts |
| Staleness | `last_checked_at` on product_urls | Delete cards from unchecked products |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVICES                                        │
├─────────────────┬─────────────────┬─────────────────────────────────────────┤
│       API       │    Scheduler    │               Scraper                   │
├─────────────────┼─────────────────┼─────────────────────────────────────────┤
│ • Card search   │ • Discovery     │ • Platform adapters                     │
│ • Price compare │   cron (2 AM)   │ • Extraction logic                      │
│ • User features │ • Cleanup cron  │ • Batch accumulator                     │
│ • Redis cache   │   (4 AM)        │ • Rate limiting                         │
├─────────────────┼─────────────────┼─────────────────────────────────────────┤
│ Replicas: 2-3   │ Replicas: 1     │ Replicas: 3-10                          │
└─────────────────┴─────────────────┴─────────────────────────────────────────┘
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Scheduler  │────→│    Queue     │────→│   Scraper    │
│  (Discovery) │     │   (Redis)    │     │ (Extraction) │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ↓
                                          ┌──────────────┐
                                          │  PostgreSQL  │
                                          │  (cards)     │
                                          └──────┬───────┘
                                                 │
                                                 ↓
                                          ┌──────────────┐
                                          │     API      │
                                          │  (queries)   │
                                          └──────────────┘
```

---

## Database Schema

### Core Tables

```sql
-- Stores configuration
CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  base_url TEXT NOT NULL,
  platform_type VARCHAR(50),  -- 'shopify' (extensible for future platforms)
  discovery_config JSONB,     -- Platform-specific config
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Discovered product URLs
CREATE TABLE product_urls (
  id BIGSERIAL PRIMARY KEY,
  store_id INT NOT NULL REFERENCES stores(id),
  handle VARCHAR(255) NOT NULL,
  last_checked_at TIMESTAMP,           -- When we last extracted this product
  extraction_status VARCHAR(20) DEFAULT 'pending',
  extraction_error TEXT,
  variants_total INT,                  -- Total variants in product
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, handle)
);

-- Normalized card names
CREATE TABLE card_names (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) UNIQUE NOT NULL,
  scryfall_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Card inventory (ALL variants, in-stock and out-of-stock)
CREATE TABLE cards (
  id BIGSERIAL PRIMARY KEY,
  card_name_id INT NOT NULL REFERENCES card_names(id),
  store_id INT NOT NULL REFERENCES stores(id),
  product_url_id BIGINT NOT NULL REFERENCES product_urls(id),
  title VARCHAR(500) NOT NULL,
  set_name VARCHAR(255),
  set_code VARCHAR(10),
  collector_number VARCHAR(20),
  condition VARCHAR(20) NOT NULL,
  foil BOOLEAN DEFAULT false,
  price NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CAD',
  in_stock BOOLEAN NOT NULL,           -- Fast filter for availability
  quantity INT,                        -- Stock count (0 if out of stock)
  image_url TEXT,
  product_link TEXT NOT NULL,
  sku VARCHAR(100),
  platform_variant_id VARCHAR(100),    -- Unique ID from platform
  price_updated_at TIMESTAMP NOT NULL, -- When price was last updated
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, platform_variant_id)
);
```

### Indexes

```sql
-- Fast in-stock queries (partial index)
CREATE INDEX idx_cards_in_stock_card_name_price
  ON cards (card_name_id, price) WHERE in_stock = true;

CREATE INDEX idx_cards_in_stock_store_card_name
  ON cards (store_id, card_name_id) WHERE in_stock = true;

-- Staleness tracking
CREATE INDEX idx_product_urls_last_checked
  ON product_urls (last_checked_at);

-- Card name lookups
CREATE INDEX idx_card_names_normalized
  ON card_names (normalized_name);
CREATE INDEX idx_card_names_name_trgm
  ON card_names USING gin (name gin_trgm_ops);
```

---

## Platform Adapters

### Adapter Interface

```typescript
interface PlatformAdapter {
  /**
   * Discover all MTG singles products from the store.
   */
  discoverProducts(store: Store): Promise<DiscoveredProduct[]>;

  /**
   * Extract card variants from a single product.
   */
  extractProduct(store: Store, handle: string): Promise<ExtractedCardVariant[]>;
}

interface DiscoveredProduct {
  handle: string;
  url?: string;
  lastModified?: Date;
  imageUrl?: string;
  title?: string;
}

interface ExtractedCardVariant {
  cardName: string;
  setName?: string;
  setCode?: string;
  collectorNumber?: string;
  condition: string;
  foil: boolean;
  price: number;
  currency: string;
  inStock: boolean;
  quantity?: number;
  imageUrl?: string;
  productUrl: string;
  sku?: string;
  platformVariantId: string;
}
```

### Shopify Adapter

All current stores use the Shopify platform. Additional adapters can be added later by implementing the `PlatformAdapter` interface.

```typescript
class ShopifyAdapter implements PlatformAdapter {
  async discoverProducts(store: Store): Promise<DiscoveredProduct[]> {
    // 1. Fetch sitemap.xml
    // 2. Parse product handles
    // 3. Optionally validate against MTG collection (HEAD requests)
    return products;
  }

  async extractProduct(store: Store, handle: string): Promise<ExtractedCardVariant[]> {
    // GET /products/{handle}.json
    // Parse Shopify product JSON
    return variants;
  }
}
```

### Adapter Factory

```typescript
class PlatformAdapterFactory {
  getAdapter(store: Store): PlatformAdapter {
    switch (store.platformType) {
      case 'shopify': return this.shopifyAdapter;
      // Future adapters can be added here
      default: throw new Error(`Unknown platform: ${store.platformType}`);
    }
  }
}
```

---

## Workflow

### Daily Schedule

```
TIME     EVENT
─────────────────────────────────────────────────────────
02:00    Scheduler: Start discovery for all stores
         │
         ├─ For each store:
         │   1. Get adapter for platform
         │   2. Discover products (sitemap, crawl, etc.)
         │   3. Queue extraction jobs
         │
02:00-   Scraper workers: Process extraction queue
06:00    │
         ├─ For each job:
         │   1. Extract product (GET JSON or scrape)
         │   2. Parse variants
         │   3. Add to batch accumulator
         │   4. Flush when batch full (100 cards)
         │
04:00    Scheduler: Cleanup stale data
         │
         └─ DELETE cards WHERE product_url.last_checked_at < 48h
```

### Combined Discovery + Extraction (Alternative)

If queues are not needed, use single-pass approach:

```typescript
async extractStore(store: Store): Promise<void> {
  const adapter = this.adapterFactory.getAdapter(store);

  // 1. Discover all products
  const products = await adapter.discoverProducts(store);

  // 2. Extract and save in batches
  for (const batch of chunk(products, 50)) {
    const allCards: PendingCard[] = [];

    for (const product of batch) {
      const variants = await adapter.extractProduct(store, product.handle);
      const cards = await this.buildCards(store.id, product.handle, variants);
      allCards.push(...cards);

      await this.rateLimiter.wait(store.id);
    }

    await this.batchUpsert(store.id, allCards);
  }
}
```

---

## Batch Processing

### Batch Accumulator

```typescript
class BatchAccumulatorService {
  private pending: Map<number, PendingCard[]> = new Map();
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000;

  async addCards(storeId: number, cards: PendingCard[]): Promise<void> {
    const pending = this.pending.get(storeId) || [];
    pending.push(...cards);
    this.pending.set(storeId, pending);

    if (pending.length >= this.BATCH_SIZE) {
      await this.flushStore(storeId);
    }
  }

  async flushStore(storeId: number): Promise<void> {
    const cards = this.pending.get(storeId) || [];
    if (cards.length === 0) return;

    this.pending.set(storeId, []);
    await this.batchUpsert(storeId, cards);
  }
}
```

### UNNEST Batch Upsert

```sql
-- Single query for many cards
INSERT INTO cards (
  card_name_id, store_id, product_url_id, title, price,
  in_stock, quantity, platform_variant_id, price_updated_at
)
SELECT
  unnest($1::int[]),      -- card_name_ids
  $2::int,                -- store_id
  unnest($3::bigint[]),   -- product_url_ids
  unnest($4::text[]),     -- titles
  unnest($5::numeric[]),  -- prices
  unnest($6::boolean[]),  -- in_stocks
  unnest($7::int[]),      -- quantities
  unnest($8::text[]),     -- platform_variant_ids
  NOW()
ON CONFLICT (store_id, platform_variant_id) DO UPDATE SET
  price = EXCLUDED.price,
  in_stock = EXCLUDED.in_stock,
  quantity = EXCLUDED.quantity,
  price_updated_at = NOW()
WHERE
  -- Only update if values actually changed (reduces WAL writes)
  cards.price IS DISTINCT FROM EXCLUDED.price
  OR cards.in_stock IS DISTINCT FROM EXCLUDED.in_stock
  OR cards.quantity IS DISTINCT FROM EXCLUDED.quantity;
```

### Insert vs Update Counts

```sql
-- Use xmax to distinguish inserts from updates
WITH upserted AS (
  INSERT INTO cards (...) VALUES (...)
  ON CONFLICT DO UPDATE SET ...
  RETURNING xmax
)
SELECT
  COUNT(*) FILTER (WHERE xmax = 0) AS inserted,
  COUNT(*) FILTER (WHERE xmax != 0) AS updated
FROM upserted;
```

---

## Caching Strategy

### Redis Cache Layer

```typescript
async searchCards(cardName: string): Promise<Card[]> {
  const cacheKey = `search:${normalizeCardName(cardName)}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Query database
  const cards = await this.queryCards(cardName);

  // Cache with TTL (5 minutes)
  await redis.setex(cacheKey, 300, JSON.stringify(cards));

  return cards;
}
```

### Cache Invalidation

Option 1: **Short TTL** (simple)
```typescript
// Just let cache expire naturally (5 min TTL)
await redis.setex(cacheKey, 300, data);
```

Option 2: **Version-based** (accurate, scalable)
```typescript
// Increment store version after batch
await redis.incr(`store:version:${storeId}`);

// Check versions on cache read
const cached = await redis.get(cacheKey);
const entry = JSON.parse(cached);
const isStale = await this.checkVersions(entry.storeVersions);
if (isStale) return queryAndCache();
```

---

## Implementation Order

### Phase 1: Database Schema (Week 1)
- [ ] Migration: Add `last_checked_at` to product_urls
- [ ] Migration: Add partial indexes for in_stock queries
- [ ] Update seed with platform configurations

### Phase 2: Platform Adapters (Week 2)
- [ ] Create PlatformAdapter interface
- [ ] Implement ShopifyAdapter (discovery + extraction)
- [ ] Create PlatformAdapterFactory
- [ ] (Future: additional adapters as needed)

### Phase 3: Batch Processing (Week 3)
- [ ] Implement BatchAccumulatorService
- [ ] Implement UNNEST batch upsert
- [ ] Add conditional update (skip unchanged)
- [ ] Unit tests for batch logic

### Phase 4: Scheduler Integration (Week 4)
- [ ] Discovery cron job (2 AM)
- [ ] Cleanup cron job (4 AM)
- [ ] Rate limiting per store
- [ ] Error handling and retries

### Phase 5: API Updates (Week 5)
- [ ] Update card search to query PostgreSQL
- [ ] Add Redis cache layer
- [ ] Support out-of-stock display
- [ ] Performance testing

---

## Store Configuration Examples

All stores currently use the Shopify platform:

```typescript
const stores = [
  {
    name: 'face-to-face-games',
    platformType: 'shopify',
    discoveryConfig: {
      mtgSinglesCollection: 'magic-the-gathering-singles',
    },
  },
  {
    name: 'exor-games',
    platformType: 'shopify',
    discoveryConfig: {
      mtgSinglesCollection: 'mtg-singles',
    },
  },
  {
    name: 'house-of-cards',
    platformType: 'shopify',
    discoveryConfig: {
      mtgSinglesCollection: 'mtg-singles',
    },
  },
  // Additional Shopify stores...
];
```

---

## Metrics to Track

```typescript
interface ExtractionMetrics {
  // Throughput
  productsExtractedPerMinute: number;
  cardsUpsertedPerMinute: number;

  // Efficiency
  unchangedCardRate: number;      // Cards skipped (no change)
  batchFlushSize: number;         // Average batch size

  // Errors
  extractionErrorRate: number;
  rateLimitHitRate: number;

  // Latency
  avgExtractionTimeMs: number;
  avgBatchFlushTimeMs: number;
}
```

---

## Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| Discovery | Shopify adapter | Find products (sitemap, collection validation) |
| Extraction | Shopify adapter | Get card data (product JSON) |
| Storage | PostgreSQL | Unified card inventory |
| Caching | Redis | Fast user queries |
| Scheduling | NestJS cron | Daily refresh |
| Batching | UNNEST + conditional | Efficient writes |
