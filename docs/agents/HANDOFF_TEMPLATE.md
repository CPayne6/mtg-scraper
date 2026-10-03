# Agent handoff template

Use this format in a pull request description, issue, or final delivery report.
Omit sections that are genuinely inapplicable; do not claim checks that were not
run.

## Summary

- **Outcome:**
- **Scope:**
- **User-visible or operational effect:**

## Evidence

- **Changed areas:**
- **Tests/checks run:** command and result for each
- **Manual verification:** what was observed, if applicable

## Review notes

- **Assumptions:**
- **Risks or limitations:**
- **Follow-up work:**
- **Release decision required:** no / yes — explain

## Safety confirmation

- [ ] No `.env*`, credentials, secrets, or private keys were read, changed, or included.
- [ ] No production deployment, live-data mutation, or direct server operation occurred.
- [ ] Final diff was reviewed for unintended changes.
