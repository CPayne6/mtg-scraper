# Production Git Safety

- Never check out the `production` branch in the primary local checkout.
- Do not force-move, reset, or otherwise mutate the local `production` ref as part of production work.
- When production code must be inspected or changed, create an isolated worktree on a temporary branch based on `origin/production` (for example, `git worktree add -b hotfix-name <path> origin/production`).
- Treat the primary local checkout as a development workspace: preserve its branch and all pre-existing uncommitted changes.
- Trigger production deployments only by pushing an approved change to the remote `production` branch or by starting the appropriate GitHub Actions workflow. Never deploy by running server-side deployment scripts directly.
