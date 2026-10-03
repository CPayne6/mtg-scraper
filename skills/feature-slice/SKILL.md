---
name: feature-slice
description: Deliver a bounded ScoutLGS feature slice with aligned contracts, focused tests, and a review-ready handoff.
---

Use this skill for a clearly defined product change. Do not use it for an
ambiguous roadmap item, broad refactor, migration, or production change without
first following the checkpoints in `docs/agents/OPERATING_MODEL.md`.

Find the closest existing vertical slice before choosing files to change. For
cross-layer work, keep shared types, persistence, API DTOs, and UI behavior
aligned; validate each surface that consumes a changed contract. Add focused
tests at the behavior boundary and use `docs/agents/EVALUATION.md` to select
proportionate checks.

Keep the work in an isolated branch or worktree, do not broaden scope, and
deliver the result with `docs/agents/HANDOFF_TEMPLATE.md`.
