# DGS-428 catch-up behaviour — Implementation Report

Ticket: DGS-428. Date: 2026-10-13. Branch `dgs-428`.

## Summary
A Maestro can now be caught up on its conductor's domain. A skill matches the intent "I want to catch up" by meaning, a command `scripts/conductor/catch-up-cli.ts` builds the catch-up, and an idle check prepares the second trigger. The result is written into the conductor's note as one block per Maestro identity.

## Built
- `scripts/conductor/catch-up-window.ts`: window (newest `last_seen` of the identity, any status, asking session excluded, 24 hours when new) and idle test.
- `scripts/conductor/catch-up.ts`: builds a `CatchUp` from the conductor state, adds window, identity, askedBy, soft ClickUp status; renders; writes ONE block per identity between `<!-- digismith:catch-up v1 maestro=<id> -->` markers; reuses a block younger than 30 minutes (`--refresh` collects again).
- `scripts/conductor/catch-up-cli.ts`: the command. Exit 0 ok, 2 bad arguments, 3 note missing, 4 note write failed (3 and 4 still print the catch-up). Names are checked (letters, digits, `.` `_` `-`).
- `scripts/conductor/idle-check.ts`: pre-prompt handler; silent unless an open Maestro card is older than its identity's other cards.
- `skills/catch-up/SKILL.md`: the intent skill, no keyword list.
- `scripts/conductor/deps-stub.ts`: stand-ins for DGS-417 (cards), 422 (state, note path, `writeStateBlock`), 427 (`renderCatchUp`); removed at rebase.

## Not done (by design)
- The idle handler is not yet in DGS-418's `hook-cli.ts` list: added at merge, after 418.
- OpenCode: text only (prompt rule and idle idea in `probe.md`); follow-up DGS-430.
- ClickUp comments are not read; status only, and unresolved keys show in Health.

## Review
Claude whole-branch review: 3 findings. Fixed with tests: an orphan open marker made a second write erase text after it (the same guard is needed in DGS-422's real `writeStateBlock`); path traversal through `--project` and `--conductor`; unchecked card values in the idle hint. Window, idle, reuse, exit codes and secrets: no issue.

## Tests
`FORCE_COLOR=1 pnpm test` green; new tests in `scripts/conductor/*.test.ts` (42).
