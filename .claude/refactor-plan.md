# V2 Extraction Pipeline Implementation Plan

## Overview

Upgrade the existing scheduler and scraper services to support the V2 extraction pipeline. No new apps — the scheduler stays lightweight (cron + enqueue), the scraper handles all heavy I/O (discovery + extraction) via queues.

1. **Schema migration** — New `cards`, `card_printings`, `card_listings` tables; replace `card_names` and rename old `cards`
2. **Scryfall seed** — Bulk load all MTG cards and printings from Scryfall with staging table strategy
3. **Proxy consolidation** — Move shared proxy logic into `@scoutlgs/core`
4. **Discovery in scraper** — Move discovery processing from scheduler to scraper via `product-discovery` queue
5. **Extraction improvements** — Match to card_printings by set_code + collector_number, batch upsert, all variants
6. **API v1 endpoints** (`/api/v1/`) — Read-only from PostgreSQL, search by card name via oracle_id

---

## Current State (What Already Exists)

### Foundation (complete)
- Core entities (will be replaced/renamed): `Card`, `CardName`, `ProductUrl`, `Platform`, `MtgSinglesCollection`, `CardPriceHistory`, `Store`
- Platform module: `ShopifyDiscoveryAdapter`, `ShopifyExtractionAdapter`, `PlatformAdapterFactory`
- Queue types: `PRODUCT_DISCOVERY`, `PRODUCT_EXTRACTION` queues registered with job types
- Queue service: `enqueueDiscoveryJob()`, `enqueueExtractionJobsBulk()` already exist
- Database migrations: Discovery schema, variants_total, in-stock partial indexes

### Discovery (in scheduler, working)
- `apps/scheduler/src/discovery/` — complete with service, scheduler, proxy, integration test
- Will be simplified: scheduler just enqueues discovery jobs, scraper does the work

### Extraction (in scraper, working but needs improvements)
- `apps/scraper/src/extraction/` — processor with concurrency 20, rate limiting, backoff/jitter
- **Limitations**: one-at-a-time TypeORM upserts, individual card name lookups, in-stock only

---

## Part 1: Schema Migration

### New Tables

See `docs/erd.md` for full ERD.

**`cards`** (one row per unique MTG card — ~30,000 rows)
```sql
CREATE TABLE cards (
  id              SERIAL PRIMARY KEY,
  oracle_id       UUID NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  type_line       VARCHAR(255),
  mana_cost       VARCHAR(50),
  cmc             DECIMAL(4,1),
  colors          TEXT[],
  color_identity  TEXT[],
  keywords        TEXT[],
  legalities      JSONB,
  image_uri       TEXT,
  last_synced_at  TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cards_name ON cards (name);
CREATE INDEX idx_cards_name_trgm ON cards USING GIN (name gin_trgm_ops);
```

**`card_printings`** (one row per set printing — ~100,000+ rows)
```sql
CREATE TABLE card_printings (
  id                BIGSERIAL PRIMARY KEY,
  card_id           INT NOT NULL REFERENCES cards(id),
  set_code          VARCHAR(10) NOT NULL,
  set_name          VARCHAR(255),
  collector_number  VARCHAR(20) NOT NULL,
  scryfall_id       UUID,
  image_uri         TEXT,
  rarity            VARCHAR(20),
  last_synced_at    TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE(set_code, collector_number)
);
CREATE INDEX idx_card_printings_card_id ON card_printings (card_id);
CREATE INDEX idx_card_printings_scryfall_id ON card_printings (scryfall_id);
```

**`card_listings`** (renamed from old `cards` — store inventory)
```sql
CREATE TABLE card_listings (
  id                    BIGSERIAL PRIMARY KEY,
  card_printing_id      BIGINT REFERENCES card_printings(id),
  store_id              INT NOT NULL REFERENCES stores(id),
  product_url_id        BIGINT NOT NULL REFERENCES product_urls(id),
  condition             VARCHAR(20) NOT NULL,
  foil                  BOOLEAN DEFAULT FALSE,
  price                 DECIMAL(10,2) NOT NULL,
  currency              VARCHAR(3) DEFAULT 'CAD',
  in_stock              BOOLEAN DEFAULT TRUE,
  quantity              INT,
  product_link          TEXT NOT NULL,
  sku                   VARCHAR(100),
  platform_variant_id   VARCHAR(100),
  raw_title             VARCHAR(500),
  price_updated_at      TIMESTAMP DEFAULT NOW(),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, platform_variant_id)
);
CREATE INDEX idx_card_listings_printing_price ON card_listings (card_printing_id, price);
CREATE INDEX idx_card_listings_in_stock ON card_listings (card_printing_id) WHERE in_stock = true;
CREATE INDEX idx_card_listings_updated ON card_listings (price_updated_at);
```

### Migration Strategy

1. Create new `cards` and `card_printings` tables (no conflict with existing)
2. Rename existing `cards` → `card_listings`, adjust columns
3. Add `card_printing_id` column to `card_listings` (nullable initially)
4. Drop `card_names` table after data is migrated
5. Update `card_price_history` FKs: `card_id` → `card_listing_id`, `card_name_id` → `card_printing_id`

### Entity Changes

| Current Entity | New Entity | Package |
|---------------|------------|---------|
| `CardName` | `Card` | `@scoutlgs/core` |
| `Card` | `CardListing` | `@scoutlgs/core` |
| — | `CardPrinting` | `@scoutlgs/core` |
| `CardPriceHistory` | `CardPriceHistory` (updated FKs) | `@scoutlgs/core` |

---

## Part 2: Scryfall Seed (Staging Table Strategy)

### Overview

Bulk load ALL Magic: The Gathering cards from Scryfall into `cards` and `card_printings` tables. Uses a staging table strategy for maximum throughput.

**Data sources:**
- **Oracle Cards** (~169 MB, ~30k unique cards) → `cards` table
- **Default Cards** (~526 MB, ~100k+ printings) → `card_printings` table

### Seed Command

```bash
nx run api:seed              # Seeds stores + MTG collections (existing)
nx run api:seed:scryfall     # Seeds all MTG cards from Scryfall bulk data (NEW)
nx run api:seed:set MH3      # Seeds a single set incrementally (NEW)
```

### Files to Create

```
apps/api/src/database/
├── seed.ts                         (existing, keep)
├── seed-scryfall.ts                (NEW - full bulk seed)
├── seed-scryfall-set.ts            (NEW - incremental set seed)
└── migrations/
    └── XXXX-SchemaV2.ts            (NEW - migration for new tables)
```

### Full Seed Strategy (`seed-scryfall.ts`)

**Step 1: Download bulk data files**
```
Download Oracle Cards JSON    → stream to temp file
Download Default Cards JSON   → stream to temp file
```

**Step 2: Create staging tables**
```sql
CREATE TEMP TABLE staging_cards (
  oracle_id       UUID,
  name            VARCHAR(255),
  type_line       VARCHAR(255),
  mana_cost       VARCHAR(50),
  cmc             DECIMAL(4,1),
  colors          TEXT[],
  color_identity  TEXT[],
  keywords        TEXT[],
  legalities      JSONB,
  image_uri       TEXT
);

CREATE TEMP TABLE staging_printings (
  oracle_id          UUID,
  set_code           VARCHAR(10),
  set_name           VARCHAR(255),
  collector_number   VARCHAR(20),
  scryfall_id        UUID,
  image_uri          TEXT,
  rarity             VARCHAR(20)
);
```

**Step 3: Stream JSON and COPY into staging tables**
- Use streaming JSON parser (e.g., `stream-json`) to avoid loading 526 MB into memory
- Pipe parsed records into PostgreSQL `COPY FROM STDIN` for staging tables
- Filter: only include `layout` types that are playable cards (skip tokens, emblems, art cards)

```typescript
// Pseudocode for streaming approach
const pipeline = fetch(oracleCardsUrl)
  .pipe(StreamArray())           // Parse JSON array items one at a time
  .pipe(filterPlayableCards())   // Skip tokens, emblems, etc.
  .pipe(toCsvRow())              // Convert to CSV for COPY
  .pipe(pgCopyStream());         // COPY FROM STDIN into staging_cards
```

**Step 4: Upsert from staging into production**
```sql
-- Upsert cards (oracle-level)
INSERT INTO cards (oracle_id, name, type_line, mana_cost, cmc, colors, color_identity, keywords, legalities, image_uri, last_synced_at)
SELECT oracle_id, name, type_line, mana_cost, cmc, colors, color_identity, keywords, legalities, image_uri, NOW()
FROM staging_cards
ON CONFLICT (oracle_id) DO UPDATE SET
  name = EXCLUDED.name,
  type_line = EXCLUDED.type_line,
  mana_cost = EXCLUDED.mana_cost,
  cmc = EXCLUDED.cmc,
  colors = EXCLUDED.colors,
  color_identity = EXCLUDED.color_identity,
  keywords = EXCLUDED.keywords,
  legalities = EXCLUDED.legalities,
  image_uri = EXCLUDED.image_uri,
  last_synced_at = NOW(),
  updated_at = NOW();

-- Upsert card_printings (set-level)
INSERT INTO card_printings (card_id, set_code, set_name, collector_number, scryfall_id, image_uri, rarity, last_synced_at)
SELECT c.id, sp.set_code, sp.set_name, sp.collector_number, sp.scryfall_id, sp.image_uri, sp.rarity, NOW()
FROM staging_printings sp
JOIN cards c ON c.oracle_id = sp.oracle_id
ON CONFLICT (set_code, collector_number) DO UPDATE SET
  scryfall_id = EXCLUDED.scryfall_id,
  image_uri = EXCLUDED.image_uri,
  rarity = EXCLUDED.rarity,
  last_synced_at = NOW(),
  updated_at = NOW();
```

**Step 5: Drop staging tables** (automatic for TEMP tables)

### Performance Expectations

| Step | Time Estimate |
|------|---------------|
| Download Oracle Cards (169 MB) | ~5s |
| Download Default Cards (526 MB) | ~15s |
| Stream + COPY into staging_cards | ~5s |
| Stream + COPY into staging_printings | ~15s |
| Upsert cards (30k rows) | ~2s |
| Upsert card_printings (100k+ rows) | ~5s |
| **Total** | **~45-60s** |

### Incremental Set Seed (`seed-scryfall-set.ts`)

For when new MTG sets release. Uses the Scryfall search API instead of bulk data.

```bash
nx run api:seed:set MH3    # Seed Modern Horizons 3
nx run api:seed:set FDN    # Seed Foundations
```

**Implementation:**
```
1. Fetch all cards in set:
   GET https://api.scryfall.com/cards/search?q=set:{setCode}&unique=prints
   (paginate through all results, ~300-500 cards per set)

2. Create staging tables (same as full seed)

3. Insert fetched cards into staging

4. Upsert from staging → cards (new oracle_ids only)
   Upsert from staging → card_printings (new printings)

5. Log: "Added X new cards, Y new printings for set {setCode}"
```

**Scryfall API rate limit:** 75ms between requests. Pagination returns ~175 cards per page, so a 500-card set needs 3 pages = ~225ms total API time.

### Scheduler Integration (optional future)

Could add a weekly cron to check for new sets and auto-seed:
```
GET https://api.scryfall.com/sets → check for sets with released_at in last 7 days
→ For each new set, run incremental seed
```

Not needed for initial implementation — manual `seed:set` is sufficient.

---

## Part 3: Proxy Consolidation into @scoutlgs/core

### Problem
The scheduler and scraper each have nearly-identical proxy services:
- `apps/scheduler/src/discovery/proxy.service.ts` (`DiscoveryProxyService`)
- `apps/scraper/src/scraper/proxy/proxy.service.ts` (`ProxyService`)

Both use Webshare rotating proxies, LRU-cached `ProxyAgent` instances, and Redis-based counter rotation.

### Files to Create

```
packages/core/src/proxy/
├── proxy.module.ts
├── proxy.service.ts
└── index.ts
```

### Implementation

**proxy.service.ts**
- Merge both services into a single `ProxyService` in core
- Keep the `scraperType` parameter (more flexible)
- Same LRU cache, same Webshare config, same Redis counter rotation

**proxy.module.ts**
- Import CacheModule (for Redis counter)
- Export ProxyService

### Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Export ProxyModule, ProxyService |
| `apps/scraper/src/extraction/extraction.module.ts` | Import ProxyModule from core |
| `apps/scraper/src/extraction/extraction.service.ts` | Use ProxyService from core |
| `apps/scraper/src/scraper/scraper.module.ts` | Import ProxyModule from core |

### Files to Delete
- `apps/scheduler/src/discovery/proxy.service.ts`
- `apps/scraper/src/scraper/proxy/proxy.service.ts`

---

## Part 4: Discovery Processing in Scraper

Move the heavy discovery work (sitemap crawl, HEAD validation, ProductUrl upsert) from the scheduler into the scraper as a queue processor.

### Architecture

**Scheduler** (lightweight trigger):
- Cron fires at 1 AM (or manual trigger)
- Queries active stores with discovery enabled
- Enqueues one `discover-store` job per store to `product-discovery` queue
- That's it — no HTTP requests, no sitemap parsing

**Scraper** (heavy I/O worker):
- `DiscoveryProcessor` picks up `discover-store` jobs (concurrency: 3)
- Each job: crawl sitemap → diff DB → validate new handles → upsert ProductUrls → enqueue extraction jobs

### Discovery Processor Fetching Pattern

Each `discover-store` job processes one store with controlled concurrency:

```
1. Fetch sitemap index               (1 request)
2. Fetch child sitemaps               (concurrency 3, sequential pages)
3. Parse all product handles          (CPU only, fast)
4. Batch query DB for existing        (1 query per batch of 1000 handles)
5. HEAD validate new/updated handles  (concurrency 5-10 per store, 50ms stagger)
6. Batch upsert ProductUrl entries    (bulk DB insert)
7. Bulk enqueue extraction jobs       (enqueueExtractionJobsBulk)
```

**Lastmod optimization:**
- Skip extraction for products where `sitemap_lastmod <= last_extracted_at`
- Re-extract if `last_extracted_at` is older than 24 hours (configurable staleness threshold)
- Prices can change without sitemap updates, so staleness check catches this

**Rate limiting strategy for HEAD validation:**
- Use `p-limit` (or similar) with concurrency 5-10 per store
- 50ms minimum delay between request launches to stagger traffic
- Respect existing `CacheService.isStoreRateLimited()` checks
- On 429/rate limit: back off and re-queue the discovery job with delay

**Processor concurrency:**
- `DiscoveryProcessor` concurrency: **3** (each job does many HTTP requests)
- `ExtractionProcessor` concurrency: **20** (unchanged, single HTTP request per job)
- Both processors run in the same scraper worker process

### Files to Create

```
apps/scraper/src/discovery/
├── discovery.module.ts
├── discovery.processor.ts
└── discovery.service.ts
```

### Implementation

**discovery.module.ts**
- Import TypeOrmModule with Store, ProductUrl, MtgSinglesCollection entities
- Import QueueModule, CacheModule, PlatformModule, ProxyModule from core
- Providers: DiscoveryService, DiscoveryProcessor

**discovery.processor.ts**
- `@Processor(QUEUE_NAMES.PRODUCT_DISCOVERY)` with concurrency 3
- Process `discover-store` jobs
- Pre-check: `CacheService.isStoreRateLimited()` — if blocked, re-queue with delay + jitter
- On success: log stats (discovered, validated, extraction jobs queued)
- On rate limit error: record rate limit, re-queue with backoff

**discovery.service.ts**
- Migrate core logic from `apps/scheduler/src/discovery/discovery.service.ts`
- `discoverStore(storeId: number)` — main entry point
- Key changes from current implementation:
  - Use `p-limit` for controlled HEAD validation concurrency (5-10)
  - Use ProxyService from core instead of local DiscoveryProxyService
  - Lastmod + staleness check before queuing extraction

### Scheduler Changes

**Simplify scheduler to just enqueue jobs:**

| File | Change |
|------|--------|
| `apps/scheduler/src/discovery/discovery.service.ts` | Replace inline discovery with `queueService.enqueueDiscoveryJob()` per store |
| `apps/scheduler/src/discovery/discovery.scheduler.ts` | Simplify `runDiscovery()` to just query stores and enqueue jobs |
| `apps/scheduler/src/discovery/discovery.module.ts` | Remove PlatformModule, CacheModule imports. Remove DiscoveryProxyService. |
| `apps/scheduler/src/discovery/proxy.service.ts` | Delete (moved to core) |
| `apps/scheduler/src/manual/manual.controller.ts` | Keep endpoints — they now just enqueue jobs |
| `apps/scheduler/src/manual/manual.service.ts` | Keep — delegates to simplified DiscoveryScheduler |

The scheduler's `DiscoveryService` becomes ~20 lines:
```typescript
async discoverAllStores(): Promise<{ jobsEnqueued: number }> {
  const stores = await this.storeRepository.find({
    where: { isActive: true },
  });
  const discoveryStores = stores.filter(
    (s) => s.platformType && s.discoveryConfig?.discoveryEnabled,
  );
  for (const store of discoveryStores) {
    await this.queueService.enqueueDiscoveryJob({
      storeId: store.id,
      storeName: store.name,
    });
  }
  return { jobsEnqueued: discoveryStores.length };
}
```

---

## Part 5: Extraction Improvements (in scraper)

These changes stay within `apps/scraper/src/extraction/`.

### Files to Create

```
apps/scraper/src/extraction/
├── batch-accumulator.service.ts    (NEW)
├── listing-upsert.service.ts       (NEW)
├── printing-matcher.service.ts     (NEW)
├── extraction.module.ts            (existing, modify)
├── extraction.processor.ts         (existing, no changes needed)
└── extraction.service.ts           (existing, modify)
```

### Implementation

**printing-matcher.service.ts** (new — replaces old card-name.service.ts)
- Matches extracted store variants to `card_printings` by `(set_code, collector_number)`
- LRU cache for printing ID lookups (10,000 entries)
- `matchPrinting(setCode, collectorNumber): Promise<bigint | null>` — exact match
- `matchPrintingFuzzy(cardName, setName): Promise<bigint | null>` — fallback via cards.name trgm + card_printings.set_name
- `matchBulk(variants[]): Promise<Map<variant, bigint | null>>` — batch match for all variants in a product

**batch-accumulator.service.ts** (new)
- Accumulates extracted card listings per store
- Flushes when batch reaches 100 listings OR 5-second timeout
- On flush, calls `ListingUpsertService.batchUpsert()`
- `onModuleDestroy` flushes any remaining batches

**listing-upsert.service.ts** (new — replaces old card-upsert.service.ts)
- `batchUpsert(listings: ListingUpsertInput[])` — UNNEST-based batch upsert
- Uses raw SQL with `UNNEST($1::bigint[], $2::int[], ...)` arrays for bulk insert
- `ON CONFLICT (store_id, platform_variant_id)` update only if price/inStock/quantity changed
- Returns insert/update counts via `xmax = 0` (insert) vs `xmax > 0` (update)

### Files to Modify

| File | Change |
|------|--------|
| `apps/scraper/src/extraction/extraction.module.ts` | Add new services. Import `Card`, `CardPrinting`, `CardListing` entities. |
| `apps/scraper/src/extraction/extraction.service.ts` | Use PrintingMatcherService to resolve card_printing_id. Use BatchAccumulatorService. Remove in-stock filter (save ALL variants). Store `raw_title` on listings for unmatched cards. |

### Key Changes in extraction.service.ts

1. **Store ALL variants** — remove the in-stock filter
2. **Match to card_printings** — use `PrintingMatcherService` to resolve `(set_code, collector_number)` → `card_printing_id`
3. **Fallback for unmatched** — set `card_printing_id = NULL`, store `raw_title` for later manual matching or re-processing
4. **Use BatchAccumulatorService** — push listings to accumulator which handles batching and flushing

---

## Part 6: API v1 Endpoints

### Files to Create

```
apps/api/src/v1/
├── v1.module.ts
└── cards/
    ├── v1-cards.controller.ts
    ├── v1-cards.service.ts
    └── dto/
        └── search-cards-query.dto.ts
```

### Implementation

**v1.module.ts**
- Import TypeOrmModule with Card, CardPrinting, CardListing, Store entities
- Import CacheModule, StoreModule from @scoutlgs/core
- **Do NOT import QueueModule** (prevents scraping)

**v1-cards.controller.ts**
- `GET /api/v1/cards/search?name=Lightning+Bolt&inStock=true`
- Query params: `name` (required), `inStock` (default true), `limit` (default 50)

**v1-cards.service.ts**
- Search flow:
  1. Normalize name → query `cards` table (exact match, then trgm fuzzy)
  2. Get `cards.id` (oracle-level) → query `card_printings WHERE card_id = ?`
  3. Query `card_listings WHERE card_printing_id IN (...) AND in_stock = true`
  4. Join with stores for display names
  5. Return grouped by printing, sorted by price
- Redis caching with 5-minute TTL (key: `v1:search:{normalizedName}:{inStock}`)

### Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/app.module.ts` | Add `V1Module` import |

### Relationship to existing endpoints
- The existing `/api/card/:cardName` endpoint remains for V1 backward compat
- Once v1 endpoints are validated, deprecate the old endpoint

---

## Part 7: Cleanup

### Scheduler Cleanup
- Delete `apps/scheduler/src/discovery/proxy.service.ts` (replaced by core ProxyModule)
- Simplify `discovery.service.ts` to just store query + enqueue
- Remove PlatformModule, heavy dependencies from discovery module

### Scraper Proxy Cleanup
- Delete `apps/scraper/src/scraper/proxy/proxy.service.ts` (replaced by core ProxyModule)

### Old Entity Cleanup
- Remove `CardName` entity and all references
- Remove old `card_names` table via migration
- Update all imports across apps

### V1 Scraper Compatibility
- Keep existing `apps/scraper/src/scraper/` (V1 card-scrape queue) alongside discovery + extraction
- All three processors run in the same scraper worker
- Eventually deprecate V1 when all stores use the discovery/extraction pipeline

---

## Data Flow

```
Scryfall Seed (one-time + per new set)
  │
  ├─ Download Oracle Cards bulk data    → cards table (~30k rows)
  ├─ Download Default Cards bulk data   → card_printings table (~100k+ rows)
  └─ Staging table COPY + UNNEST upsert for speed

Scheduler (1 AM cron / manual trigger)
  │
  ├─ Query active stores with discovery enabled
  └─ Enqueue one discover-store job per store
       │
       ▼
  product-discovery queue
  [discover f2f] [discover 401] [discover hobbies] [discover hoc] ...
       │
       ▼
Scraper — DiscoveryProcessor (concurrency 3)
  │
  ├─ Fetch sitemap index + child sitemaps (concurrency 3)
  ├─ Parse product handles
  ├─ Batch query DB → find new/updated handles
  ├─ Skip if sitemap_lastmod <= last_extracted_at (unless stale > 24h)
  ├─ HEAD validate new handles (concurrency 5-10, 50ms stagger)
  ├─ Batch upsert ProductUrl entries
  └─ Bulk enqueue extraction jobs
       │
       ▼
  product-extraction queue
  [product-1] [product-2] [product-3] ...
       │
       ▼
Scraper — ExtractionProcessor (concurrency 20)
  │
  ├─ Fetch /products/{handle}.json
  ├─ Parse ALL card variants (in-stock + out-of-stock)
  ├─ Match to card_printings by (set_code, collector_number)
  ├─ Fallback: fuzzy match by name + set_name
  ├─ Batch accumulate (100 listings or 5s timeout)
  ├─ UNNEST batch upsert to card_listings table
  └─ Update ProductUrl extraction status

API v1 (read-only)
  │
  ├─ Normalize search name
  ├─ Query cards table (exact, then trgm fuzzy)
  ├─ Resolve oracle_id → card_printings → card_listings
  ├─ Filter by in_stock (optional)
  ├─ Group by printing, sort by price
  └─ Return results
```

---

## Verification

### Test Scryfall Seed
```bash
# Full seed (all cards + printings)
nx run api:seed:scryfall

# Verify counts
docker exec postgres psql -U postgres -d scoutlgs -c "SELECT COUNT(*) FROM cards"
# Expected: ~30,000

docker exec postgres psql -U postgres -d scoutlgs -c "SELECT COUNT(*) FROM card_printings"
# Expected: ~100,000+

# Incremental set seed
nx run api:seed:set MH3
```

### Test Discovery via Queue
```bash
docker-compose -f docker-compose.dev.yml up scraper scheduler

curl -X PUT http://localhost:5001/manual/discovery/trigger

# Monitor queues
docker exec redis redis-cli LLEN bull:product-discovery:wait
docker exec redis redis-cli LLEN bull:product-extraction:wait
```

### Test Extraction with Printing Matching
```bash
# Check listing counts and match rate
docker exec postgres psql -U postgres -d scoutlgs -c "
  SELECT
    COUNT(*) as total_listings,
    COUNT(card_printing_id) as matched,
    COUNT(*) - COUNT(card_printing_id) as unmatched
  FROM card_listings
"
```

### Test API v1
```bash
curl "http://localhost:5000/api/v1/cards/search?name=Lightning%20Bolt"
curl "http://localhost:5000/api/v1/cards/search?name=Lightning%20Bolt&inStock=false"
```

### End-to-End
1. Seed Scryfall data → `cards` + `card_printings` populated
2. Trigger discovery → scraper processes → ProductUrls created → extraction jobs queued
3. Scraper processes extraction → matches to card_printings → upserts card_listings
4. API v1 → search by name → oracle_id → printings → listings → sorted results

---

## Implementation Order

1. **Schema Migration** — Create new tables, rename old `cards` → `card_listings`, create entities
2. **Scryfall Seed** — Bulk load all cards + printings with staging table strategy
3. **Proxy Consolidation** — Move proxy to core (unblocks clean imports for parts 4 & 5)
4. **Discovery in Scraper** — Create DiscoveryProcessor/Service in scraper, simplify scheduler
5. **Extraction Improvements** — PrintingMatcher, batch accumulator, UNNEST upsert, all-variants
6. **API v1 Module** — Read-only endpoints with oracle_id search flow
7. **Cleanup** — Remove old entities, duplicate proxy files, deprecated endpoints
