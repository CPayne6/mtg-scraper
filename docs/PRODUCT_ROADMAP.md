# ScoutLGS Product Roadmap

This roadmap focuses on turning ScoutLGS from a useful price-search tool into a durable product experience. It intentionally excludes payment and monetization.

## Current Product Shape

ScoutLGS already has strong product foundations:

- Normalized card, token, store, listing, variant, product URL, and discovery run tables.
- A V1 card search API with pagination, filters, price stats, and store/condition counts.
- A token search API that is not yet surfaced in the UI.
- A server-backed list API using the `scoutlgs_uid` anonymous owner cookie.
- A discovery/extraction pipeline for pre-scraped store inventory.
- Scheduler and manual operational endpoints for scraping, discovery, extraction retry, and unmatched-card re-extraction.

The largest current gap is that the UI still behaves like a local tool in important places. The active list workflow is localStorage based, while the backend already supports persisted anonymous lists.

## Architecture Boundary: Identity, Ownership, And Sharing

User information, sessions, global privileges, and non-owner sharing grants should live in a separate identity database. The application database should continue to own card data, store data, listings, product URLs, scrape state, list content, list ownership, and list visibility.

Recommended ownership split:

- Application database: `card_lists`, `card_list_entries`, list owner UUID, list visibility, cards, tokens, stores, product URLs, discovery runs, listings, variants, unmatched cards.
- Identity database: `users`, `user_sessions`, `global_roles`, `role_grants`, non-owner `resource_grants`, `user_preferences`.
- Application database keeps `owner_cookie` for anonymous list ownership and migration only.
- Application database stores the canonical `owner_user_uuid` on `card_lists`.
- Identity database stores shared access for non-owner users by referencing `card_lists.uuid`, not the application database integer ID.

Best-practice parameters:

- Use stable UUIDs at database boundaries. Do not expose or store cross-database references using internal integer IDs.
- Do not create cross-database foreign keys. Validate resource existence in application code.
- Treat `card_lists.owner_user_uuid` as the source of truth for ownership.
- Treat the identity database as the source of truth for non-owner authenticated access and global privileges.
- Keep sensitive user fields out of the application database.
- Keep authorization checks server-side. Never trust user IDs, roles, or permission claims from request bodies.
- Prefer short-lived sessions or refreshable session tokens with server-side revocation.
- Log ownership, visibility, and sharing changes with actor, target user, resource UUID, previous state, new state, timestamp, and request ID.
- Avoid distributed transactions for normal request flow. Use transactions inside each database and an outbox/repair job for cross-database reconciliation when needed.

## 1. Accounts And Persisted Lists

Add first-class accounts while keeping anonymous usage.

Recommended routes:

- `/login`
- `/signup`
- `/account`
- `/account/lists`
- `/settings`

Recommended backend additions:

- Identity database: `users`, `user_sessions`, `global_roles`, non-owner `resource_grants`, `user_preferences`.
- Application database: add `owner_user_uuid`, `visibility`, public share settings, and keep `owner_cookie` on `card_lists` for anonymous ownership and account-claim migration.
- Use `card_lists.uuid` as the shared-resource identifier in the identity database.

Product value:

- Lists survive device changes and browser clearing.
- Users can keep preferred stores, conditions, and regions.
- Anonymous users can try the product before creating an account.
- Existing anonymous lists can be migrated into the new account.

Best-practice parameters:

- Store credentials, sessions, global privileges, and non-owner resource grants only in the identity database.
- Store canonical list ownership and list visibility on `card_lists`.
- Reference users across services by immutable `user_uuid`, not email.
- Reference lists in sharing grants by immutable `card_list_uuid`, not the application DB integer ID.
- Keep `owner_cookie` HTTP-only, `SameSite=Lax`, secure in production, and never readable by frontend JavaScript.
- Use least privilege roles: unauthenticated, authenticated user, admin, and internal service identities.
- Keep account creation, login, logout, session refresh, and sharing/ownership mutation behind rate limits and audit logging.

## 2. List Workspace

Replace the current localStorage deck workflow with the existing `/v1/lists` API.

Recommended routes:

- `/lists`
- `/lists/new`
- `/lists/:id`
- `/lists/:id/edit`

Recommended features:

- Create, rename, edit, duplicate, and delete lists.
- Display cheapest available copy per card.
- Show missing cards and unresolved imports.
- Save list filters for stores, conditions, set, and foil preference.
- Show total estimated deck cost.
- Show best purchase plan by cheapest total or fewest stores.
- Export to CSV, ManaBox, or clipboard.

First technical task:

- Migrate the list UI off localStorage and onto `/v1/lists`.
- Unify the old `/card/:name` usage with `/v1/cards/search`.
- Fix the current UI typecheck failure in `DeckDisplay` where old `StoreFilter` props are still being passed.

Best-practice parameters:

- All list mutations must call a server-side authorization check.
- List reads should be allowed by one of: matching anonymous `owner_cookie`, authenticated owner, authenticated sharing grant, valid public share token, or public visibility.
- Use optimistic UI only after the server accepts the mutation, or include rollback behavior.
- Keep list URLs UUID-based and avoid exposing sequential integer IDs.
- Validate list size, card name length, duplicate handling, and malformed imports server-side.
- Store normalized card references in `card_list_entries`; keep raw imported text only if needed for audit or troubleshooting.

## 3. Store Directory And Store Expansion

Make stores visible as a product surface instead of hidden seed/config data.

Recommended routes:

- `/stores`
- `/stores/:slug`
- `/suggest-store`
- `/admin/stores`

Recommended features:

- Store profile pages with logo, website, platform type, active status, inventory count, and last updated time.
- Store-level freshness and scrape health indicators.
- "Suggest a store" form for users.
- Admin tools for activating, disabling, and validating stores.

Store expansion priorities:

- Make Shopify/BinderPOS store onboarding mostly config-driven.
- Finish or explicitly scope the Conduct/Crystal Commerce adapter path.
- Track per-store quality metrics before adding many more stores.

Best-practice parameters:

- Store management should require an admin/global privilege from the identity database.
- Store-facing admin actions should be audited: actor, store UUID, action, before state, after state.
- Keep scraper credentials and proxy credentials in secrets management, not database rows.
- Add new stores in a disabled or validation state before making them visible to users.
- Track quality gates before activation: successful discovery, extraction success rate, unmatched rate, stale rate, and recent scrape errors.
- Use per-store rate limits and circuit breakers to protect both ScoutLGS and store websites.

## 4. Browse, Tokens, Deals, And Discovery Routes

Move beyond exact card-name search.

Recommended routes:

- `/search`
- `/tokens`
- `/sets`
- `/sets/:code`
- `/deals`
- `/popular`
- `/watchlist`

Recommended features:

- Advanced search across card name, set, store, condition, foil, price, and quantity.
- Token search UI backed by the existing token API.
- Set pages showing available cards by local store inventory.
- Deal pages for cheapest listings, price drops, and newly available cards.
- Popular card pages backed by EDHREC/popular-card scheduler data.

Product value:

- Users can browse inventory without already knowing the exact card name.
- Tokens become a visible feature instead of hidden backend capability.
- "Deals" and "newly available" create repeat usage.

Best-practice parameters:

- Keep browse/search endpoints read-only and cache-friendly.
- Put hard limits on pagination, sort fields, and filter cardinality.
- Use allowlisted sort/filter parameters instead of passing arbitrary query fields into SQL builders.
- Return freshness metadata with results so the UI can label stale inventory.
- Keep tokens and cards separate internally, but normalize enough response shape that the UI can reuse list/filter components.
- Treat deals and price-drop pages as derived views from trusted listing data, not manually curated state.

## 5. UI, Trust, And App Shell

Move the UI from a centered tool page to a navigable application.

Recommended improvements:

- Persistent app shell with search, lists, stores, account, and theme controls.
- Mobile filter drawers instead of sidebars only.
- Clear empty, error, partial-result, and store-failure states.
- Show listing freshness: last scraped, last price update, and stale indicators.
- Show store-level errors without making the whole search look broken.
- Consistent skeleton loading states.
- Cleaner home page copy and brand positioning.
- Remove or archive the stale `nextjs` tree once the Vite app is confirmed as canonical.

Trust matters because scraped inventory can be stale. The UI should make freshness, source, and uncertainty visible.

Best-practice parameters:

- Never rely on the frontend for permission enforcement; hide controls for UX, but enforce on the API.
- Use a single typed API client for `/v1` endpoints to avoid route and response drift.
- Show partial failures explicitly: one store failing should not make the whole search look broken.
- Display `last updated` and stale indicators near price-sensitive data.
- Keep account, list, and sharing actions discoverable but not noisy.
- Keep admin navigation separate from normal user navigation and permission-gated server-side.

## Additional Product Recommendations

### Admin And Operations Dashboard

Add an internal `/admin` surface for:

- Queue depth.
- Failed jobs.
- Failing stores.
- Discovery runs.
- Extraction errors.
- Unmatched cards.
- Last successful scrape per store.
- Product URL extraction status.

This is not a user-facing feature, but it will make the product much easier to operate.

Best-practice parameters:

- Admin access should be controlled by a global privilege in the identity database.
- Admin APIs should require stronger session posture than normal browsing, such as recent login or elevated role.
- Every manual trigger, retry, store change, and permission change should be audit logged.
- Do not expose secrets, proxy credentials, raw cookies, or session tokens in admin UI.
- Admin pages should show current state and last action result, not just fire-and-forget buttons.

### Data Quality Tools

Build a workflow for resolving `unmatched_cards`.

Recommended features:

- Map raw scraped names to Scryfall card names.
- Retry extraction after matcher improvements.
- Flag bad product pages.
- Track match confidence.
- Review repeated unmatched names by store.

Better matching directly improves user trust and result coverage.

Best-practice parameters:

- Data quality actions should require admin or maintainer privileges.
- Store manual mappings separately from raw scraped data so extractor reruns remain reproducible.
- Track who created or changed a mapping.
- Keep confidence levels and matching reasons for troubleshooting.
- Make data repair operations idempotent where possible.

### Deck Shopping Optimizer

This is likely the strongest product feature.

Recommended modes:

- Cheapest total.
- Fewest stores.
- Preferred stores only.
- Near-mint only.
- Include or exclude foils.
- Maximize cards found locally.

The product promise becomes: "Here is the best way to buy this whole deck locally."

Best-practice parameters:

- Define optimizer modes explicitly and keep them deterministic.
- Show the assumptions used: selected stores, conditions, foil handling, stale-data threshold, and missing cards.
- Separate calculation from presentation so the same optimizer can power UI, exports, and future alerts.
- Avoid promising checkout availability; scraped inventory should be labeled as an estimate until verified by the store.
- Cache optimizer results briefly, but invalidate when list contents or filters change.

### Import Integrations

Add first-class imports for:

- Moxfield.
- Archidekt.
- ManaBox.
- CSV.
- Clipboard.

The current codebase already has some deck/import utility work. Make import feel native and forgiving.

Best-practice parameters:

- Treat all imported content as untrusted input.
- Validate file size, line count, URL shape, and card count limits server-side.
- Preserve unresolved rows so users can correct them.
- Show fuzzy matches before or after import with clear warnings.
- Do not require account creation before import, but allow imported anonymous lists to be claimed later.

### Watchlists And Alerts

Start with in-app watchlists, then add email later after accounts exist.

Watch triggers:

- Price drop.
- Restock.
- New store availability.
- Card appears under a target price.
- Missing list card becomes available.

Best-practice parameters:

- Watchlists should be account-owned and permission-checked through the identity database.
- Store alert preferences separately from alert events.
- Deduplicate alerts to prevent notification spam.
- Include freshness and store source in every alert.
- Make opt-out and delete controls obvious.

### Public Share Pages

Add read-only list sharing.

Recommended routes:

- `/share/:shareId`
- `/lists/:id/share`

Recommended features:

- Public read-only deck price page.
- Export buttons.
- Optional hidden owner identity.
- Optional expiry or unshare control.

Best-practice parameters:

- Keep public share state on `card_lists`; no dedicated public-share table is needed for the first version.
- Store only a hash of public share tokens if tokenized unlisted links are used.
- Public shares should be read-only by default.
- Owners should be able to revoke or rotate share links.
- Do not expose owner email or private account details on public pages.

### Product Analytics

Track anonymous product events without monetization:

- Search terms.
- Failed searches.
- Popular cards.
- Store filter usage.
- Condition filter usage.
- List creation.
- Import failures.
- Suggested stores.

Use this to prioritize new stores, matcher fixes, and UI improvements.

Best-practice parameters:

- Avoid storing raw personally identifiable information in analytics events.
- Use anonymous event IDs unless the event genuinely requires account linkage.
- Record consent and opt-out state if analytics becomes user-identifying.
- Keep analytics separate from authorization decisions.
- Define retention windows for event data.

## Anonymous To Account Migration

Yes, `scoutlgs_uid` can carry over anonymous information and lists when a user creates an account.

The current list API already creates and reads lists using the `scoutlgs_uid` owner cookie. That makes migration straightforward: when the user signs up or logs in, the server reads the existing cookie and claims those anonymous records by setting `card_lists.owner_user_uuid`.

### Recommended Data Model

Add identity tables in the identity database:

- `users`
- `user_sessions`
- `global_roles`
- `role_grants`
- `resource_grants`
- `user_preferences`

Core `users` fields:

- `uuid`
- `email`
- `display_name`
- `password_hash` or external auth provider fields
- `created_at`
- `updated_at`

Add ownership and visibility fields to `card_lists` in the application database:

- `owner_user_uuid`, nullable while anonymous
- `owner_cookie`, nullable after claim
- `visibility`, such as `private`, `unlisted`, or `public`
- `public_share_enabled`
- `public_share_token_hash`, nullable
- `public_share_expires_at`, nullable
- `claimed_at`, nullable

Add a `resource_grants` table in the identity database for non-owner sharing:

- `resource_type`, for example `card_list`
- `resource_uuid`, matching `card_lists.uuid`
- `grantee_user_uuid`, matching `users.uuid`
- `role` such as `editor` or `viewer`
- `granted_by_user_uuid`
- `created_at`
- `updated_at`
- `revoked_at`, nullable

Keep `owner_cookie` on `card_lists` in the application database for anonymous ownership and migration. Once a list is claimed by an account, ownership should be represented by `card_lists.owner_user_uuid`; sharing to other users should be represented by identity database `resource_grants`.

This model naturally allows only one owner because the owner is a single column on `card_lists`. Do not store `owner` rows in `resource_grants`; that would create two sources of truth.

Enforce one grant row per grantee per resource:

```sql
ALTER TABLE resource_grants
ADD CONSTRAINT uq_resource_grant_user
UNIQUE (resource_type, resource_uuid, grantee_user_uuid);
```

This is a standard hybrid shared-resource model: the resource owns its canonical owner and visibility, while the identity database owns account identity, global privileges, and non-owner sharing grants.

Optional audit fields on `card_lists`:

- `created_by_user_uuid`
- `last_shared_at`
- `deleted_at`

Optional later tables:

- `user_preferences`
- `user_store_preferences`
- `watchlists`
- `watchlist_entries`

Best-practice parameters:

- Keep user profile, session, global role, and non-owner grant data in the identity database.
- Keep list content in the application database.
- Keep list ownership and visibility in the application database.
- Use UUIDs at the boundary between databases.
- Avoid cross-database joins in request paths. Fetch the resource from the application database, then check owner UUID, visibility, and any needed non-owner grant from identity.
- Add reconciliation jobs to find grants pointing to deleted resources and account-owned lists whose owner user no longer exists.

### Signup Migration Flow

1. User has anonymous lists owned by `scoutlgs_uid`.
2. User creates an account.
3. API creates the user and session.
4. API reads `scoutlgs_uid` from the request cookie.
5. API claims active anonymous lists in the application database.

   Application database update:

   ```sql
   UPDATE card_lists
   SET owner_user_uuid = $1,
       owner_cookie = NULL,
       claimed_at = NOW(),
       expires_at = NULL
   WHERE owner_cookie = $2
     AND owner_user_uuid IS NULL
     AND expires_at > NOW();
   ```

6. API clears the anonymous owner cookie or leaves it only for new anonymous lists.
7. UI redirects to `/account/lists` or the previous list.

### Login Migration Flow

If an existing account logs in from a browser with anonymous lists:

1. Detect anonymous lists for `scoutlgs_uid`.
2. If the user has no matching account lists, merge automatically.
3. If there are conflicts, show a small merge prompt:
   - "Import anonymous lists"
   - "Keep separate"
   - "Delete anonymous lists"

For the first version, automatic import is acceptable if list names are deduplicated.

### Conflict Handling

Recommended simple rules:

- If an anonymous list name conflicts with an account list name, rename the imported one to `Name (Imported)`.
- If the account already has the same cards in the same order, skip the duplicate.
- If account list limits exist, raise or remove the limit for accounts.
- If the user is already a viewer/editor on a matching shared list, do not overwrite that shared role unless they explicitly import their anonymous copy.

### Security Notes

- Do not trust a client-provided owner ID from the request body.
- Only read `scoutlgs_uid` from the HTTP-only cookie.
- After claiming anonymous lists, do not let the old owner cookie continue to mutate claimed lists.
- Treat `card_lists.owner_user_uuid` as the source of truth for ownership.
- Treat identity database `resource_grants` as the source of truth for non-owner authenticated account access.
- Keep anonymous list edit access limited to requests with the matching owner cookie.
- Keep anonymous list access by UUID read-only/share-like unless the owner cookie or authenticated member permits mutation.

### Sharing And Permissions

Use roles instead of hard-coded ownership checks:

- `owner`: stored on `card_lists.owner_user_uuid`; can edit cards, filters, name, sharing, visibility, transfer ownership, and delete the list.
- `editor`: can edit cards and filters, but cannot delete or transfer ownership.
- `viewer`: can view the list and current prices.

Ownership transfer should run in an application database transaction:

- Verify the acting user matches `card_lists.owner_user_uuid`.
- Set `owner_user_uuid` to the new owner's user UUID.
- Optionally create or update a `resource_grants` row for the previous owner if they should retain `editor` or `viewer` access.

Recommended sharing routes:

- `/lists/:id/share`
- `/share/:shareId`

Recommended API behavior:

- List reads should allow owner cookie, authenticated owner, non-owner grant, valid unlisted share token, or public visibility.
- Mutations should require owner cookie for anonymous lists, `owner_user_uuid` match for owner actions, or `editor` grant for editable shared lists.
- Sharing and visibility changes should require `owner_user_uuid` match.
- Public or unlisted access should be read-only by default.

Best-practice parameters:

- Use one authorization helper/service for all ownership and sharing checks.
- Do not duplicate authorization logic in controllers.
- Check ownership by `card_lists.owner_user_uuid`.
- Check non-owner grants by `resource_type`, `resource_uuid`, `grantee_user_uuid`, and required action.
- Keep owner transfer transactionally safe inside the application database.
- If application and identity updates must both happen, make the operation retryable and auditable.

### Product Behavior

Before account:

- Lists are anonymous and temporary.
- UI can show "Saved on this browser."

After account:

- Lists become permanent account data.
- UI can show "Imported 3 saved lists."
- User preferences can be initialized from anonymous filters and local settings.

## Suggested Implementation Order

1. Fix current UI typecheck and unify list/filter component contracts.
2. Migrate the active list UI from localStorage to `/v1/lists`.
3. Add account tables, sessions, and anonymous list migration.
4. Add `/account/lists` and list management routes.
5. Add store directory and internal admin store health views.
6. Add token, advanced search, set, deals, and watchlist routes.
7. Build the deck shopping optimizer.
8. Add public share pages.
9. Add product analytics and data quality workflows.
