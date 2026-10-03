# ScoutLGS workflow skills

These skills package recurring ScoutLGS workflows as small, task-specific
`SKILL.md` files. They are intended to be made available through the agent
harness or explicitly attached to a task; keeping them in the repository makes
their procedure versioned and reviewable.

| Skill | Use for |
| --- | --- |
| [`ci-triage`](ci-triage/SKILL.md) | diagnosing a failed CI check or local verification failure |
| [`storefront-regression`](storefront-regression/SKILL.md) | investigating adapter/parser drift with deterministic fixtures |
| [`feature-slice`](feature-slice/SKILL.md) | a bounded product change spanning one or more application layers |

Skills do not grant additional permissions. [`AGENTS.md`](../AGENTS.md) and
the [operating model](../docs/agents/OPERATING_MODEL.md) take precedence.
