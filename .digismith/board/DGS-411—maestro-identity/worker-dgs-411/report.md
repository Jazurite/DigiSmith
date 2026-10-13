# DGS-411 report: Maestro identity

## What was built
- `scripts/identity.ts`: identity record (`~/.digismith-depot/identities/<id>.yml`: id, name, owner, project, folder, conductors, role, machine, state, created). Validated, no secrets, never overwritten, a broken record never breaks a session start.
- `scripts/identity-cli.ts`: `write`, `list`, `show`, `resolve`.
- `card-hook.ts` start: identity branch. No settings or hooks.json change (plan: Option A).
- `hook-cli.ts` start prints one context line (identity, project, session id, conductor, other open sessions of the identity).
- `idle-check.ts`: conductor from the record (env still first, then the old `<project>-conductor` rule).
- `skills/catch-up/SKILL.md`: step 1 reads the context line first.

## Rule
A session with no `DIGISMITH_ROLE`, no `HERDR_PANE_ID`, and a cwd whose main checkout (worktrees included) equals exactly one record's folder is that Maestro. **Herdr sessions with env still win** (the identity branch never runs for them, and they print no context line). Two matching records: no card, a stderr note. Any error: no card, exit 0.

## Review
Claude whole-branch review: no bugs. Fixed minor note: `state` must be an absolute path. Left: a crashed sibling stays "open" in the context line until marked lost (the line shows its last_seen).

## Tests
1808 pass (full suite). New: identity, identity-cli, hook identity branch (worktree cwd, two records, herdr silent, env unchanged, broken record, resume), idle conductor.

## First use
See probe.md: create the record with `identity-cli.ts write`, then Jack opens a new Desktop session.
