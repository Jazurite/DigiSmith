# DGS-462 plan: refresh the conductor's state block by script

Worker `dgs-462`, 2026-10-13. Ticket DGS-462 (I.6). Order: `order-catchup-fixes.md`. Checkpoint 1: nothing is built yet.

## The problem
The catch-up reads the `digismith:conductor-state` block of the conductor's note. Conductors write that block by hand, so it goes stale (Running "none" while 7 workers built). Nothing tells the reader that the block is old.

## What exists (read, not changed unless listed)
- `state-block.ts`: `parseStateBody`, `renderStateBody`, `writeStateBlock` (atomic, keeps the rest of the note). The block holds Running, Waiting for Jack, Decided, Parked, Next, Health. It has no Done section: Done is computed live by `collectState` from `git log origin/main`.
- `state.ts` `collectState`: reads the block, git, `herdr tab list`, cards (cross-check only).
- `runner.ts` `readOnlyRunner`: already allows `herdr agent list`, `git log`, `git rev-parse`. No new verb is needed.
- `catch-up-cli.ts`: `taskIdForKey` + `dg clickup get-task` (read only) already give a ticket's status.

## 1. The command: `cli.ts state-refresh`
`node --experimental-strip-types scripts/conductor/cli.ts state-refresh [--project P] [--conductor C] [--note path] [--herdr-workspace W] [--dry-run] [--json]`
(`HERDR_WS` pins the workspace, as `state` does today.) New file `scripts/conductor/refresh.ts` holds the logic; `cli.ts` gets one new command line and one switch case (dgs-435 adds a `flux` line in the same two places: a trivial rebase conflict, I do not touch its files). `state-write` stays for a full hand rewrite.

Steps, all reads except the final block write:
1. Read the note, parse the block. No block yet: start from an empty one (first run creates it).
2. **Running (rebuilt, never kept):** `herdr agent list` (JSON), keep agents whose `workspace_id` is the pinned workspace. Drop agents named `*-maestro` or `*-conductor` and the conductor's own pane. One row per worker: worker = pane `name`; key = the `DGS-nnn` in `terminal_title_stripped`; stage = `agent_status` (`working`, `idle`, `blocked`, `done`); since = `started` of its open worker card, else the old row's `since` if the same worker was in the old block, else now.
   Open worker cards (`listCards`, scope open) that have no pane give a row with stage `card open, no pane`; this is the stale-card signal.
   **Ownership** (both conductors share workspace w2): when a worker card exists, only cards with `under` = this conductor's name or id count. A pane with no card is listed and a warning says "owner unknown". I need your word on this (question 1).
3. **Kept hand-written parts:** Waiting for Jack, Decided, Parked, Next, Health seats. Copied through unchanged, in order, unless resolved (section 2).
4. **Done:** stays computed live from `git log origin/main` since the window start (it is not in the block). The refresh adds the ClickUp part: for each key of today's merges it reads the ticket status (read only, `dg clickup get-task`) so the catch-up shows `(ClickUp: done)` or flags a merged ticket that is not done. That reuses `withClickUp` in `catch-up.ts`; no new write path.
5. Set `Updated:` to now (UTC+7), write the block with `writeStateBlock` (atomic; the rest of the note is untouched). Print a one-screen diff: rows added, rows removed, items dropped as resolved, warnings.

## 2. "Resolved" without guessing: explicit markers only
An item is dropped only if it carries a marker at its end. No marker means it is kept for ever (until its owner edits it). Prose is never searched for keys.
- `[resolves: ticket DGS-411]` resolved when ClickUp status is `done` or `closed` (task id from the board folder, as `taskIdForKey` does).
- `[resolves: gone <path>]` resolved when the path does not exist (path relative to the repo root; absolute and `..` refused; the check follows no symlink out of the repo).
- `[resolves: exists <path>]` resolved when the path exists (for "waiting for the report").
- `[resolves: merged DGS-nnn]` resolved when `origin/main` has a commit whose subject names the key.
- One marker per item. Two markers = both must hold. A malformed marker keeps the item and warns.
- ClickUp unreachable or key unresolved: the item is kept and a warning says so (never drops on a failed read).
- Applies to Waiting for Jack, Parked or failed and Next. Decided is a log: never dropped.
- The marker is stripped from the text the catch-up shows (the row is stored with it in the note, shown without it). The conductor adds the marker when it writes the item; the plan adds it to the routine text (section 4). Items already in my note have no marker, so the first refresh keeps them; the conductor adds markers by hand once.

## 3. Age and the warning
- `collectState` already knows the block's `Updated:`. New: it also reads the commit time of the newest commit on `origin/main` (`git log origin/main -1 --format=%cI`, already an allowed flag set).
- Block older than that commit: warning `state block updated <time>, older than the newest merge <time> (<hash>): run state-refresh`. Source `note` goes to `stale`.
- `state` and `consult` text show `State block: updated <time> (<age> old)`.
- The catch-up (`catch-up.ts`): adds the same age line to Health (`server` field, the way "ClickUp unreachable" is added today, so the DGS-427 template is not changed) and the warning when stale.
- **Before any catch-up:** `catch-up-cli.ts` runs the refresh first (unless `--no-write`), then collects. A catch-up is then fresh by construction; the warning shows only when the refresh failed or was skipped. Reuse rule: the 30 min reuse of a written catch-up is skipped when a merge landed after it was written. Both are open for your decision (question 2).

## 4. How the conductor's routine calls it (for you, and the d3 conductor)
One line, same for both, in the routine text of each conductor's note (I add mine; d3 adds its own):
`node --experimental-strip-types scripts/conductor/cli.ts state-refresh --conductor <own name>` (workspace from `HERDR_WS`).
Called: after every merge (right after hook 03), after every worker start and every worker stop (tab closed), after any change to Waiting/Decided/Parked/Next that you edit through `state-write`, and automatically before every catch-up. d3-conductor: its note path comes from `conductors.json` (`DigiSmith/d3-conductor`) or `--note`; today only the digismith conductor has an entry, so d3 needs one line there (a depot file; I will not edit it, d3 does).
No cron or hook is added: a hook on herdr events does not exist; the routine call plus the catch-up refresh cover every trigger the ticket lists. If you want a safety net, a `/loop` of the refresh every 10 minutes can come later; it is one line.

## 5. Tests (TDD: each written red first)
`refresh.test.ts` (new) with fake `Runner` and fake `dg`:
1. **Stale block + newer merge:** block Updated 14:25, Running empty; `origin/main` newest commit 18:50; herdr lists 7 workers → `collectState` warns "older than the newest merge"; after `state-refresh` Running has 7 rows, `Updated:` is now, the warning is gone.
2. Kept parts: Waiting/Decided/Parked/Next/seats copied byte-equal when no marker.
3. Marker rows: ticket done → dropped; ticket in progress → kept; path gone / exists / merged; both markers; malformed marker kept + warning; ClickUp failure kept + warning; `..` path refused.
4. Running: other workspace's agents dropped; maestro/conductor panes dropped; card-only row; `since` taken from the card, then the old row, then now; owner filter by `under`; pane with no card warns.
5. Block missing → created; note text outside the block untouched; second run changes nothing but `Updated:` (idempotent); `--dry-run` writes nothing.
6. `readOnlyRunner` refuses every write verb still (existing tests) and the refresh makes no call outside the allowed set.
7. Catch-up: Health shows the age; warning when stale; auto-refresh runs before collect; reuse skipped after a newer merge.
Then `pnpm test` whole suite, `pnpm -r typecheck` if present.

## 6. Not in scope
`state-write` input format (unchanged), the DGS-427 template, herdr writes, ClickUp writes, the d3 conductor's note and routine, `conductors.json`, hooks. dgs-435 and dgs-438 files untouched.

## 7. Risks
- Shared workspace w2: ownership needs cards; hooks that write cards are not live for every worker yet (so "owner unknown" warnings at first).
- `herdr agent list` lists every workspace: the filter is by `workspace_id`; an unset `HERDR_WS` lists all non-maestro agents and warns.
- ClickUp reads are slow (one per marker and per merged key): the refresh caps at 20 s per call and runs them in sequence like the catch-up does.

## Questions for you
1. Both conductors share workspace w2. Is "owner = the worker card's `under`, no card = listed with an owner-unknown warning" right, or do you want a fixed `--workers` list per conductor?
2. The catch-up refreshing the conductor's block itself (and skipping the reuse after a newer merge): yes? (My default: yes. It is the only way "before any catch-up" holds when a conductor forgets.)
3. Markers `[resolves: ...]` in this form OK, with Decided never dropped?

## Decisions at checkpoint 1 (the conductor, 2026-10-13) and changes after the review
- Q1: ownership = the card's `under` PLUS an explicit `--workers a,b,c` list from the conductor's routine; a pane in neither is `Owner unknown` under Health, never Running. Q2 yes. Q3 yes; add a `[resolves: ...]` example to the docs and the skill text (`docs/conductor-state.md`, `skills/catch-up/SKILL.md`). The d3-conductor's `conductors.json` entry is not mine.
- Changed after the independent review: the block now also records `Main: <hash>` (exact stale check, a fast-forward keeps its old commit date); the refresh refuses to write if the block changed while it ran; the workspace comes from `HERDR_WS`, else the conductor card's `runs_on`, else Running is kept; path and ticket markers are not evaluated without a `.digismith` folder; card times are normalised; a missing note needs `--create`; markers outside the first field warn.
