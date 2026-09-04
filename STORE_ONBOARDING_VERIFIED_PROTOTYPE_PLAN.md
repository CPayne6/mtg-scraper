# Verified Shopify Store Onboarding Prototype Plan

## Prototype outcome

Deliver a read-only prototype that accepts a Shopify Storefront URL and either:

- returns a disabled, production-compatible Storefront configuration whose
  parser and source query were verified against the local printing database; or
- returns a fail-closed report explaining exactly why onboarding was rejected.

The prototype must not create a Store record, write listings, enqueue jobs,
activate a store, or deploy anything.

## Success path

```text
URL
  -> homepage BinderPOS candidate probe
  -> fixed named-card Storefront searches
  -> parser candidate (BinderPOS or AI mapping)
  -> production parser + production printing/token matching
  -> verified source-query discovery
  -> held-out 100-variant parser/matcher/listing dry run
  -> disabled config + review bundle
```

## Scope and non-goals

- Use the current tokenless Storefront GraphQL request mechanism.
- Use the existing `PrintingMatcherService` first, then the existing token
  matcher only where production would fall back to tokens.
- Reuse `ProfiledStorefrontCardParser`, the BinderPOS extractor, and existing
  listing construction rules; do not create onboarding-specific parsing or
  matching logic.
- Endpoint authentication, database persistence, queueing, activation, and
  deployment are out of scope.
- The prototype supports `source.mode: "products-query"`. Collection discovery
  may be recorded as evidence, but collection traversal is not an acceptance
  path until the production worker can execute it end-to-end.

## Acceptance gates

All values below are named settings, not prompt text or magic constants:

- Anchor admission: at least 12 exact printing matches from at least 8 anchor
  fixtures; zero wrong-printing matches.
- Parser completeness: at least 95% structurally valid variants; condition,
  finish, price, currency, variant ID, card name, and set identity required.
- Source admission: at least 100 variants from 20 products; at least 90%
  exact unique non-token printing matches; no confirmed non-MTG variants; no
  more than 10% combined unmatched, ambiguous, and structural rejections.
- Held-out admission: a separate 100-variant sample excluding anchor product
  IDs where possible, meeting the same parser/source requirements.

Every failed gate returns evidence and no `proposedStore`.

## Implementation steps

### 1. Add shared, read-only onboarding contracts

Create shared/core types, rather than script-local `any` objects:

- `IdentityMatchGateway` with `matchCard()` and token fallback semantics.
- `ParsedCandidateVariant`, preserving parser diagnostics and raw product /
  variant IDs.
- `AnchorScore`, `SourceCandidateScore`, `ListingDryRunReport`, and a
  versioned `OnboardingValidationReport`.
- Named limits and thresholds in one prototype settings module.

Keep these contracts transport-agnostic so both the CLI and a future endpoint
can call the same service.

### 2. Expose the production identity matcher as an injected read-only gateway

In `apps/scraper/src/extraction`, add an adapter around the current
`PrintingMatcherService` and `TokenMatcherService`.

- Call `PrintingMatcherService.match(cardName, setCode, collectorNumber,
  setName)` first.
- Invoke token matching only when the parsed result is token-like and card
  matching did not resolve a printing, matching production behavior.
- Classify results precisely: `exact-printing`, `wrong-printing`, `ambiguous`,
  `unmatched`, `token`, and `non-mtg`.
- Do not call any upsert, repository-save, queue, or mutation method.

Add unit tests using existing matcher mocks for exact, wrong printing,
ambiguous, unmatched, and token cases.

### 3. Add a production parser-candidate evaluator

Extend the existing read-only Storefront parser boundary so mapping and
BinderPOS candidates return one common parsed-variant result.

- Mapping: use `ProfiledStorefrontCardParser` exactly as today.
- BinderPOS: use the actual BinderPOS extractor; retain fail-closed condition,
  finish, price, currency, ID, and identity validation.
- Pass every accepted parsed variant to the injected identity gateway.
- For each fixed anchor, compare the resolved printing to that fixture's
  canonical name, set code, and collector number. A name-only match or wrong
  set is a failure.

Remove any remaining parser acceptance based only on title/SKU shape or count.

### 4. Make anchor search the parser-selection oracle

Use the existing named Storefront title search with source-controlled anchors.

- Resolve each fixture against the local printing catalog at startup/test time.
- Search each configured alias with bounded result and timeout limits.
- Homepage signals only nominate BinderPOS; run BinderPOS through the evaluator
  before accepting it.
- If BinderPOS fails anchor scoring, construct bounded AI evidence from anchor
  payloads and their expected identities, then request one medium-reasoning
  mapping draft (one corrective retry only).
- Score every mapping draft through the same evaluator before selecting it.

The AI must choose source fields and transforms from the supplied JSON. It may
not invent card identities, scopes, or grammar extensions.

### 5. Discover and score a safe products query from verified anchors

After a parser has passed anchor scoring, derive candidate queries from only
the positively matched anchor products:

- product type, vendor, individual tags, and bounded conjunctions;
- candidates must occur on at least two positive anchor products;
- sort and cap candidates deterministically.

For every candidate, fetch a bounded sample and use the parser-candidate
evaluator plus identity gateway. Select the highest-scoring query only if it
passes the source admission gate. Merchant labels are hypotheses only; a query
with misleading MTG labels but failed printing matches is rejected.

Record every tested query, score, contamination example, and rejection reason.

### 6. Add a non-mutating production listing dry run

Extract a read-only seam from `ExtractionService` that uses the same
card-first/token-fallback, Art Series exclusion, identity merge, condition,
foil, and prospective listing/variant construction rules as production.

Input:

```ts
Storefront product -> selected parser profile -> identity gateway
```

Output:

```ts
{
  prospectiveListings: [...],
  matchedVariants: [...],
  rejectedVariants: [...],
  unmatchedVariants: [...],
  diagnostics: {...}
}
```

The dry run must have no repository writes and no queue interactions. Add a
test that spies on all write-capable dependencies and proves none are called.

### 7. Perform held-out validation and emit the review bundle

- Fetch a deterministic, separate sample of at least 100 variants from the
  selected products query; exclude anchor product IDs when possible.
- Run the listing dry run and apply held-out gates.
- On success emit only:
  - disabled `proposedStore` with normalized `source` and selected parser;
  - validation report with anchor/source/held-out metrics;
  - sanitized accepted/rejected fixture examples;
  - source/profile/fixture digests and provider diagnostics.
- `--approve --output` may write the review bundle only after every gate
  passes. Default invocation remains entirely in-memory.

## Prototype wiring

Create an endpoint-ready `VerifiedStorefrontOnboardingService` with injected:

- Storefront client;
- parser-candidate evaluator;
- identity-match gateway;
- listing dry-run service;
- AI provider;
- clock/logger.

Keep `scripts/probe-storefront-store.ts` as the CLI adapter. For the prototype,
add a small Nest application context or explicit composition module that obtains
the existing matcher services using the normal read-only database connection.
The command must clearly return `database-unavailable` rather than silently
downgrading to structural-only acceptance.

## Test matrix

- BinderPOS homepage candidate passes and fails real parser/matcher scoring.
- Mapping candidate: exact printing, wrong printing, unknown finish/condition,
  invalid price, missing identity, malformed grammar.
- Anchor aliases, no-anchor response, provider rejection, timeout, and one
  bounded corrective retry.
- Mislabeled Pokémon/non-MTG products are rejected despite MTG tags/types.
- Query candidate contamination, ambiguity, exact-match, and 100-variant
  boundary tests.
- Held-out sample excludes anchors when enough non-anchor data exists.
- Read-only enforcement: no store/listing/upsert/unmatched/queue writes.
- Legacy `storefrontScope` and normalized `source.products-query` execute the
  same production traversal.

## Verification and delivery

1. Run shared/core/scraper builds.
2. Run focused matcher, parser, onboarding, and listing dry-run suites.
3. Run configured-store development mapping coverage.
4. Run read-only prototype probes against one known BinderPOS store, one known
   mapping store, and a mislabeled/non-MTG fixture or live candidate.
5. Run `git diff --check`.
6. Commit in reviewable stages:
   - `feat: score storefront parsers against printings`
   - `feat: validate storefront source queries read-only`
   - `feat: emit verified storefront onboarding bundles`

## Definition of done

With a reachable Shopify URL and database access, the prototype either returns
a disabled config that the production parser and listing pipeline have already
proven against real printing data, or it fails closed with a reproducible
report. It never treats a structurally parseable merchant catalogue as an
onboarded MTG store without printing verification.
