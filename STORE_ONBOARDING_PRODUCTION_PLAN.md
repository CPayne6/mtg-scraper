# Store onboarding: production-readiness plan

## Goal

Make the Shopify storefront onboarding workflow safe, reproducible, and
operationally ready to add a new store without exposing it to customers until
its data has been verified in production.

The workflow in scope is:

- `pnpm store:probe` — read-only discovery and configuration proposal.
- `pnpm store:verify-listings` — read-only verification of listing fields.
- reviewed seed/configuration changes — adds the store in a disabled state.
- scheduler and scraper extraction — validates real ingestion.
- activation — makes verified offers visible to the API/UI.

## Current blockers

1. `scripts/probe-storefront-store.ts` imports
   `storefront-parser-profile.js` as a default export. The compiled CommonJS
   module has named exports only, so the script fails before making any probe
   request. Replace the default import with named imports (or a namespace
   import) and add a regression test that executes the script's module load.
2. The script command requires the root `tsx` executable. A clean production
   or CI checkout must install dev dependencies before using `pnpm store:probe`.
   Document and verify `pnpm install --frozen-lockfile --prod=false` in the
   onboarding runbook/CI job. Do not run an install on a nearly full host;
   first ensure enough free space for the workspace dependencies.
3. Production currently returns no card offers because offers older than 26
   hours are intentionally excluded by the API. Do not activate an onboarded
   store until the scheduler and scraper pipeline are confirmed to refresh
   offers inside that freshness window.

## Phase 1 — repair and unit-test the tooling

1. Update `scripts/probe-storefront-store.ts` to import
   `normalizeStorefrontProfileInputs` and
   `validateStorefrontParserProfile` as named exports from
   `packages/shared/dist/storefront-parser-profile.js`.
2. Ensure the probe and verification scripts can run from a clean checkout:

   ```sh
   pnpm install --frozen-lockfile --prod=false
   pnpm store:probe --help
   pnpm store:verify-listings --help
   ```

3. Add automated tests for:

   - argument validation (`--url`, `--approve`, `--output`);
   - loading the probe module with the compiled shared package;
   - a mocked tokenless Storefront GraphQL success response;
   - GraphQL rejection, timeout, no inferred MTG scope, and invalid parser
     profile cases;
   - confirmation that default mode never writes a file, database row, or
     queue job.
4. Keep output stable and structured. The probe should exit non-zero when it
   cannot produce a safe disabled-store proposal, and should clearly state why.

## Phase 2 — validate all currently configured stores

Use the exact Storefront hosts configured in `apps/api/src/database/seed.ts`.
The `shopifyUrl` host is authoritative when present; do not substitute a
merchant vanity domain for these stores.

| Store | Probe URL |
| --- | --- |
| Face to Face Games | `https://facetofacegames.com` |
| 401 Games | `https://store.401games.ca` |
| Hobbiesville | `https://hobbiesville.com` |
| House of Cards | `https://house-of-cards-mtg.myshopify.com` |
| Black Knight Games | `https://black-knight-games.myshopify.com` |
| Exor Games | `https://most-wanted-ca.myshopify.com` |
| Game Knight | `https://gameknight-games.myshopify.com` |
| The CG Realm | `https://the-cg-realm.myshopify.com` |

For each store, run only read-only commands first:

```sh
pnpm store:probe --url <probe-url> --name <store-slug> --no-ai-discovery
pnpm store:verify-listings --url <probe-url> --no-ai-verify
```

Record, for every result:

- HTTP status and GraphQL errors from the tokenless Storefront request;
- the proposed MTG-only `storefrontScope` and the number of sampled products;
- whether BinderPOS was detected;
- parser validation errors and warnings;
- whether title/SKU/options actually identify card name, set, collector number,
  condition, and foil treatment;
- whether the proposed parser matches the parser already configured in seed data.

Acceptance criteria for an existing store: both commands succeed, the
Storefront request is tokenless and returns non-empty scoped products, and the
parser identifies the baseline offer fields without unsupported assumptions.
Any store failing those criteria remains disabled and gets a targeted parser or
access-policy investigation.

## Phase 3 — onboard a new store safely

1. Run the read-only probe and listing verification against the candidate
   storefront. Use `--no-ai-discovery` / `--no-ai-verify` for the deterministic
   baseline; AI output is advisory only.
2. Manually review at least five diverse products and variants. Verify that the
   inferred scope contains MTG singles and excludes sealed product/accessories.
3. If and only if the deterministic validation passes, create a review bundle:

   ```sh
   pnpm store:onboard --url <store-url> --name <store-slug> \
     --output onboarding/<store-slug>
   ```

   This must create a disabled store proposal only. It must not write to the
   production database, enqueue scraping, or expose the store in the UI.
4. Review `proposal.json`, parser fixture, parser validation, and generated
   seed fragment. Add the reviewed configuration to the seed source with:

   - `isActive: false`;
   - `discoveryConfig.discoveryEnabled: false`;
   - an explicit Storefront API host/version/scope;
   - a built-in parser only when its format has been verified, otherwise an
     approved mapping parser profile.
5. Add fixture-based parser tests using sanitized samples from the review
   bundle. Tests must cover normal, foil, non-foil, and at least two conditions
   when those forms exist.

## Phase 4 — production deployment and extraction validation

1. Merge the tooling repair, tests, and reviewed disabled-store configuration.
   Build and deploy the API, scheduler, scraper, and UI images from the same
   commit/tag.
2. Apply migrations before enabling per-store scheduling. Confirm migrations
   for store sync state and storefront parser profiles have completed.
3. Confirm production services are healthy:

   ```sh
   docker service ls
   docker service logs --tail 200 scoutlgs_scheduler
   docker service logs --tail 200 scoutlgs_scraper
   docker service logs --tail 200 scoutlgs_api
   ```

4. Verify the scheduler is dispatching due stores and that scraper workers are
   consuming `storefront-extraction` jobs. Check queue failures, rate limits,
   Shopify 429/430 responses, proxy failures, and parser match rates.
5. Perform one controlled extraction for the disabled candidate store. Inspect
   the database and compare a sample against the merchant site:

   - product URL resolves to the correct listing;
   - price, CAD currency, stock state, condition, foil, set, and collector
     number are correct;
   - no sealed or unrelated products were imported;
   - `price_updated_at` is fresh;
   - unmatched/ambiguous cards are recorded for review instead of being
     attached to the wrong printing.
6. Confirm known cards return fresh offers through the public API. For example,
   query a card with a known Oracle ID and ensure `results` is non-empty and
   includes the candidate store only after activation.

## Phase 5 — activation and rollback

1. Enable the store only after Phase 4 succeeds: set `isActive: true` and
   `discoveryEnabled: true` through the reviewed configuration/deployment path.
2. Re-run an extraction, verify the public API/UI, and monitor the first full
   24-hour cycle.
3. Roll back immediately if prices, card identity, stock, or scope are wrong:

   - set `isActive: false` and `discoveryEnabled: false`;
   - stop/clear only that store's pending extraction jobs;
   - preserve extraction logs and fixtures for diagnosis;
   - do not delete historical records until the corrective configuration has
     been reviewed.

## Production gates

Do not consider onboarding production-ready until all of these are true:

- the commands execute in a clean checkout;
- tokenless Storefront API access works for the candidate store;
- parser fixtures and deterministic validation pass;
- the store starts disabled and cannot be exposed accidentally;
- scheduler/scraper health and fresh-offer monitoring are operational;
- one controlled production extraction is manually verified;
- rollback is tested for a single store without affecting the others.
