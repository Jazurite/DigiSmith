# DGS-630: close attention items by rule

## Why
Four kinds of attention items stay open after their ticket is done. The Maestro closed them by hand (recorded as `jack`). Evidence: 2026-10-25 and 2026-10-26 (see the ticket and its comment).

How items are keyed (`attention-write.ts`): id = `<run>.<kind>.<n>`; one open item per (run, kind). Closed by an appended line `{ id, resolved: true, by, note }`; `by` is `watchdog`, `jack` or `controller`.

## The four rules
| # | Item | Today | Closed by | Recorded as |
|---|------|-------|-----------|-------------|
| 1 | `<KEY>/already-merged.unknown.0` (cause `already-merged-but-open`, opened in `scan.ts` step 5) | never closes | the scan: the item's ticket is no longer in `to do` (it was set done or closed, or moved on) | `watchdog`, note `ticket left to do` |
| 2 | `<builder run>.unknown.N` with cause `journal-uncertain-*` or `obs-*` (opened by `act.ts` / `tick.ts`) | never closes | `dg autonomous release --result merged`: closes every open `unknown` item whose `ticket` is the released ticket | `controller`, note `ticket released as merged` |
| 3 | `<builder run>.unknown.N` cause `obs-git-failed` (note from `advance.ts`: building, review, merge-ready) | opens after the post-merge cleanup removes the worktree | it is not opened when (a) the tracker status of the ticket is done, complete or closed (any of the three phases), or (b) the worktree is gone and git cannot be read (merge-ready only) | nothing is written |
| 4 | `guardrails.failed.0` (cause `bad-guardrail-config`, opened by the scan) | only the next scan closes it (30 min) | the watchdog (`dg autonomous watch`, every 5 min): when main's config reads clean | `watchdog`, note `guardrails read clean` |

Decisions:
- Rule 1 uses "left `to do`", not a status lookup. The scan already lists `to do` and the item means "merged but still in to do". No new ClickUp call. A ticket moved to `in progress` also closes the item (it is no longer waiting in to do).
- Rule 2 closes by ticket, so it also closes `obs-git-failed` of the same ticket. Only `unknown` items; `failed`, `refused`, `lost`, `blocked`, `stalled` stay (Jack's call). Best effort: a write error never stops the release.
- Rule 3 (b) only in merge-ready: a worktree gone during building or review is a real problem and still opens the item. The worktree-gone case is told by an error prefix `worktree-gone:` thrown by `gitView`.
- Rule 4 opens nothing: the scan stays the only opener. A failed read (git error) counts as a problem, so the item stays open (fail closed).
- Dry run writes nothing (the existing `close()` in watch already does this).

## Files
Code (all PROTECTED, `packages/cli/src/autonomous/`): `scan.ts`, `release.ts`, `watch.ts`, `advance.ts`, `observers-real.ts`, `phase-types.ts`, `index.ts` (watch wiring), and their `*.test.ts`.

## Protected paths touched
- `packages/cli/src/autonomous/` (yes, every file above).
- Not touched: hooks/, skills/finishing-*, skills/reviewer, packages/cli/src/reviewer/, scripts/nexus-api/src/scheduler/, .digismith/config.yml.

**Merge needs the Maestro.**

## Tests (fake clients, no live call)
`FakeTracker` (scan), fake `Observations` (advance), `fakeExec` (observers-real), a `guardrailProblems` stub (watch). One test per rule plus a negative test per rule (the item stays open when its condition does not hold).

## First use after the merge
No live ClickUp write, no hand-made item, no delete.
1. After the plugin and CLI are rebuilt: `dg autonomous watch --dry-run` prints its summary line with no error (the new guardrail read runs in it).
2. The next real item of each kind closes without a human. Check `dg autonomous attention --json` (the item is gone) and the closing line in `~/.digismith-depot/autonomous/attention.jsonl`: `by` is `watchdog` (rules 1, 4) or `controller` (rule 2), never `jack`; rule 3 shows no new `obs-git-failed` item after a ticket's merge cleanup.
3. Optional throwaway check for rule 1: a throwaway ticket in `to do`, Mode Autonomous, whose key already has a commit on main opens one already-merged item; set it `discarded` (never delete) and the next scan closes the item.
