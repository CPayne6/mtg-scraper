# Agent operating model

## Default authority

Agents may inspect the repository, edit an isolated worktree, run local
development checks, and prepare a pull request or report. They must not merge,
deploy, access production, alter secrets, or create externally visible side
effects unless a task explicitly grants that authority. An explicit task never
grants an agent authority to merge to or push to `production`, deploy, or run a
production server operation; those actions remain human-only.

| Level | Permitted outcome | Human checkpoint |
| --- | --- | --- |
| Observe | Investigation, evidence, and a recommendation | Before any repository change |
| Propose | Issue, plan, or draft patch | Before an external action or scope expansion |
| Implement | Branch/worktree change with local validation | Before merge or production-impacting action |
| Release recommendation | PR review summary and release checklist | A human approves the production workflow |

The default for a task is **Implement** only when it is clearly bounded. If the
task contains ambiguity, an external mutation, a production consequence, or a
materially broader scope, stop at the relevant checkpoint and describe the
decision needed.

## Task sizing

### Small

A localized, reversible change with an obvious acceptance check. Inspect the
affected code and nearby tests, implement, run focused validation, and hand off.

### Medium

A change touching one service plus shared types, user-visible behavior, or a
non-obvious failure mode. State the proposed approach and affected boundaries
before implementation; add regression coverage and validate each affected
package.

### Large

A cross-service feature, migration, platform adapter, authentication change,
or deployment-affecting change. Write a durable plan before implementation that
covers behavior, interfaces, data changes, rollout/rollback, test strategy, and
the human checkpoint. Keep implementation increments reviewable.

## Required checkpoints

Stop and request direction before:

- expanding into an unrelated service or feature;
- modifying a migration, production deployment configuration, secret handling,
  authentication/authorization, or external merchant data;
- needing credentials, non-allowlisted network access, or a destructive command;
- performing a production deployment, merge, or push to `production`.

For the final checkpoint, the agent stops with a release recommendation. A
human performs the merge or deployment through the protected workflow.

Record a durable decision in [DECISIONS.md](DECISIONS.md) when it changes a
supported integration, public behavior contract, data model policy, or a safety
boundary. Do not log routine implementation choices.

## Review-ready delivery

Every change ends with the handoff format. A reviewer should be able to answer:

1. What changed and why?
2. What evidence shows it works?
3. What assumptions, limitations, or follow-ups remain?
4. Does this require a release decision?

Use the [handoff template](HANDOFF_TEMPLATE.md) verbatim for pull requests and
adapt it for issues when no code change was made.
