# Shopify Storefront Full Onboarding Plan

## Goal

Given a Shopify store URL, produce a disabled, reviewable Storefront store
configuration that can be consumed by the production extraction pipeline to
turn Shopify products and variants into matched MTG listings.

The workflow must not trust merchant-authored product types, tags, vendors, or
titles as proof that a product is MTG. It must validate parsing and scope
selection against the local card-name and printing catalog.

This plan deliberately excludes endpoint-authentication work. It assumes the
target Storefront GraphQL endpoint is already accessible with the current
request mechanism.

## Progressive-discovery principle

Start with the cheapest deterministic evidence and only add work when that
evidence is insufficient. A known platform signature should select a known
parser candidate immediately; it must still pass production parsing and
printing-match validation before a configuration is accepted.

```text
homepage signature
  -> known parser candidate (for example BinderPOS)
  -> minimal Storefront validation
  -> anchors only if the candidate fails or is unknown
  -> AI mapping draft only if deterministic candidates cannot pass
```

## Decisions already made

Implementation agents must preserve these decisions rather than reopening them:

- Storefront GraphQL is the only acquisition protocol in this workstream.
  Endpoint authentication is explicitly out of scope.
- Homepage inspection is a cheap parser-candidate detector only. It may
  nominate BinderPOS but can never accept a store or prove a catalog scope.
- Fixed, source-controlled MTG anchors are the truth set for onboarding.
  Every accepted card anchor is verified against the local card/printing
  catalog.
- For a non-BinderPOS store, AI infers JSON field paths and transformations
  from raw Storefront payloads plus anchor truth. It does not invent card or
  printing facts.
- Groq `openai/gpt-oss-20b` uses `reasoning_effort: "medium"` and
  `include_reasoning: false` for mapping drafts.
- AI output is always an untrusted mapping-profile candidate. The shared
  generic parser and the production identity matcher decide acceptance.
- A successful run emits a disabled configuration and review bundle only; it
  does not create, activate, schedule, or deploy a store.

## Definition of done

For an accessible Shopify URL, onboarding can:

1. Query a fixed, versioned MTG anchor panel through Storefront GraphQL.
2. Learn and score candidate parser profiles from the returned product and
   variant data.
3. Select BinderPOS only when its real production extractor passes the same
   verification as a mapping profile.
4. Derive and score catalog scope or collection candidates using catalog-wide
   printing-match evidence.
5. Execute the production parser and printing matcher on a held-out sample of
   at least 100 variants.
6. Emit a disabled configuration and a reproducible review bundle only when
   all gates pass.
7. Be usable by a later endpoint without changing its orchestration logic.

The workflow must never activate a store, enqueue extraction, mutate a
production store record, or deploy anything.

## Target workflow

```text
Store URL
  -> homepage/platform signature probe
  -> known parser candidate when recognized
  -> Storefront capability probe and minimal validation
  -> fixed MTG anchor searches only when needed
  -> candidate mapping generation and scoring only when needed
  -> scope / collection candidate discovery
  -> held-out catalog validation through production parser + printing matcher
  -> disabled Storefront configuration + review bundle
  -> separate human approval / persistence / activation workflow
```

## Phase 1: Establish shared onboarding contracts

### 1.1 Add a source strategy to the Storefront configuration

Extend the Storefront configuration with a closed, versioned source section.
Initially support only Storefront GraphQL, while making scope and collection
selection explicit:

```ts
source: {
  kind: "storefront-graphql";
  apiVersion: string;
  mode: "products-query" | "collection";
  productQuery?: string;
  collectionHandle?: string;
}
```

Rules:

- Exactly one traversal mode is valid.
- `products-query` requires a non-empty query.
- `collection` requires a normalized collection handle.
- Preserve read compatibility with the current `storefrontScope` field during
  migration; normalize it into `source.mode = "products-query"` at runtime.
- The production adapter must read the normalized source strategy rather than
  letting the onboarding script define a parallel interpretation.

### 1.2 Define normalized onboarding evidence types

Create shared types for:

- `AnchorFixture`: stable fixture key, kind (`card` or `token`), display name,
  expected canonical name, set code, collector number, token flag, and fixed
  Storefront search aliases. Do not hard-code environment-specific database
  primary keys in fixtures. Fixture validation resolves the canonical tuple to
  the unique local card-name/printing record before probing.
- `AnchorObservation`: Storefront product, variants, query used, and expected
  printing/card identity.
- `ParserCandidateScore`: structural parse results, exact printing matches,
  ambiguous matches, unmatched variants, field failures, and diagnostics.
- `CatalogCandidate`: source strategy, sampled product/variant counts,
  printing-match rates, contamination metrics, and scope evidence.
- `OnboardingValidationReport`: anchor, scope, held-out, and listing dry-run
  reports with a stable schema version.

Do not put these types under `scripts/`; place them in shared/core code so the
future endpoint and CLI use the same contracts.

### 1.3 Create a production identity-matching read-only boundary

Extract or wrap the existing card-first `PrintingMatcher` and token fallback
behind an injected interface usable by onboarding:

```ts
interface IdentityMatchGateway {
  match(input: {
    cardName: string;
    setCode?: string;
    collectorNumber?: string;
    setName?: string;
  }): Promise<PrintingMatch>;
}
```

The gateway must preserve the same card-first, token-fallback, confidence,
card-name, printing, ambiguity, and missing-printing semantics used by
production extraction. No separate onboarding matcher may be created.

## Phase 2: Implement fixed-anchor discovery

### 2.0 Add homepage signature detection

Before any catalog or AI work, fetch the supplied homepage once and inspect
only stable, documented or empirically verified signatures. Initially include
BinderPOS signatures, such as characteristic markup, script URLs, application
identifiers, or product-template structures already observed in supported
stores.

The detector returns a ranked candidate with its evidence; it does not declare
the store onboarded. For a high-confidence BinderPOS signature:

- choose the existing production BinderPOS extractor as the first candidate;
- skip AI drafting;
- go directly to a small named-card probe and then the normal held-out catalog
  validation;
- fall back to anchors/mapping only if BinderPOS fails its validation gate.

Build the signature baseline from the currently configured BinderPOS stores.
Tests must ensure a superficial string match cannot select BinderPOS. Require
multiple independent homepage signals and report their sanitized evidence.

### 2.1 Add a versioned MTG anchor panel

Store fixtures in source control. The panel should include 20–50 exact local
printings chosen for parsing diversity:

- simple and multi-word names;
- punctuation, apostrophes, commas, and split cards;
- multiple printings and collector-number cases;
- non-foil, foil, and etched-like finish representations;
- tokens;
- names likely to occur in broad catalogues.

Each card fixture must resolve to one unique local printing by canonical name,
set code, and collector number during test/startup validation. Token fixtures
must resolve through the production token matcher. Fixtures are test oracles,
not free-text prompts for the model.

### 2.2 Add Storefront named-product search

Implement an onboarding Storefront client that sends bounded requests using:

1. `products(query: "title:\"...\"")` as the deterministic first choice;
2. alternate exact aliases where configured;
3. Storefront `search(types: [PRODUCT])` only as a fallback when title-filter
   results are empty.

Every query must request the full production parser input shape: product title,
vendor, type, tags, description HTML, handle, image, availability, and variant
ID/title/SKU/price/currency/options/availability.

Use one reusable GraphQL selection set matching
`StorefrontProduct`/`StorefrontVariant` and normalize it with the existing
`normalizeStorefrontProfileInputs` path. Do not create an onboarding-only
product representation. The named `products` request takes a quoted title query
as a variable, for example `title:"Lightning Bolt"`; escape aliases using the
Shopify search grammar rather than string concatenation.

Bound work with configurable caps: anchor count, results per anchor, variants
per product, request timeout, and total probe deadline. Start with: 30 anchor
fixtures, 20 products per anchor query, 25 variants per product for AI evidence,
100 variants per product for deterministic validation, a 15-second request
timeout, and a 90-second total probe deadline. Values must be named settings
with tests, not magic numbers embedded in prompts.

### 2.3 Classify anchor observations deterministically

For every returned product/variant:

- run the current production BinderPOS extractor as a candidate;
- run any supplied mapping profile through `ProfiledStorefrontCardParser`;
- send parsed identity to the shared identity-match gateway;
- record exact match, wrong-printing match, ambiguity, unmatched, and
  structural rejection separately.

An observation is positive only when the parsed result resolves to the fixture's
expected card/printing identity (or an explicitly allowed fixture alias). A
matching card name with the wrong set is a failure.

## Phase 3: Generate and select parser profiles

### 3.1 Replace BinderPOS detection with production scoring

Replace the pattern-and-count `detectBinder` / `binderValidation` acceptance
shortcut. Homepage detection may nominate BinderPOS as the first and cheapest
candidate, but it must pass the exact same named-card and held-out production
parsing/matching gates as mapping profiles.

### 3.2 Make AI profile drafting evidence-driven and advisory

Only invoke Groq after anchor observations exist and BinderPOS fails or scores
below threshold. Supply:

- sanitized, diverse anchor product/variant shapes;
- expected canonical identities (never model-provided truth);
- allowed mapping grammar;
- observed field distributions and known failures.

Require a mapping profile and per-field rationale. Reject profiles outside the
closed grammar. Use Groq `openai/gpt-oss-20b` with
`reasoning_effort: "medium"` and `include_reasoning: false`; retain the current
bounded retry behavior. Do not automatically escalate to high reasoning effort.

The normal budget is one AI request. Permit one corrective request only when:

- the first response parses and satisfies the closed schema, but deterministic
  anchor scoring reports concrete field or identity failures; or
- a transient provider failure occurs.

Never send the full catalog or held-out 100-variant fixture to Groq. AI evidence
must contain at most 10 diverse anchor products and three representative
variants per product, with aggregate field statistics and deterministic failure
summaries. The static system instruction and mapping grammar precede dynamic
payload data to make future prompt caching possible.

### 3.3 Deterministically score all parser candidates

Score candidates using a lexicographic policy:

1. minimum exact anchor printing-match rate;
2. zero wrong-printing matches for accepted anchors;
3. minimum condition and finish correctness;
4. lowest structural failure rate;
5. highest exact match count; then deterministic tie-breaker.

Suggested initial admission thresholds:

- at least 12 positive anchor products from at least 8 distinct fixtures;
- at least 95% exact printing-match rate among positively identified anchors;
- zero wrong-printing matches;
- at least 95% condition/finish correctness where the fixture can assert it.

Make all threshold values named configuration, not prompt language.

## Phase 4: Discover a safe catalog traversal strategy

### 4.1 Produce scope and collection hypotheses

From positively matched anchor products, derive candidates from shared values:

- exact product type;
- vendor;
- tag(s);
- conjunctions of the above;
- collection handles returned by Storefront GraphQL.

Keep discovery bounded and reproducible:

- score each observed product type, vendor, tag, and collection handle alone;
- score only conjunctions of values that occur on at least two positive anchor
  products;
- cap the candidate set (initially 20) and sort it deterministically;
- record every query/collection considered, including candidates that fail.

Also enumerate collections with MTG-like names as hypotheses. Do not accept a
candidate because its name says “MTG,” “Magic,” or “Singles.”

### 4.2 Sample and score every candidate

For each bounded candidate:

- fetch a deterministic, diverse sample across cursors/orderings;
- run the selected production parser;
- match outputs with the shared printing matcher;
- classify results as exact MTG printing, ambiguous MTG, unmatched, token,
  wrong game/non-MTG, or structurally rejected.

Score candidates by exact printing rate, ambiguity, contamination, structural
coverage, and enough distinct products/variants. A source candidate must not
be selected merely because it returns many products.

### 4.3 Admit only safe traversal configurations

Suggested initial scope gate:

- at least 100 sampled variants from at least 20 products;
- at least 95% production-parser structural coverage;
- at least 90% exact/unique MTG printing matches among non-token variants;
- no confirmed non-MTG result and no more than 10% combined ambiguous,
  unmatched, or structurally rejected non-token variants;
- explicit report of all unmatched or ambiguous variants.

If no candidate meets the gate, return `scope-unverified` with evidence and no
proposal. Do not silently fall back to a broad catalog query.

## Phase 5: Validate the actual production listing path

### 5.1 Add a non-mutating listing-pipeline dry run

Create a pure/injected dry-run boundary around the production extraction flow:

```text
source product -> production parser -> PrintingMatcher
               -> prospective listing + variants / unmatched record
```

It must use the same identity merge rules, condition/foil behavior, token
fallback, Art Series exclusion, and listing-row construction as production.
It must not write `product_urls`, `shopify_products`, `card_listings`, variants,
or unmatched rows.

### 5.2 Hold out validation data

Anchor observations may train/select the profile but must not be the final
gate. Fetch a separate deterministic sample of at least 100 variants from the
chosen scope/collection, excluding anchor product IDs where possible.

The review report must show:

- candidate strategy and scope;
- parser profile and score;
- field-level rejection counts;
- exact/ambiguous/unmatched/non-MTG match counts;
- prospective listings and variants;
- sanitized examples of accepted and rejected results;
- source and fixture/profile digests for reproducibility.

## Phase 6: Produce a reviewable disabled configuration

### 6.1 Make proposal output exactly production-compatible

The proposal must contain the complete normalized configuration used by the
production adapter:

```ts
{
  platformType: "shopify_storefront",
  scraperType: "binderpos" | "default",
  isActive: false,
  scraperConfig: {
    shopifyUrl: "host[:port]",
    source: { /* normalized source strategy */ },
    parser: { /* accepted builtin or mapping profile */ }
  },
  discoveryConfig: { discoveryEnabled: false }
}
```

Maintain a migration/compatibility path for `storefrontScope` until all
configured stores use `source`.

### 6.2 Keep approval and persistence separate

The CLI and future endpoint may create only a review bundle after every gate
passes. A later explicit approval operation is responsible for creating a
disabled Store record, validating its config, and recording the audit digest.
Activation remains a separate action after a successful production dry run.

## Current-code integration map

The implementation must extend the existing production path instead of adding
a second parser or a second matching implementation.

| Responsibility | Current location | Required change |
| --- | --- | --- |
| CLI/environment adapter | `scripts/probe-storefront-store.ts` | Keep it thin; delegate to the endpoint-ready onboarding service and never contain matching or parser rules. |
| Onboarding orchestration | `scripts/storefront-onboarding/service.ts` | Replace catalog-first scope gating with homepage-first, anchor-first progression and explicit status transitions. |
| AI envelope/schema | `scripts/storefront-onboarding/schema.ts` and shared mapping schema | Keep the closed mapping grammar; add anchor truth/failure evidence to the request, not new executable grammar. |
| Mapping validation bridge | `scripts/storefront-onboarding/production-parser-adapter.ts` | Replace script-local validation with an injected core onboarding dry-run interface that can score builtin and mapping candidates. |
| Generic parser | `ProfiledStorefrontCardParser` and shared profile evaluator | Reuse unchanged as the executable mapping implementation; do not fork mapping semantics. |
| Builtin parser | `CardDetailExtractorRegistry` / BinderPOS extractor | Expose a dry-run adapter so BinderPOS and mapping candidates return a common result shape. |
| Storefront traversal | `StorefrontClient` and `StorefrontExtractionAdapter` | Add named-anchor search and normalized source-strategy traversal using the existing GraphQL model/normalizer. |
| Matching and listing construction | `apps/scraper/src/extraction/extraction.service.ts` | Extract injected read-only identity/listing dry-run boundaries from the existing production logic. |
| Runtime config | shared Storefront profile/config plus `storefront-config.ts` | Validate/normalize `source`, retain `storefrontScope` read compatibility, and make production traversal consume the normalized form. |

Do not make `scripts/dev-storefront-mapping-profiles.ts` a production config
source. It remains development coverage data only.

## Onboarding state machine and no-write rules

Use explicit terminal statuses so callers and the later endpoint do not infer
success from partial evidence:

```text
access-failed             Storefront endpoint/query is unusable
homepage-unrecognized     no known parser signature; continue to anchors
anchors-insufficient      too few returned/verified anchor observations
parser-unverified         builtin and mapping candidates failed anchor scoring
scope-unverified          no source strategy passed catalog scoring
listing-dry-run-failed    source/parser passed but production listing dry run failed
proposal-ready            every deterministic gate passed; configuration is disabled
```

Only `proposal-ready` permits a review bundle. Every other status returns
sanitized evidence, diagnostics, and concrete next actions but no store config
proposal. The default command, every failed status, and all dry-run modes must
perform zero database writes, queue writes, filesystem bundle writes, store
creation, activation, or deployment.

## Phase 7: Tests and verification

### Unit tests

- fixed anchor fixture validation against local card/printing IDs;
- exact title search, alias fallback, and Storefront `search` fallback;
- parser scoring: exact match, wrong printing, ambiguity, unknown condition,
  unknown finish, missing identity, and malformed price;
- BinderPOS candidate evaluated through the real extractor, not a shortcut;
- scope/collection candidate scoring, including deliberately mislabeled
  Pokémon/non-MTG products;
- source-config normalization and legacy `storefrontScope` compatibility;
- no AI call until valid anchor evidence exists;
- malformed/unsupported AI mapping profiles fail closed.

### Integration tests

- existing 401, Face to Face, Hobbiesville, CG Realm, and BinderPOS fixtures;
- a store whose product labels are misleading, modeled on Fantasy Forged;
- mapping config traverses production adapter and produces the same parsed
  variants as onboarding dry run;
- full dry run reports prospective matched listings without database writes;
- approval bundle is not written when any anchor/scope/held-out gate fails.

### Live read-only validation

Run against each existing supported store and at least two new candidate URLs.
Record per-store:

- Storefront accessibility;
- anchor exact-match rate;
- chosen parser and source strategy;
- held-out structural coverage and printing-match rate;
- rejected/ambiguous counts;
- whether a disabled proposal is eligible.

Run `git diff --check`, shared/core builds, focused parser/onboarding tests,
and the existing configured-store coverage command.

## Implementation sequencing

1. Shared contracts, source strategy, and printing-match gateway.
2. Fixed anchor fixtures and named-product Storefront search client.
3. Production parser candidate scoring, including BinderPOS replacement.
4. Scope/collection hypothesis generation and catalog scoring.
5. Production listing-pipeline dry-run boundary.
6. Proposal format, compatibility migration, CLI report, and endpoint-ready
   service wiring.
7. Unit, integration, and live read-only validation.

Do not begin endpoint authentication, production record creation, scheduling,
or activation in this workstream.
