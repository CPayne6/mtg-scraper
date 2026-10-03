---
name: storefront-regression
description: Investigate ScoutLGS retailer adapter or parser drift using deterministic fixtures and platform-neutral offer contracts.
---

Use this skill when a Shopify Storefront, Conduct Commerce, or other merchant
adapter returns missing, malformed, stale, or incorrectly normalized listings.
Do not use it for onboarding or altering a live merchant configuration.

Read the storefront runbook in `docs/agents/RUNBOOKS.md` and inspect the owning
adapter plus its tests under `packages/core/src/platform/adapters` or the
relevant scraper processor. Start from a fixture or mocked response; add a
focused regression test that describes the observed contract mismatch.

Keep offer fields platform-neutral and preserve explicit quantity semantics:
unknown quantity stays nullable, while a known zero quantity means unavailable.
Do not use live retailer data as the only proof, use approval flags, or mutate
store records. Validate the focused adapter tests and affected package build,
then use the standard handoff template.
