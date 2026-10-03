# Durable agent-facing decisions

Record decisions that constrain future work. Do not add implementation notes,
temporary status, or duplicate issue discussion.

## Entry format

```markdown
## YYYY-MM-DD — Decision title

- **Context:** Why a durable decision was needed.
- **Decision:** The agreed policy or design.
- **Alternatives:** Material options considered and why they were not chosen.
- **Consequences:** Constraints, migrations, or follow-up work future changes must respect.
- **Evidence:** Relevant issue, PR, test, or document.
```

## Current decisions

### 2026-10-03 — Agent changes require human-reviewed production release

- **Context:** ScoutLGS deploys when approved changes reach the remote
  `production` branch, and production uses Docker Swarm secrets.
- **Decision:** Agents may prepare reviewable changes and release
  recommendations, but must not merge to or push to `production`, initiate a
  deployment, run server-side deployment scripts, or mutate production data.
  These actions remain human-only even when a task explicitly asks for them.
- **Alternatives:** Fully autonomous merge/deploy was not adopted because it
  would bypass the required review checkpoint for production effects.
- **Consequences:** Production-impacting work requires a human review and the
  protected GitHub workflow. Local primary checkouts must preserve the local
  `production` ref.
- **Evidence:** [`AGENTS.md`](../../AGENTS.md) and
  [operating model](OPERATING_MODEL.md).
