# Conduct Commerce parser and onboarding validation

Validated on 2026-09-08 against Conduct's first-party public storefront API.
This is an evidence report, not a claim that Conduct onboarding is already
implemented.

## Live parser-contract probes

Each request used `POST https://api.conductcommerce.com/v1/{operation}` with
`Content-Type: text/plain` and JSON `{ host, reqID, ...input }`.  The API
returned HTTP 200 and `success: true` for `getStoreSettings` and a scoped
`getProductListings` request for every tenant below.

| Storefront host | Discovered Magic type | Sample category | Listings | Variant shape verified |
| --- | ---: | --- | ---: | --- |
| `prismatcg.com` | `Magic Singles` / 1 / 399 categories | MagicFest | 41 | nullable `id`, price, quantity, `NM/Mint` |
| `magicstronghold.com` | `Magic Singles` / 1 / 461 categories | The Hobbit Art Series | 120 | nullable `id`, price, quantity, image key |
| `laughingdragonmtg.com` | `Magic Singles` / 1 / 1,117 categories | 10th Edition | 772 | nullable `id`, price, quantity, set category |
| `cerberusgamingcorp.com` | `Magic Singles` / 1 / 638 categories | The Hobbit | 847 | nullable `id`, price, quantity, image key |
| `paragoncitygames.com` | `Magic Singles` / 1 / 456 categories | Lorwyn Eclipsed Commander | 200 | nullable `id`, price, quantity, `Near Mint` |
| `heavyjs.com` | `Magic Singles` / 1 / 345 categories | The Hobbit | 825 | numeric `id`, price, quantity, `Near Mint` |

The implemented Conduct parser accepts both observed condition spellings,
derives stock from each variant's numeric quantity, constructs the documented
catalog-image URL, and uses `inventoryID + variantCombinationID` whenever the
variant ID is null.  The focused fixture tests cover the null-ID path,
detail-field enrichment, images, quantity, and hidden-category extraction;
they do not make live network calls in CI.

### Compiled-adapter live smoke result

The compiled `ConductCommerceExtractionAdapter.normalizeListings` was then run
against the retrieved responses, with a merchant-confirmed `CAD` test
currency.  It emitted valid normalized variants for Prisma (164/164),
Laughing Dragon (3,860/3,860), Paragon (1,000/1,000), and Heavy J's
(3,300/3,300); all emitted variants in those samples retained quantity.
Magic Stronghold's first category was an Art Series category and correctly
produced zero variants under the existing Art Series exclusion. Cerberus's
first category returned zero listings. These are valid catalogue states, not
parser failures, and prove that onboarding must continue through sorted
categories until it obtains its 100 normalized-variant sample.

## Onboarding assessment

The current automatic onboarding executor is Shopify Storefront-specific: it
detects Shopify homepage signals, probes Storefront GraphQL, and invokes the
Shopify parser dry run.  It cannot currently onboard a Conduct store.  This is
the remaining implementation gap.

Conduct fits the existing *verified onboarding* model cleanly if the generic
executor is split behind a small platform-onboarding adapter boundary:

1. **Detect** Conduct only from explicit page signals such as an
   `api.conductcommerce.com` frontend reference; never infer it from theme
   appearance.
2. **Probe** `getStoreSettings` with the storefront hostname and reject a
   failed API envelope, malformed product types, or a missing Magic-singles
   type.
3. **Discover scope** by selecting a product type whose normalized name is
   `Magic Singles`, then persist its discovered ID and the merchant-confirmed
   ISO currency in `ConductCommerceConfig`; do not hard-code ID 1.
4. **Sample** stable category names in sorted order through
   `getProductListings` until at least 100 *normalized* variants are
   available (skipping empty and intentionally excluded Art Series
   categories), normalize them with `ConductCommerceExtractionAdapter`, and
   run the existing card identity gate on that production-equivalent output.
5. **Propose** a disabled store only after every gate succeeds, with
   `platformType: 'conduct_commerce'`, `scraperType: 'conduct'`, and the
   discriminated Conduct `parserConfig`.

The API response lacks a currency field, so an onboarding request must require
merchant confirmation of currency (or reject the run).  Its category snapshots
have no verified pagination contract; the onboarding sampler should request
the smallest deterministic set of categories necessary for 100 variants,
whereas extraction scans every discovered category.  This difference belongs
inside a Conduct onboarding adapter, not in the generic Shopify service.

## Recommended implementation tests

- Conduct detection succeeds only for the explicit signal and does not fall
  back to HTML scraping.
- Probe failures for invalid host, `success: false`, malformed settings, and
  missing Magic scope produce rejected reports with no proposal.
- A fixture with multiple category snapshots reaches the 100-variant gate,
  produces the exact typed Conduct configuration, preserves image URLs, and
  invokes the normal identity validator.
- Missing/invalid currency, fewer than 100 normalized variants, or failed
  identity validation reject the run.
- Keep one optional, manually run live smoke probe against a merchant-approved
  tenant; CI should continue using recorded fixtures.
