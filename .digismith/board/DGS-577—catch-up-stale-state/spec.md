# DGS-577 spec: the catch-up must not show old state as fresh

Draft 2026-10-26 (UTC+7). Checked against origin/main 25aae445. Ticket status: refinement.

## Problem

On 2026-10-19 the Emma catch-up showed a 5-day-old Running row and two done Waiting items.
Health said "0 min old". Jack saw old state as fresh, with no warning.

## Which causes still hold on today's main

`scripts/conductor/refresh.ts` has not changed since DGS-462 (a6016dc3, b788fe58). All causes still hold.

| # | Cause | Holds? | Where |
|---|---|---|---|
| 1 | `Updated:` is set to now on every refresh, even when nothing changed | yes | `refresh.ts` (`updated: iso7(now)`); `catch-up.ts` reads it as the content age |
| 2 | Running is kept silently when herdr cannot be read | yes | `refresh.ts`, the `catch` of the herdr block: warning only, `running = old.running` |
| 3 | Warnings go to stderr; the catch-up shows stdout only | yes | `catch-up-cli.ts` `main()` |
| 4 | The "older than the newest merge" check never fires from the plugin cache, and is the wrong signal for a project with no DigiSmith merges | yes | `state.ts` (`git log origin/main` with `cwd: REPO_ROOT`) |
| 5 | The project note can be newer than the block; nothing warns | yes | no code reads it |
| 6 | Docs do not say the depot block is the only state the catch-up reads | yes | `docs/conductor-state.md`, `skills/catch-up/SKILL.md` |
| 7 | A card without `runs_on` is invisible | yes | `refresh.ts` throws the same message as "no workspace pinned" |

Not a repo bug: the Emma note was fixed by hand and its header now names `herdr w3:p1`. The conductor card's `runs_on` is data in the depot. The plan checks it; the code only has to make a missing one visible.

## Decisions (technical, decided here)

1. **Content time, apart from refresh time.** The block gets a new header line `Changed: <time>`.
   - The refresh renders the new body without the `Updated:`, `Changed:` and `Main:` lines and compares it with the old one. Same text: keep the old `Changed:`. Different: set it to now.
   - Why: the block text is the only thing the catch-up reads, so "the block text changed" is the exact meaning of "content changed". No extra state file.
   - An old block without `Changed:` is shown as "content time not recorded". The first refresh that changes anything writes it. Why not copy `Updated:` into it: that value is the refresh time and is the bug itself.
   - `parseStateBody` accepts `Changed:` in the header; `renderStateBody` writes it after `Updated:`. Old readers reject an unknown header line, so this ships with the same plugin version for all readers (the depot clone and the plugin cache are one release).
2. **Health line.** Health shows `state block refreshed <time>, <age> ago; content changed <time>, <age> ago`. Replaces the single "updated ... old" text in `buildCatchUp`.
3. **Old items flagged.** An item older than 2 days gets a Health warning, never a change to the item text. Sources: Running `since`, Waiting `since`. Parked, Decided and Next have no time, so the block-level `Changed:` age covers them: content unchanged for more than 2 days gives one warning.
   - Why 2 days: the ticket's number. One constant `STALE_AFTER_MS` in `state.ts`.
4. **Running unknown.** When herdr cannot be read or no workspace is known, the refresh writes the header line `Running: unknown (<reason>)` and no Running rows. It no longer keeps the old rows.
   - The catch-up shows one Running line: `- unknown | - | <reason> | since <refresh time>`. Why a row: the template and `CatchUp` type stay unchanged.
   - Why not keep the old rows with a warning: that is the exact failure of the report.
5. **Warnings visible.** `buildCatchUp` appends refresh and collect warnings to the Health Server text as `warnings: <first 5>, +N more`. They still go to stderr. Why Health: the catch-up template has no warning section and the skill says to answer with the output unchanged.
6. **Staleness that works from the plugin cache and for projects without merges.**
   - The merge check runs only for project `DigiSmith` and only when `REPO_ROOT/.git` exists. Otherwise it is skipped with no stderr error. Why: merges on this repo's main say nothing about Emma work.
   - New for every project: **watch paths**. The block header gets `Watch: <path>, <path>` (like `Workers:`), set by `state-refresh --watch <paths>`, reused when absent. `collectState` takes the newest mtime in each path (a file, or a folder walked to depth 3, at most 2000 entries). A path newer than `Changed:` gives a warning: `<path> changed <time>, after the block content (<Changed>): the block may be behind`.
   - Why `Changed:` and not `Updated:`: a refresh with no change must not hide a newer project note.
   - A missing watch path gives a warning, not an error.
   - For Emma the conductor passes the project note and the project's `.digismith/board` folder.
7. **Missing `runs_on` visible.** The refresh warns `conductor card <name> has no runs_on` when no workspace comes from `--herdr-workspace`, `HERDR_WS` or the card. This is part of the Running-unknown reason, so it reaches Health.
8. **Docs.** `docs/conductor-state.md` and `skills/catch-up/SKILL.md` say plainly: the depot block is the only state the catch-up reads; a project note is not read; use `--watch` to get a warning when it is newer. The conductor routine text in that doc adds `--watch` for conductors with a project note. The new header lines (`Changed:`, `Watch:`, `Running: unknown`) are described there.

## Out of scope

- Reading the project note into the catch-up (rejected: two sources of truth; the fix is one source plus a warning).
- Fixing the Emma card or note data (depot data; the plan lists it as a check for the Emma conductor).
- Item-level `since` on Parked, Decided, Next.

## Errors

- A `Changed:` that does not parse: reported as a block problem, same as `Updated:`.
- A watch path outside any readable location: warning, no failure.
- The refresh still refuses to write when the block changed while it ran.

## Tests

Extend `refresh.test.ts`, `state.test.ts`, `state-block.test.ts`, `catch-up.test.ts`, `catch-up-cli.test.ts`:
- refresh with no change keeps `Changed:`; with a change sets it.
- herdr failure and missing `runs_on`: Running unknown, not the old rows.
- Waiting or Running item 3 days old: Health warning; 1 day old: none.
- watch path newer than `Changed:`: warning; older: none.
- not a git checkout, project Emma: no merge warning, no stderr noise.
- warnings appear in the rendered Health.
- an old block with no `Changed:` still parses and shows "not recorded".

## Proposed Sign-off and Mode

Sign-off: Auto (internal tool, contract fully defined above; the only wording is Health text). Mode: Autonomous.
