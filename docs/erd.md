# Database ERD

## Schema

```
                                                              ┌──────────────────────┐
                                                              │      platforms       │
                                                              ├──────────────────────┤
                                                              │ id           PK      │
                                                              │ name         UNIQUE  │
                                                              │ display_name         │
                                                              └──────────┬───────────┘
                                                                         │ 1
                                                                         │
                                                                         │ n
┌──────────────────────────┐                              ┌──────────────┴───────────────┐
│ mtg_singles_collections  │                              │           stores             │
├──────────────────────────┤                              ├──────────────────────────────┤
│ id           PK          │                              │ id              PK           │
│ slug         UNIQUE      │                              │ uuid            UNIQUE       │
│ display_name             │                              │ name            UNIQUE       │
└────────────┬─────────────┘                              │ display_name                 │
             │ 1                                          │ base_url                     │
             │                                            │ scraper_type                 │
             │ n                                          │ scraper_config    JSONB       │
┌────────────┴──────────────────────────────┐             │ platform_id       FK ─────┘  │
│            product_urls                   │             │ platform_type                │
├───────────────────────────────────────────┤             │ discovery_config  JSONB       │
│ id                  PK (bigint)           │             │ is_active                    │
│ store_id            FK ─── stores ────────┼─────────────┤                              │
│ mtg_singles_collection_id  FK ────────────┼──┘          └──────┬───────────────────────┘
│ handle                                    │                    │
│ validation_status                         │                    │
│ extraction_status                         │                    │
│ extraction_error                          │                    │
│ variants_total                            │                    │
├───────────────────────────────────────────┤                    │
│ UNIQUE(store_id, handle)                  │                    │
└────────────────┬──────────────────────────┘                    │
                 │ 1                                             │
                 │                                               │
                 │ n                                             │ 1
                 │                                               │
┌────────────────┴──────────────────────────────────────────┐    │
│                  *** card_listings ***                     │    │
│                 (central hub table)                        │    │
├───────────────────────────────────────────────────────────┤    │
│ id                     PK (bigint)                        │    │
│                                                           │    │
│ ★ card_name_id         FK ─── card_names ─────────┐      │    │
│   (ALWAYS SET — name-based card resolution)       │      │    │
│                                                   │      │    │
│ ★ card_printing_id     FK ─── card_printings ──┐  │      │    │
│   (NULLABLE — set-specific link when known)    │  │      │    │
│                                                │  │      │    │
│ store_id               FK ─── stores ──────────┼──┼──────┼────┘
│ product_url_id         FK ─── product_urls     │  │      │
│                                                │  │      │
│ title                                          │  │      │
│ raw_title                                      │  │      │
│ set_name               (from store data)       │  │      │
│ set_code               (from store data)       │  │      │
│ collector_number                               │  │      │
│ condition              nm|lp|mp|hp|dmg         │  │      │
│ foil                                           │  │      │
│ price                  decimal(10,2)           │  │      │
│ currency               default 'CAD'           │  │      │
│ in_stock                                       │  │      │
│ quantity                                       │  │      │
│ product_link                                   │  │      │
│ platform_variant_id                            │  │      │
│ price_updated_at                               │  │      │
├───────────────────────────────────────────────────┤      │
│ UNIQUE(store_id, platform_variant_id)          │  │      │
│ INDEX(card_name_id)                            │  │      │
│ INDEX(card_printing_id)                        │  │      │
│ INDEX(card_name_id, price)                     │  │      │
└──────────┬─────────────────────────────────────┘  │      │
           │                                        │      │
           │ 1                                      │      │
           │                                        │      │
           │ n                                      │      │
┌──────────┴────────────────────────┐               │      │
│      card_price_history           │               │      │
├───────────────────────────────────┤               │      │
│ id               PK (bigint)     │               │      │
│ card_listing_id  FK              │               │      │
│ card_printing_id FK (nullable)   │               │      │
│ store_id         FK              │               │      │
│ price                            │               │      │
│ condition                        │               │      │
│ foil                             │               │      │
│ in_stock                         │               │      │
│ recorded_at                      │               │      │
├───────────────────────────────────┤               │      │
│ INDEX(card_listing_id, recorded_at)              │      │
│ INDEX(card_printing_id, recorded_at)             │      │
└───────────────────────────────────┘               │      │
                                                    │      │
              ┌─────────────────────────────────────┘      │
              │                                            │
              │ n                                          │ n
              │                                            │
┌─────────────┴──────────────────────────────┐             │
│      card_printings                        │             │
│      (one row per set printing)            │             │
├────────────────────────────────────────────┤             │
│ id               PK                        │             │
│ ★ card_name_id   FK ─── card_names ────────┼─────────────┘
│ scryfall_id      UUID UNIQUE               │
│ set_id           FK ─── sets               │
│ collector_number                           │
│ rarity                                     │
│ image_uri                                  │
│ layout                                     │
├────────────────────────────────────────────┤
│ UNIQUE(set_id, collector_number)           │
└──────┬─────────────────────────────────────┘
       │
       │ n
       │
       │ 1
┌──────┴───────────────┐
│  sets                │
│  (MTG set)           │
├──────────────────────┤
│ id         PK        │
│ code       UNIQUE    │
│ name                 │
└──────────────────────┘


                     ★ card_names is the single card identity table ★

                     ┌────────────────────────────────────┐
                     │         card_names                  │
                     │    (canonical card identity)        │
                     ├────────────────────────────────────┤
                     │ id                PK               │
                     │ name                               │
                     │ normalized_name   UNIQUE           │
                     │ oracle_id         UUID (nullable)  │
                     ├────────────────────────────────────┤
                     │ UNIQUE(oracle_id) WHERE NOT NULL   │
                     └────────────────────────────────────┘
                                    │
                         ┌──────────┼──────────┐
                         │ 1        │ 1        │
                         │          │          │
                         │ n        │ n        │
                    card_listings  card_printings
                    (via card_name_id)
```

## Key Relations

### `card_names` — the single card identity table

`card_names` is the canonical card identity. Both `card_listings` and `card_printings`
point to it:

```
                         card_names
                        (oracle card)
                       /              \
                      / card_name_id   \ card_name_id
                     /                  \
              card_printings         card_listings
              (per-set printing)     (store inventory)
                     \                  /
                      \ card_printing_id (nullable)
                       \              /
                        card_listings
```

- **`card_names.oracle_id`** — nullable UUID from Scryfall. Set when seeded from Scryfall bulk data, `NULL` when created by the extraction pipeline for an unrecognized card name.
- **`card_printings.card_name_id`** — always set. Links a specific set printing back to the card identity.
- **`card_listings.card_name_id`** — always set. The primary search path for the V2 API.
- **`card_listings.card_printing_id`** — nullable. Enriches a listing with set/image data when the printing is known.

### The `card_listings` hub

| Relation | Column | Required | Purpose |
|----------|--------|----------|---------|
| **card_names** | `card_name_id` | **Yes** | Name-based card resolution. Always resolvable. |
| **card_printings** | `card_printing_id` | No | Set-specific link. `NULL` when set is unknown. |
| **stores** | `store_id` | Yes | Which retailer. |
| **product_urls** | `product_url_id` | Yes | Source product page. |

### Two query paths into listings

```
QUERY PATH 1 — always works (V2 API uses this):
  card_names ──(card_name_id)──> card_listings ──LEFT JOIN──> card_printings + sets
  "Find all listings for 'Lightning Bolt', enrich with set info when available"

QUERY PATH 2 — set-specific:
  card_names ──> card_printings ──(card_printing_id)──> card_listings
  "Find all listings for Lightning Bolt [Alpha] specifically"
```

### Discovery pipeline chain

```
  stores ──1:N──> product_urls ──1:N──> card_listings
  "Store has product pages, each page produces multiple listing variants"
```

## Table Purposes

| Table | Role | One Row Per | Populated By |
|-------|------|-------------|--------------|
| **card_names** | Canonical card identity | Unique card name (e.g., Lightning Bolt) | Scryfall seed (with oracle_id) or extraction pipeline (without) |
| **sets** | MTG set metadata | Set (e.g., Modern Horizons 3) | Scryfall seed |
| **card_printings** | Specific set printing | Set + collector number | Scryfall seed |
| **card_listings** | Store inventory | Store + variant (price, condition, stock) | Extraction processor |
| **card_price_history** | Price snapshots over time | Price change event | Price tracking job |
| **stores** | Retailer config | Store | Seed data |
| **platforms** | E-commerce platform type | Platform (Shopify, etc.) | Seed data |
| **product_urls** | Discovered product pages | Store + product handle | Discovery processor |
| **mtg_singles_collections** | Shopify collection slugs | Collection | Discovery |

## Extraction Matching Flow

```
Store product variant extracted:
  name: "Lightning Bolt"
  set_name: "Modern Horizons 3"
  collector_number: "141"
      │
      ├─ 1. Resolve card_names (find or create by normalized name)
      │     → card_names.id = 5
      │
      ├─ 2. Match card_printings by (set_code, collector_number)
      │     → card_printings.id = 42  (or NULL if set unknown)
      │
      └─ 3. Upsert card_listing:
            card_name_id = 5         ← ALWAYS SET
            card_printing_id = 42    ← NULL if set unknown
            + price, condition, stock, store_id
```

## API v2 Search Flow

```
User searches "Lightning Bolt"
  │
  ├─ 1. Normalize → "lightning bolt"
  ├─ 2. Query card_names by normalized_name (exact, then trgm fuzzy)
  │     → card_names.id = 5
  ├─ 3. Query card_listings WHERE card_name_id = 5 AND in_stock = true
  │     LEFT JOIN card_printings + sets for set info
  │     → All inventory across all stores, including unknown-set listings
  ├─ 4. Group by printing (known printings grouped together, unknown grouped by set_name)
  └─ 5. Return sorted by price
```
