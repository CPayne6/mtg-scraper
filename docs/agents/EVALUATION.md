# Evaluating agent work

## Acceptance evidence

Review outcomes, not agent narration. A completed task needs evidence matching
the change's risk and surface area:

| Change | Minimum evidence |
| --- | --- |
| Documentation or configuration guidance | Links resolve, commands and paths exist, and no policy conflicts are introduced |
| Isolated domain logic | Focused unit test or a clear reason one is not applicable |
| API or worker behavior | Relevant unit/integration tests plus build validation for affected packages |
| UI behavior | Component/unit test where practical, UI typecheck/build, and visual/manual evidence for user-visible changes |
| Adapter/parser behavior | Deterministic fixture or mock that captures the regression; no live merchant mutation needed |
| Migration or production-impacting change | A reviewed plan, rollback path, targeted validation, and explicit human approval before release |

## Commands in this workspace

Use the smallest relevant command set. These commands are examples, not an
instruction to run every command for every change.

```powershell
pnpm --filter api test
pnpm --filter api build
pnpm --filter scraper test
pnpm --filter scheduler test
pnpm --filter ui-v2 test
pnpm --filter ui-v2 typecheck
pnpm --filter ui-v2 build
pnpm --filter @scoutlgs/core test
pnpm --filter @scoutlgs/core build
pnpm nx affected --target=build --base=origin/<pr-target-branch> --head=HEAD
```

The API, scraper, and scheduler lint scripts apply automatic fixes. If lint is
used, review its diff and state whether any changes were retained.

Set the affected baseline to the pull request's target branch. For example, use
`origin/production` for a production PR; do not assume `origin/master` is the
right comparison branch.

## Review checklist

- The patch fulfills the stated outcome without unrelated changes.
- Tests exercise the changed behavior or a concrete limitation is disclosed.
- Types and public contracts remain aligned across `apps` and `packages`.
- Parser changes use stable fixtures rather than relying solely on live stores.
- New behavior does not weaken rate limiting, queue priority, cache safety, or
  live stock correctness.
- The handoff identifies incomplete work and any required human approval.

## Improving the system

When a recurring agent failure is observed, first ask whether a test, type,
script, or CI check can prevent it. Add an instruction only when the constraint
is durable, non-obvious, and cannot be enforced more reliably elsewhere.
