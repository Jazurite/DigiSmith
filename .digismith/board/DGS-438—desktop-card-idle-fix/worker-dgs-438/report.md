# DGS-438 report: desktop card and the idle catch-up

Ticket: DGS-438. Branch `dgs-438` (2 commits on origin/main 5932ee3). Date: 2026-10-13.

## Built (TDD, pnpm)
- (a) `cardFromIdentity` (`scripts/identity.ts`): `CLAUDE_CODE_ENTRYPOINT=claude-desktop` gives `runs_on: desktop` even when `SSH_CONNECTION` is inherited; ssh alone stays `ssh`.
- (b) Header comment of `scripts/session-cards/prompt-identity.ts` corrected (Desktop does fire SessionStart; DGS-437's cause was a stale plugin copy). Fallback kept.
- (c) `scripts/session-cards/prompt-kind.ts` `isHarnessNotice`: positive evidence only, by known wrapper at the start of the prompt: `<task-notification`, `<system-reminder`, `<local-command-caveat`, `<local-command-stdout`, `[SYSTEM NOTIFICATION`, `[Cross-session idle notice]`. List taken from 50 recorded transcripts. An empty prompt is NOT a notice (image-only messages from Jack arrive empty; review finding). A missing prompt field is a real prompt.
- (d) `scripts/conductor/idle-check.ts` + new `idle-stamp.ts`: per-session stamp `<depot>/sessions/<project>/.idle/<session>.json` = time of Jack's last real prompt in this session + the origin/main head and conductor state block `Updated:` stored at the last catch-up. Fires when idle >= `IDLE_MIN` (30 min, one constant) AND head or `Updated:` differs from the stored ones. Other sessions' activity is not read. No stamp: silent on the first prompt, stamp written. Notices neither fire nor refresh the stamp. Stamp written before the text returns (a failed write = silence, never a repeat). Names checked with `isSafeName`; atomic write; any error = silent.

## Tests
New: prompt-kind (17), idle-stamp (3), idle-check (rewritten, 17), idle-check-hook (real `runPrompt`, temp git repo and depot), identity (+1). Full suite 148 files, 2104 tests pass.

## Independent review
A fresh Claude agent reviewed the whole branch read-only. No correctness bug in the trigger path. One verified finding fixed: an empty prompt was treated as a notice (could swallow Jack's image-only message). Noted, not changed: a manual catch-up does not update the stamp (at worst one extra automatic catch-up); `origin/main` is a local ref, so merges show up through `Updated:` (needs DGS-462 to refresh it).

## First use
After merge and plugin update: leave the Maestro session idle 30+ min with a merge or a conductor update in between; the next message should start with the catch-up, and a second idle period with nothing new should stay silent.
