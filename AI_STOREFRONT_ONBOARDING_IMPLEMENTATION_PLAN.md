# AI-assisted Shopify Storefront onboarding implementation plan

## Objective

Turn the current `store:probe` workflow into a reliable, read-only onboarding
service that can later sit behind an authenticated endpoint. Given a Shopify
store URL, it must resolve a safe MTG-singles scope, draft or accept a generic
mapping profile, validate it through the production parser over live variants,
and emit a disabled-store review bundle.

This plan depends on the normalized configuration contract, fail-closed parser,
and production dry-run defined in
`STOREFRONT_CONFIG_GENERIC_PARSER_IMPLEMENTATION_PLAN.md`.

## Non-goals and safety boundaries

- The probe/service does not insert or update database rows.
- It does not enqueue scraper or scheduler work.
- It does not activate a store or deploy configuration.
- AI output never selects a builtin parser and never bypasses deterministic
  validation.
- BinderPOS remains the only automatically selected builtin parser.
- Missing credentials, provider errors, unsafe scope, and invalid drafts
  produce structured non-proposal results rather than legacy-parser fallback.

## Target architecture

Refactor the script into three layers:

1. `StorefrontOnboardingService`: endpoint-ready orchestration with injected
   Storefront fetcher, AI provider, clock, and logger.
2. Pure discovery, sampling, statistics, draft validation, and report helpers.
3. The existing CLI as a thin adapter for arguments, environment loading,
   JSON output, exit codes, and optional review-bundle writing.

Use serializable request/result types:

```ts
type StorefrontOnboardingRequest = {
  url: string;
  proposedSlug?: string;
  scope?: string;
  parserProfile?: StorefrontParserProfile;
  aiDiscovery: boolean;
  apiVersion?: string;
  timeoutMs?: number;
};

type StorefrontOnboardingResult = {
  status:
    | 'proposal-ready'
    | 'unsupported-platform'
    | 'access-failed'
    | 'scope-required'
    | 'draft-unavailable'
    | 'validation-failed';
  probeOnly: true;
  approvalRequired: true;
  detection: object;
  scope: object;
  ai: object;
  validation: object;
  proposedStore: DisabledStoreProposal | null;
};
```

The service returns data and never writes files. Only the CLI bundle writer is
allowed to write, and only with `--approve --output` after a proposal is ready.

## Implementation

### 1. Resolve and verify the Storefront target

- Normalize the input to an HTTP(S) customer-facing origin.
- Probe the homepage, tokenless Storefront GraphQL endpoint, and bounded public
  catalog without sending credentials or mutation requests.
- Preserve separate `baseUrl` and Storefront API host values.
- Detect Shopify using response shape and public signals; do not infer Shopify
  solely from text returned by the merchant.
- Report the API version and exact endpoint used.

Support an optional access credential only through an injected secret or an
environment-variable name. Never accept a literal token in a URL or normal CLI
argument, and never serialize Authorization headers or token values. If
credentialed Storefront access is not implemented in this iteration, return a
specific `access-failed` result and document that the service supports only
public/tokenless Storefront catalogs.

### 2. Improve scope discovery and add `--scope`

Generate conservative scope candidates from observed values:

- explicit MTG-single product types;
- explicit MTG-singles tags;
- `product_type:Singles` combined with an MTG/Magic vendor;
- MTG-specific tags combined with `product_type:Singles`;
- a user-supplied `--scope`, which has highest precedence.

Every candidate must be issued as a read-only tokenless Storefront query. Score
only successful, non-empty candidates and retain evidence: query, source,
product count, variant count, product-type distribution, vendor distribution,
tag distribution, and contamination warnings.

A user scope is not automatically safe merely because Shopify accepts it. It
must satisfy the same evidence checks as inferred scopes. When no candidate is
safe, return `scope-required` with suggested candidate queries; do not call AI.

Sample across multiple catalog pages or ID/time ranges so the safety decision
is not based only on the first ID-sorted page. Deduplicate by Shopify product
and variant ID.

### 3. Build compact deterministic AI evidence

Select five diverse products using distinct product type, option-name layout,
title shape, SKU shape, tag pattern, and apparent set. Include at most three
representative variants per product.

Add aggregate statistics from the larger scoped sample:

- field presence percentages;
- common selected-option names and values;
- normalized title and SKU shape frequencies;
- product type, vendor, and tag frequencies;
- condition and finish tokens;
- number of products and variants represented.

Truncate description HTML and other long strings, cap every array, strip
unneeded image/query metadata, and enforce a serialized prompt-size limit.
Treat all merchant values as untrusted data rather than instructions.

Remove named legacy parser examples from non-BinderPOS prompts. Supply one
small generic version-1 mapping example that demonstrates candidate fallback,
condition normalization, explicit foil fallback, and explicit token fallback.

### 4. Enforce a strict AI response contract

Generate or export the AI JSON Schema from the same closed mapping grammar used
by runtime validation. Do not maintain a permissive `{ type: 'object' }`
placeholder for `parserProfile`.

Require this envelope:

```ts
type MappingDraftEnvelope = {
  schemaVersion: 1;
  storeDisplayName: string;
  parserProfile: MappingStorefrontParserProfile;
  fieldRationale: Array<{
    field: ProfileField;
    sources: string[];
    rationale: string;
    confidence: number;
  }>;
  gaps: string[];
  requiresHumanReview: true;
};
```

Use Groq strict JSON-schema output when supported by `AI_MODEL`, a low
temperature, and no Markdown. Validate the parsed envelope locally even when
the provider claims strict conformance. Reject builtin profiles, unknown
fields, unsupported transforms, extra properties, or a false/missing review
flag.

Record provider, model, prompt version, schema version, attempts, latency, and
sanitized status. Do not record keys, headers, or complete raw merchant data.

### 5. Add bounded retry behavior

Allow no more than two AI requests for one onboarding operation:

- First request: normal mapping draft.
- Corrective request: only when the first response is malformed, violates the
  profile contract, or fails deterministic dry-run validation. Send the same
  evidence plus concise local errors and require a complete replacement
  envelope.

For 429, timeout, or transient 5xx before a usable response is received, use
the second request as the transport retry. Honor a bounded `Retry-After` value
and otherwise use short exponential backoff. Do not make both a transport retry
and a third corrective request.

Permanent provider rejection, missing `GROQ_API_KEY`, exhausted timeout, or a
second invalid response returns `draft-unavailable` or `validation-failed`
without a proposal.

### 6. Apply deterministic production-parser gates

Selection precedence is fixed:

1. An explicit reviewed `--parser-profile` is validated and no AI call occurs.
2. A strongly verified BinderPOS signature selects the builtin.
3. Otherwise AI may draft only a mapping profile.
4. There is no fallback to `f2f`, `401`, `hobbies`, `cgrealm`, or the default
   legacy extractor for a new store.

Validate the candidate with the production dry-run from the generic-parser
plan over the scoped sample. A disabled proposal requires:

- at least 100 valid variants;
- at least 95% valid-variant coverage across the evaluated sample;
- card name, known condition, explicit finish, price, currency, platform ID,
  and set name/code for every accepted variant;
- no duplicate platform variant IDs with conflicting data;
- no unsafe mixed scope;
- a syntactically valid canonical Storefront store configuration.

Report field failures, parser failure codes, rejected variant IDs, coverage,
scope evidence, and representative sanitized examples. Structural validation
permits only a disabled proposal; printing-match accuracy and a persisted
canary remain activation gates outside this service.

### 7. Produce an endpoint-ready disabled proposal

The proposal must use:

```ts
{
  isActive: false,
  platformType: 'shopify_storefront',
  scraperType: 'default',
  discoveryConfig: { discoveryEnabled: false },
  scraperConfig: {
    shopifyUrl: '<canonical host>',
    storefrontApiVersion: '<validated version>',
    storefrontScope: '<verified query>',
    parser: '<validated mapping profile>'
  }
}
```

BinderPOS proposals use the verified builtin profile and `scraperType:
'binderpos'`. Mapping proposals always use `scraperType: 'default'`; the
mapping profile itself controls parsing.

The service must check proposed slug/display-name syntax and expose duplicate
lookup keys for a future endpoint, but database duplicate detection remains an
endpoint/application concern.

### 8. Review-bundle output

On `--approve --output`, write a new directory atomically and refuse to
overwrite an existing bundle. Include:

- `proposal.json`;
- `parser-profile.json`;
- `parser-validation.json`;
- a sanitized 100-variant fixture containing accepted and rejected examples;
- scope evidence and field statistics;
- AI diagnostics and rationale;
- input URL, endpoint host, API version, generation timestamp, and current Git
  commit when available;
- a bundle digest covering all approval inputs;
- a README stating that no database, queue, activation, or deployment change
  occurred.

Default execution remains in-memory and prints only the compact report.

### 9. Prepare for an authenticated endpoint

Keep network and provider dependencies injectable so the application can later
expose the service as an asynchronous admin operation. Do not put file-writing,
`process.argv`, `process.env`, or `console` access inside the service.

The future endpoint should accept `StorefrontOnboardingRequest`, return an
operation ID, persist only sanitized reports, enforce administrator
authorization, rate-limit by user and target host, and require a separate
approval endpoint to apply a bundle. Endpoint creation is not required by this
script-focused implementation unless explicitly requested.

## Tests

### Scope and access

- explicit MTG product type, MTG tag, product-type/vendor combination, and
  manual scope;
- rejected, empty, broad, and mixed scopes;
- pagination diversity and deduplication;
- tokenless requests contain no Storefront access header;
- optional credential references never appear in reports or errors;
- vanity-domain and `myshopify.com` endpoint normalization.

### AI contract

- strict valid mapping output;
- malformed JSON and schema-invalid envelope;
- builtin profile, unsupported source/transform, extra property, and missing
  human-review flag;
- corrective retry success and second failure;
- missing key, 429 with bounded retry, timeout, 4xx rejection, and transient
  5xx retry;
- `--no-ai-discovery` and explicit profile make no provider call;
- prompt evidence is compact, diverse, deterministic, and sanitized.

### Deterministic gates

- exactly 99 and 100 valid variants;
- coverage immediately below and at 95%;
- unknown condition, unknown finish, missing identity, invalid price, missing
  currency/ID, duplicates, and unsafe mixed scope;
- explicit profile precedence and BinderPOS precedence;
- non-BinderPOS builtins are never selected;
- failed gates never produce a proposal or write a bundle.

### Fixtures and regression

- fixed sanitized fixtures for Face to Face, 401 Games, Hobbiesville, and CG
  Realm mapping formats;
- BinderPOS fixtures for current builtin stores;
- CLI help/module-load, argument, timeout, read-only, and output-overwrite
  regressions;
- generated proposal round-trips through the normalized store configuration
  and production parser dry-run;
- configured-store live coverage remains a separate, read-only diagnostic and
  is not required for deterministic CI.

## Acceptance criteria

- Face to Face can proceed using a verified inferred scope or explicit
  `--scope` rather than failing before AI drafting.
- Groq responses either satisfy the closed mapping contract or receive one
  useful corrective retry; malformed output never becomes configuration.
- Every mapping proposal passes the exact generic parser used in production,
  with at least 100 variants and at least 95% coverage.
- The proposed `shopifyUrl` produces the same endpoint used during probing.
- Default mode performs no writes, and approval mode writes only a review
  bundle after all gates pass.
- No database row, job, active store, deployment, or production secret is
  changed.
- Focused tests, the shared/core build, configured-store fixture coverage, CLI
  load checks, and `git diff --check` pass.

## Delivery constraints for the implementing agent

- Implement the configuration/generic-parser plan first or rebase on its
  completed changes; do not duplicate its validation logic in the script.
- Preserve the current dirty workspace and unrelated `TODO.md`.
- Do not reset, stash, amend, or overwrite user changes.
- Keep service refactoring, AI reliability, and test/fixture changes in
  separate reviewable commits.
- Do not call production admin endpoints, mutate a database, enqueue work,
  activate stores, deploy, or print credentials during implementation.
