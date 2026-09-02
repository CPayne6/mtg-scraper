# Production API Plan: Verified Shopify Store Onboarding

## End state

An authenticated administrator can submit a Shopify URL, inspect a
database-verified onboarding result, and explicitly add the store as disabled.
No later engineering work is required to turn the result into a usable Storefront
store configuration.

The API performs the same workflow for every store:

```text
admin submits URL
  -> protected onboarding run
  -> homepage + fixed anchors
  -> BinderPOS or AI mapping candidate
  -> production parser + real printing/token matching
  -> verified products-query selection
  -> held-out listing dry run (100+ variants)
  -> persisted review result
  -> admin approves exact run
  -> one disabled Store record
  -> later, separate explicit activation
```

## Non-negotiable safety rules

- Only `AdminGuard` principals may access this surface. Reuse the existing
  guard, which deliberately returns 404 for unauthenticated/non-admin callers.
- A probe run cannot create/update a Store, listing, variant, unmatched-card
  record, discovery run, or extraction queue job.
- The approval request never accepts a client-supplied parser/configuration.
  It approves the server-stored, digest-checked proposal from a successful run.
- Approved Stores are always `isActive: false` and
  `discoveryConfig.discoveryEnabled: false`.
- Store activation remains an existing/separate admin action and is not part of
  onboarding approval.
- No token, credential, raw secret, or unsanitized full merchant payload is
  persisted or returned.

## Final API contract

### `POST /admin/storefront-onboarding/runs`

Request DTO:

```ts
{
  url: string;                 // absolute http(s) URL
  proposedSlug?: string;       // optional normalized Store name
  scope?: string;              // optional, still must pass matcher validation
  parserProfile?: unknown;     // optional explicit mapping / BinderPOS candidate
  aiDiscovery?: boolean;       // defaults true when provider is configured
}
```

Returns `202` with `{ id, status: "queued" }`. The endpoint creates an audit
run then queues only the onboarding-run job. It never queues extraction.

### `GET /admin/storefront-onboarding/runs/:id`

Returns sanitized state and evidence:

- terminal status;
- candidate/parser/source scores;
- anchor, held-out, and listing dry-run metrics;
- rejected examples (bounded/sanitized);
- disabled proposal and immutable digest only for `proposal-ready`.

### `POST /admin/storefront-onboarding/runs/:id/approve`

Request DTO: `{ digest: string }`.

In one DB transaction:

1. lock the run;
2. require `proposal-ready`, matching digest, unexpired result, and no prior
   approved store;
3. revalidate `validateStorefrontStoreConfig(proposal)`;
4. check Store name and base URL uniqueness;
5. create the Store disabled with the exact server-side proposal;
6. mark the run approved with store ID and approver identity.

Returns `201` with the disabled Store summary. It does not enqueue work.

### `POST /admin/storefront-onboarding/runs/:id/activate`

Do **not** implement this endpoint in this delivery. Activation uses the
existing audited store-management process after human inspection. This explicit
absence prevents onboarding from becoming activation by another name.

## Database and queue migration

Create a migration for `store_onboarding_runs`:

- `id`, UUID, timestamps;
- request fields: normalized URL, requested slug, requested scope, AI enabled;
- lifecycle: `queued | running | proposal-ready | rejected | failed | approved`;
- sanitized JSON report, proposal JSON, SHA-256 digest;
- `errorCode`, bounded error detail;
- `approvedStoreId`, `approvedByUserId`, `approvedAt`;
- unique partial index preventing two approved stores from one run;
- expiry (`expiresAt`) for unapproved reports (e.g. 7 days).

Add `STORE_ONBOARDING` queue and a single worker consumer. The job payload is
only `{ runId }`; the server re-reads request data from the database. Queue
retries are limited to transient network/provider failures and are idempotent
by run status. A retry never changes a completed proposal.

The worker runs the probe with a read-only transaction/query runner for database
matching. It must fail `database-unavailable` if a read-only DB connection
cannot be established; it may not fall back to structural-only acceptance.

## Code structure

### 1. Move the orchestration into an injectable production module

Create `apps/api/src/storefront-onboarding/` containing:

- `storefront-onboarding.module.ts`
- `storefront-onboarding.service.ts`
- `storefront-onboarding.processor.ts`
- `storefront-onboarding.controller.ts`
- DTOs, entity, migration, and test fixtures.

Move/refactor the reusable logic currently in:

- `scripts/storefront-onboarding/service.ts`
- `scripts/storefront-onboarding/types.ts`
- `scripts/storefront-onboarding/production-parser-adapter.ts`

into a package or API-owned library that imports neither CLI argv nor console.
The CLI becomes a thin adapter over the same service and uses the same
composition code in development.

### 2. Compose real production dependencies

The API module injects:

- tokenless Storefront GraphQL client;
- production mapping parser evaluator and BinderPOS parser evaluator;
- `StorefrontOnboardingDryRunService` for card-first printing and token
  fallback matching plus prospective listing construction;
- Groq provider (optional, key from server config only);
- onboarding run repository and queue;
- clock/logger.

Do not import a CLI module into the API. Do not reimplement matcher SQL in the
API; use the matcher services already used by production extraction.

### 3. Finish parser and anchor scoring

Complete the injected identity gateway so all parser candidates produce common
results containing product ID, variant ID, parsed fields, parser failures,
printing/token result, and prospective listing.

For every fixed anchor fixture:

- resolve its canonical tuple against the local card/printing catalog;
- search its title aliases;
- require a returned parsed result to resolve to that exact printing;
- count wrong printing separately from unmatched;
- require 12 exact anchor matches across 8 fixtures and zero wrong printings.

Homepage evidence merely tries BinderPOS first. The real BinderPOS extractor
must pass these exact anchor gates, otherwise AI mapping is attempted.

### 4. Finish evidence-driven mapping selection

For non-BinderPOS candidates:

- send at most 10 diverse anchor products and 3 variants/product to Groq;
- include only expected canonical anchor identities, field distributions, and
  parser failure summaries;
- request `openai/gpt-oss-20b` with `reasoning_effort: "medium"`, zero
  temperature, strict schema, one corrective retry maximum;
- validate the closed mapping grammar;
- score it through the same production parser and identity gateway.

Do not use merchant labels as proof of MTG and never allow AI to return a
builtin parser, source query, card identity, or unsupported transform.

### 5. Finish products-query discovery and held-out validation

After exact anchor matches, derive bounded query hypotheses only from values
shared by positively matched anchor products:

- product type, vendor, tag, and conjunctions present on >=2 positives;
- deterministic ordering and a cap of 20 hypotheses;
- optional user scope is one hypothesis, not a bypass.

For each hypothesis, fetch a deterministic sample and run the real parser,
identity matcher, and listing dry run. Admit a query only when it has:

- >=100 variants across >=20 products;
- >=95% structural parser coverage;
- >=90% exact unique non-token printing matches;
- no confirmed non-MTG/wrong-printing result;
- <=10% combined ambiguous, unmatched, and structural rejection rate.

Fetch a separate held-out sample excluding anchor product IDs where possible.
Repeat the gates and retain sanitized accepted/rejected examples. No candidate
passing only the anchor sample can produce a proposal.

### 6. Produce and approve the immutable configuration

On a passing held-out run, generate:

```ts
{
  platformType: "shopify_storefront",
  scraperType: "binderpos" | "default",
  isActive: false,
  discoveryConfig: { discoveryEnabled: false },
  scraperConfig: {
    shopifyUrl: "host[:port]",
    storefrontApiVersion: "YYYY-MM",
    source: {
      kind: "storefront-graphql",
      mode: "products-query",
      productQuery: "..."
    },
    storefrontScope: "...", // compatibility only
    parser: { /* accepted profile */ }
  }
}
```

Canonicalize JSON, hash it together with the report schema/version, and store
the digest. Approval always reads this stored object; never trust a resubmitted
proposal body.

## Test and verification gates

Implementation is not complete until every check below passes.

### Unit and integration tests

- `AdminGuard` protects every onboarding endpoint and hides it for anonymous /
  non-admin callers.
- DTO validation rejects invalid URLs, oversized scope/profile payloads, and
  invalid digest values.
- Probe job runs no write-capable Store/listing/unmatched/queue-extraction
  operation; spies prove this.
- Exact card printing, wrong printing, ambiguity, missing printing, token,
  invalid condition/finish/price/identity, and malformed mapping cases.
- BinderPOS is evaluated through the real extractor, not homepage/SKU count.
- Mislabeled Pokémon/non-MTG fixture is rejected despite MTG-looking tags.
- Scope hypotheses are matcher-scored; manual scope cannot bypass gates.
- Held-out fixture differs from anchors and fails at 99 variants / below
  coverage thresholds.
- AI missing key, timeout, 429, malformed output, unsupported grammar, and
  bounded retry behavior.
- Approval creates one disabled Store from the stored proposal, detects
  duplicate URL/name, rejects expired/altered/repeated runs, and never queues
  extraction.

### End-to-end verification

1. Start API, database, Redis, and scraper worker in the development compose
   environment with a read-only matcher account for probe queries.
2. Authenticate as an admin and submit a known BinderPOS fixture/store.
3. Poll to `proposal-ready`; verify exact printing metrics, source query,
   disabled config, and digest.
4. Approve with the digest; assert one disabled Store exists and zero
   extraction jobs/listings/product URLs were created.
5. Submit a mapping-profile fixture/store and repeat.
6. Submit the mislabeled/non-MTG fixture and assert rejection/no Store.
7. Run the existing configured-store mapping coverage command.
8. Run API, scraper, shared, and core builds; focused suites; `git diff --check`.

### Live read-only production-candidate verification

Before enabling the API in production, execute probe-only runs against:

- one existing BinderPOS store;
- one existing non-Binder Storefront store;
- one newly proposed store;
- one known misleading/non-MTG catalogue.

Record the sanitized reports in the deployment evidence. Do not approve or
activate a production store as part of this verification.

## Delivery sequence and commits

1. `feat: persist protected storefront onboarding runs`
2. `feat: verify storefront candidates against production matchers`
3. `feat: score storefront source queries and held-out listings`
4. `feat: approve disabled storefront onboarding proposals`
5. `test: cover protected verified storefront onboarding api`

Open a PR only after all build/test/e2e/live-read-only checks above pass. The
PR description must state that approval creates disabled stores only and that
activation/extraction remain explicit follow-up actions.

## Definition of done

An authenticated admin can use the production API to submit a Shopify URL,
receive a reproducible database-verified proposal, approve exactly that
proposal, and obtain a disabled Store whose configuration the production parser
and listing path have already proven. Rejections are safe and diagnosable; no
remaining script-only, matcher-only, or manual configuration work is required.
