---
name: ci-triage
description: Diagnose a ScoutLGS CI or local verification failure and prepare a minimal, evidenced fix or report.
---

Use this skill for a demonstrated failed build, test, typecheck, lint check, or
GitHub Actions run. Do not use it to make speculative cleanup changes.

Read `AGENTS.md` and the CI runbook in `docs/agents/RUNBOOKS.md`. Identify the
earliest actionable failure, reproduce with the narrowest available command,
and change only what the evidence supports. Preserve any unrelated worktree
changes.

For a fix, add or update regression coverage when the failure represents a
behavior defect. Run the focused check after the change and hand off using
`docs/agents/HANDOFF_TEMPLATE.md`. If the failure cannot be reproduced because
of an unavailable service or secret, report that boundary and the strongest
available evidence; do not work around it by accessing secrets or production.
