# Adding a catalogue backend

1. Add its `PlatformType` and discriminated `StoreScraperConfig` member in
   `packages/shared`; add a closed validator in `platform-config.validation.ts`.
2. Create an adapter folder owning API response types, authenticated client,
   pagination, normalization to `ExtractedCardVariant`, and parser profile
   inputs. Do not branch the generic extraction service.
3. Add explicit detection and probe gates to onboarding: endpoint verification,
   first page, constrained Magic scope, 100-variant deterministic sample,
   parser/matcher validation, and production-equivalent image selection.
4. Register the adapter with `PlatformModule` and `PlatformAdapterFactory`; add
   a platform planner if its pagination does not fit Shopify's time buckets.
5. Add typed admin fields that preserve unknown config keys. Secrets must be
   references, not JSON or editable credentials.
6. Test invalid config, detection/probe failures, response normalization,
   parser fixtures, image selection, pagination, transient/permanent errors,
   matching/persistence compatibility, and a manual trigger.
