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
- Real modules after the rebase: 417 cards (`listCards`, `findCardBySession`), 422 (`collectState`, `resolveNotePath`, `writeStateBlock(notePath, body, Marker)`, `catchUpMarker`, `extractBlock`), 427 (`renderCatchUp`, `CatchUp`). The stubs are deleted. `--note <path>` selects a scratch note.
- `idleHandler` is registered in 418's `PRE_PROMPT_HANDLERS` (`scripts/session-cards/hook-cli.ts`); `conductorFor` = `<domain lowercased>-conductor`, override `DIGISMITH_CONDUCTOR`, unknown = silent. A test through the real `runPrompt` shows the idle check runs before the heartbeat. The hint prints only fixed text plus charset-checked values, single-quoted.

## Not done (by design)
- OpenCode: text only (prompt rule and idle idea in `probe.md`); follow-up DGS-430.
- ClickUp comments are not read; status only, and unresolved keys show in Health.

## Review
Claude whole-branch review: 3 findings. Fixed with tests: an orphan open marker made a second write erase text after it (the same guard is needed in DGS-422's real `writeStateBlock`); path traversal through `--project` and `--conductor`; unchecked card values in the idle hint. Window, idle, reuse, exit codes and secrets: no issue.

## Tests
`FORCE_COLOR=1 pnpm test`: 127 files, 1779 tests, green. `pnpm --filter @digismith/cli build` clean (packages/cli untouched).

## Honest limits of the first use
(a) The Maestro's live Desktop session has no env and no card, so the hooks (idle trigger) cannot fire in it until the identity work DGS-411; the Maestro writes a Maestro card by hand for the catch-up command. (b) The idle trigger can be proven live only in a throwaway Maestro-role session with env (two sessions of one identity); the conductor starts it. Use a scratch note (`--note`) for any throwaway run.
