# Storefront configuration and generic parser implementation plan

## Objective

Make a generated Shopify Storefront configuration directly usable by the
production `StorefrontExtractionAdapter` and make mapping-profile failures
fail closed instead of silently producing incorrect offers.

This plan covers the store configuration contract, generic mapping parser,
runtime adapter integration, and their tests. It does not change AI drafting
or create an onboarding API; those are covered by
`AI_STOREFRONT_ONBOARDING_IMPLEMENTATION_PLAN.md`.

## Current problems

1. The onboarding probe writes `scraperConfig.shopifyUrl` as an origin such as
   `https://example.com`, while `StorefrontClient` treats it as a hostname and
   prepends `https://`. The resulting runtime URL is invalid.
2. Store configuration is represented by several loosely related object
   literals. The probe, entity, Storefront client, scheduler, and checkout code
   do not share normalization and validation.
3. `ProfiledStorefrontCardParser.parse()` rejects only invalid prices. Missing
   card name, set identity, condition, and finish silently become empty,
   `unknown`, or `false` values.
4. Runtime compilation validates mapping grammar but not the minimum fields
   required to create a usable offer.
5. An absent or unrecognized foil value is treated as non-foil, which can
   attach an offer to the wrong printing.
6. Mapping-profile validation and production parsing report different levels
   of detail, making an onboarding result difficult to reproduce at runtime.

## Required invariants

- `Store.baseUrl` is an absolute customer-facing HTTP(S) origin.
- `scraperConfig.shopifyUrl` is canonically stored as a lowercase hostname,
  with an optional port, and never includes a scheme, credentials, path,
  query, or fragment.
- Runtime readers temporarily accept a legacy absolute `shopifyUrl`, normalize
  it to its host, and log a deprecation warning. New writes use only the
  canonical hostname form.
- A mapping profile must define `cardName`, `condition`, `foil`, `isToken`, and
  at least one of `setName` or `setCode`.
- A parsed variant is usable only when it has a non-empty card name, a known
  condition, an explicit boolean finish, a finite non-negative price, currency,
  a platform variant ID, and set name or set code.
- Unknown finish is not equivalent to non-foil.
- Invalid variants are rejected with structured diagnostics. They are never
  converted into partially populated offers.
- Builtin parser behavior remains unchanged.

## Implementation

### 1. Introduce one normalized Storefront configuration contract

Add shared types for the Storefront-specific scraper configuration and a core
normalizer used at every runtime boundary:

```ts
type StorefrontScraperConfig = {
  shopifyUrl: string;
  storefrontApiVersion: string;
  storefrontScope: string;
  parser: StorefrontParserProfile;
  storefrontAccessToken?: string;
};

type NormalizedStorefrontConfig = StorefrontScraperConfig & {
  shopifyUrl: string; // canonical host[:port]
};
```

Implement `normalizeStorefrontHost(value, baseUrl)` with these rules:

- use `value` when present, otherwise use `new URL(baseUrl).host`;
- accept a legacy absolute HTTP(S) URL and return its `.host`;
- accept `host` or `host:port` by parsing it as `https://${value}`;
- reject credentials, non-root paths, query strings, fragments, whitespace,
  unsupported protocols, and empty hosts;
- lowercase the hostname while preserving a valid port.

Implement `validateStorefrontStoreConfig(store)` to validate base URL, API
version format, non-empty scope, normalized host, platform type, rate limit,
and parser profile. Return structured errors rather than throwing until the
caller chooses to reject the request.

Update `StorefrontClient.getEndpointUrl()`, checkout host resolution, scheduler
preflight, and generated proposals to use this normalization. The probe must
write `baseUrl.host`, not `baseUrl.origin`, to `shopifyUrl`.

Do not add a database migration solely to rewrite legacy absolute values. Read
compatibility prevents an outage; add an audit query or maintenance report so
legacy rows can be normalized in a separate reviewed migration.

### 2. Strengthen the mapping-profile contract

Split validation into two explicit levels:

- `validateStorefrontParserProfileGrammar(profile)` validates version, allowed
  fields, sources, predicates, transforms, regex limits, and object shapes.
- `validateStorefrontMappingProfileContract(profile)` additionally requires
  the production fields listed in the invariants.

Keep `validateStorefrontParserProfile(profile, samples?)` as a compatibility
wrapper during the transition, but make new code call the explicit validator.
Builtin profiles use grammar validation only. Mapping profiles stored for
production must pass contract validation.

Reject unknown keys in predicates, transforms, candidates, field rules,
exclusions, and top-level profiles. This allows the same closed contract to be
used later as the AI structured-output schema.

Do not expand the mapping grammar speculatively. Existing single-source
candidates, predicates, and transforms remain version 1. Add new operations
only when a rejected real fixture proves that version 1 cannot express the
required mapping.

### 3. Make generic parsing fail closed

Replace the ambiguous nullable parser result with a discriminated result:

```ts
type ProfileParseFailureCode =
  | 'missing-card-name'
  | 'missing-set-identity'
  | 'unknown-condition'
  | 'unknown-finish'
  | 'invalid-price'
  | 'missing-currency'
  | 'missing-variant-id';

type ProfileParseResult =
  | { ok: true; variant: ExtractedCardVariant }
  | {
      ok: false;
      variantId?: string;
      failures: Array<{ code: ProfileParseFailureCode; field: string }>;
    };
```

`ProfiledStorefrontCardParser.parse()` must evaluate all configured fields,
collect every failure, and return `ok: false` if any required output is
unusable. It must not default missing card name or set name to empty strings,
condition to `UNKNOWN`, or missing finish to `false`.

Constant `{ value: false }` remains the valid way for a reviewed profile to
declare that a format is always non-foil. Similarly, profiles must explicitly
provide an `isToken` policy, commonly a token predicate followed by
`{ value: false }`.

Retain card-first matching downstream. `isToken` is extracted metadata and
must not bypass normal card matching because real cards can have ambiguous
token-like signals. Document this behavior in the shared type.

### 4. Integrate failures into the production adapter

Update the mapping branch of `StorefrontExtractionAdapter` to:

- compile the mapping profile once per store/profile as it does today;
- parse every normalized variant with the discriminated result;
- return only successful variants;
- emit one structured, rate-limited warning per failure signature, including
  store, Shopify product ID, variant ID, and failure codes;
- expose aggregate parsed/rejected counts to the caller so onboarding and
  extraction status can report profile drift;
- treat a product with zero valid variants as an extraction failure/unmatched
  input rather than a successful empty offer.

Do not persist raw merchant payloads in logs. Titles and SKU values belong in
sanitized fixtures or the existing unmatched-card review path, not routine
warnings.

Art Series exclusion must continue to run before normal product processing.
Builtin parser paths must retain their current merge and fallback behavior.

### 5. Add an exact production dry-run boundary

Expose a read-only adapter method that accepts a `Store`, fetched Storefront
products, and no repositories, then returns:

```ts
type StorefrontParserDryRunReport = {
  sampledProducts: number;
  sampledVariants: number;
  validVariants: number;
  rejectedVariants: number;
  coverage: number;
  failuresByCode: Record<ProfileParseFailureCode, number>;
  variants: Array<{
    productId: string;
    variantId: string;
    result: ProfileParseResult;
  }>;
};
```

The onboarding code must use this production dry-run instead of independently
reimplementing parser success criteria. Keep merchant payload sanitization at
the reporting boundary.

### 6. Compatibility and rollout

- Audit existing database mapping profiles before enabling the stricter
  contract. Builtin profiles are unaffected.
- Update all development mapping fixtures to include explicit foil and token
  fallbacks.
- Deploy read compatibility for legacy absolute `shopifyUrl` values before
  changing generated writes.
- Add rejection metrics before activating an AI-generated mapping profile.
- Do not automatically rewrite, activate, or enqueue existing stores as part
  of this change.

## Tests

### Configuration

- canonical hostname, hostname with port, vanity domain, and `myshopify.com`;
- legacy absolute URL normalizes correctly;
- scheme duplication, credentials, paths, query, fragment, whitespace, and
  unsupported protocols are rejected;
- the generated proposal round-trips through `StorefrontClient` to the exact
  expected GraphQL endpoint;
- base URL remains the customer-facing product URL origin.

### Profile contract

- every required field and the set-name/set-code alternative;
- unknown top-level and nested properties;
- invalid sources, transforms, predicates, regexes, and values;
- builtin profiles remain valid;
- all existing development mapping profiles pass.

### Parser behavior

- valid normal, foil, token, and Art Series fixtures;
- missing card name, set identity, condition, finish, price, currency, and
  variant ID each return the expected failure code;
- multiple failures are returned together;
- missing foil never becomes `false`;
- explicit constant non-foil remains valid;
- malformed profiles fail during compile rather than during extraction.

### Adapter and regression

- rejected variants are excluded while valid sibling variants remain;
- products with zero valid variants are reported as failures;
- builtin extraction behavior is unchanged;
- current configured-store fixtures retain their expected coverage;
- production dry-run and runtime adapter parsing produce identical results.

## Acceptance criteria

- A generated store proposal produces the exact Storefront endpoint that the
  probe validated.
- No mapping-profile variant reaches persistence with an empty card name,
  missing set identity, unknown condition, inferred non-foil default, invalid
  price, missing currency, or missing platform ID.
- Profile validation, dry-run validation, and runtime parsing share one source
  of truth for required fields and failure codes.
- Existing builtin stores continue to extract without behavior changes.
- Focused shared/core/scraper tests, configured-store fixture coverage, the
  workspace build, and `git diff --check` pass.

## Delivery constraints for the implementing agent

- Preserve the current dirty workspace, including unrelated `TODO.md`.
- Do not reset, stash, amend, or overwrite unrelated user changes.
- Keep configuration/normalization changes separate from parser behavior in
  reviewable commits.
- Do not change production store rows, enqueue extraction, activate a store,
  deploy, or expose credentials.
