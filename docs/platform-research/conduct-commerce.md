# Conduct Commerce decision — public storefront API prototype is viable

Decision date: 2026-09-08.

Conduct Commerce does not publish developer documentation, OpenAPI, or a
formal rate-limit/authentication policy. It is described as inventory
management, POS, merchant website, and marketplace integration. The available
[Mana Pool integration notice](https://support.manapool.com/hc/en-us/articles/39054232357527-Conduct-Commerce-Integrated-Inventory-Management-POS-and-Website)
names its sales channels (Mana Pool, TCGplayer and eBay) and directs merchants
to contact `sales@conductcommerce.com`.

## Verified public storefront contract

On 2026-09-08, ScoutLGS tested the public storefront of
[Prisma TCG](https://prismatcg.com). Its first-party JavaScript calls
`https://api.conductcommerce.com/v1/{operation}`. Calls are JSON over POST with
`Content-Type: text/plain`; the body must include the merchant storefront host
and a client-generated request ID:

```json
{
  "host": "prismatcg.com",
  "reqID": "client-generated-id"
}
```

This is a deliberately exposed storefront JSON interface, not HTML scraping.
The host is the tenant selector. An invalid host returns HTTP 200 with a JSON
failure envelope: `success: false` and `Invalid store.`.

### Cross-store verification

Public frontend/API fingerprints identified and `getStoreSettings` verified
the following live Conduct Commerce tenants on 2026-09-08:

| Store | Storefront host | Magic Singles product type | Magic category count |
| --- | --- | ---: | ---: |
| Prisma TCG | `prismatcg.com` | ID `1` | 399 |
| Magic Stronghold | `magicstronghold.com` | ID `1` | 461 |
| Laughing Dragon MTG | `laughingdragonmtg.com` | ID `1` | 1,117 |
| Cerberus Gaming | `cerberusgamingcorp.com` | ID `1` | 638 |
| Paragon City Games | `paragoncitygames.com` | ID `1` | 456 |
| Heavy J's | `heavyjs.com` | ID `1` | 345 |

Magic Stronghold's category listing response matches Prisma's verified shape,
including `inventoryID`, category/set names, image key, variants,
`variantCombinationID`, price, quantity, and filter fields. The repeated
`Magic Singles` / ID `1` convention is strong implementation evidence, but is
not a published Conduct guarantee: onboarding must still discover and persist
the tenant's product type dynamically.

| Operation | Use | Verified fields |
| --- | --- | --- |
| `getStoreSettings` | Probe and scope discovery | Top-level product types, categories, Magic conditions. Prisma exposes `Magic Singles` with 399 categories. |
| `getProductListings` | Search/category catalogue extraction | `inventoryID`, card title, category/set, image key, variants, price, quantity, condition, finish, language, rarity, type and delivery flags. |
| `getProductDetails` | Printing identity enrichment | Explicit Set, Collector Number, Finish, Language, card text, rarity, variants and image key. |
| `getSearchSuggestions` | Optional search validation | Inventory-title suggestions. |

Images use a relative image key; Prisma's first-party client constructs a
normal image URL as:

```text
https://conduct-catalog-images.s3-us-west-2.amazonaws.com/normal/{image-key}
```

### Stock and quantity contract

Availability is a **variant-level** property. A product/listing contains one
or more condition/finish variants, and each tested variant exposed a numeric
`quantity`. ScoutLGS must therefore derive `inStock` from that variant, not
from a product-level flag:

```text
inStock = variant.quantity > 0
quantity = variant.quantity
```

In a live Modern Horizons 2 category response, all 5,356 returned variants
included `quantity`; 449 were in stock (`quantity > 0`). Product-level
metadata such as `onlineOnly` is not a substitute for variant availability.
The adapter must still treat a missing quantity defensively as unknown rather
than silently claiming stock, until a full field-presence audit across tenants
is complete.

## Tested behaviour and limitations

- A scoped Magic category returned 847 listings in one response (~833 KB).
- The response has no cursor, `nextPage`, total, or other page metadata.
- Supplying `page: 2` and `limit: 10` returned the exact same complete data in
  the tested category. The adapter must not assume pagination support.
- A search for `Sol Ring` returned 176 listings. A category request returned
  356 listings for *Kamigawa: Neon Dynasty Commander*.
- Variant `id` can be null even in product details. Use a composite platform
  key such as `inventoryID + variantCombinationID` (and condition if needed),
  not `variant.id` alone.
- Product-details errors are also encoded in the JSON envelope: an invalid
  inventory ID returned HTTP 200, `success: false`, error code 22, and
  `Inventory item does not exist.`
- An unknown operation returned HTTP 502. The client must allow-list known
  operation names and classify unknown operations as permanent failures.
- No 429 or retry header appeared during the low-volume probe. Rate limits are
  unknown: initially cap to one request per second per store and retry 429/5xx
  conservatively.

## Identity, fields and scoping

The listing result has enough data for an initial normalized offer: name,
category/set, image, price, stock quantity, condition, finish and language.
`getProductDetails` supplies collector number and explicit set identity when
needed for matching. Configure extraction around a merchant-approved Magic
product type/category scope; never infer that all catalogue categories are
Magic singles. There is no verified SKU field in the tested public listing
contract, so it remains optional.

## Implemented backend boundary

Conduct is implemented behind the same adapter/factory, normalized
`ExtractedCardVariant`, matcher, and listing-persistence boundaries as Shopify.
The API differences remain inside a Conduct client and category-snapshot
processor:

1. The store configuration explicitly names the product type ID, category, or
   search scope. The adapter verifies that a configured Magic product type is
   present in `getStoreSettings`, then fetches every discovered category
   snapshot through `getProductListings`, including categories marked hidden;
   it does not hard-code the ID `1` convention.
2. Normalize listing variants through the adapter. When a listing lacks either
   a set code or collector number, call `getProductDetails` before matching or
   persistence; use `inventoryID + variantCombinationID` as the fallback
   platform variant key and do not depend on nullable `variant.id`.
3. `getProductDetails` is therefore part of the production identity contract,
   not merely an optional exact-ID refresh.
4. Construct images with the verified Conduct catalog-image URL rule and use
   `/store/item/{inventoryID}` as the first-party product URL pattern.
5. Treat every successful category response as a snapshot. Persist its listing
   and variant counts in `conduct_category_audits`, and warn when a category
   with a 100+ listing baseline drops by more than half. Never assume `page`
   or `limit` work; stale-offer reconciliation remains a follow-up because the
   existing listing pipeline does not yet carry a source-snapshot watermark.
6. Read or require an explicit currency: the tested listing response contains
   prices but no currency. Never infer USD/CAD.
7. Inspect the JSON `success` envelope as well as HTTP status. Retry transient
   network/429/5xx failures conservatively (initially one request/sec/store);
   classify invalid hosts, malformed payloads, and unknown operations as
   permanent failures.
8. Conduct onboarding detects explicit Conduct page signals, verifies
   `getStoreSettings`, uses the same details-enriched normalization as routine
   extraction, and requires a deterministic 100-variant identity gate plus a
   merchant-confirmed currency before it creates a proposal.
9. Obtain written authorization and official API guidance from
   `sales@conductcommerce.com`; no generic HTML fallback is permitted.

## Quantity roadmap

Conduct supplies a merchant-visible quantity without credentials, making it
the first supported backend for an exact inventory-count display. Add this as
a platform-neutral offer capability, not as Conduct-only UI behavior:

1. Audit the existing `card_variants.quantity` persistence path and migrate
   any API/listing DTOs that omit it; retain `null` for platforms where it is
   unavailable.
2. Expose quantity on offer/listing responses and display it beside the
   in-stock state when present (for example, “3 in stock”); preserve the
   current generic “In stock” display when it is unknown.
3. Use variant quantity, not product availability, for Conduct checkout and
   stale-stock validation.
4. Add fixtures for zero, one, many, and missing quantities and test that a
   quantity change updates both `inStock` and the displayed count.
5. Shopify Storefront does not expose inventory quantity without merchant
   authorization. Keep Shopify quantity nullable and do not require a Shopify
   Admin credential; add authenticated Shopify quantity only if merchants
   later authorize it through a separate integration.
