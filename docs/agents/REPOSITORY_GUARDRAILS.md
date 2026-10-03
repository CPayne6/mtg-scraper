# Repository guardrails

The files in `.github` standardize agent work, but GitHub settings enforce the
merge boundary. A repository administrator should configure these once in the
GitHub UI.

## Production branch

Create a ruleset for `production` that requires a pull request, at least one
approval, and passing required status checks. Require review from code owners,
dismiss stale approvals when the diff changes, block force pushes and branch
deletion, and include administrators unless an explicit break-glass policy is
defined.

Use `.github/CODEOWNERS` to route changes to agent policy, deployment
configuration, infrastructure, and skills to the repository owner. Keep the
GitHub handle in that file current.

## Pull requests and tasks

The pull request template asks for evidence and a safety confirmation. The
Agent task issue form captures scope and acceptance evidence before an agent is
assigned. Create an `agent-task` label in GitHub so issue-form submissions are
categorized automatically.

## CI

Protect `production` with the CI checks that actually validate the repository.
Before making a check required, ensure the workflow runs it consistently for
pull requests and fails on a real regression. Do not mark a check as required
solely because a document says agents should run it.

GitHub rules cannot prevent every local action, so `AGENTS.md` remains the
runtime contract. Conversely, instructions alone cannot prevent a merge, so the
ruleset remains required for production protection.
