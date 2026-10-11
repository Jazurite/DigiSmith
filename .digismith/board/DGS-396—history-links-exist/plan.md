# DGS-396 plan: history links only point at files that exist at their pinned commit

Status: checkpoint 1 approved 2026-10-11 (Jack via the Master). Changes: the rule also goes into the report-implementation skill; hook 03 documents the recovery (move the head pin).

## Done before the checkpoint
1. Commit `a2112a0` (pushed to origin/main): the 5 plan files. Secret check: grep for token, secret, password, api key, bearer, authorization, `.env`, private key, `sk-`, `ghp_`, `xox`, `eyJ`, 40+ char base64 runs. Hits are only the word "token" in prose (DGS-223 describes a wrapper that reads a token file; no value anywhere). All 5 were untracked and not ignored.
2. Depot commit `5cfd3f7` `docs(history): re-pin dead links`: 6 links now point at `a2112a0` (DGS-223 plan twice, DGS-384, DGS-134, DGS-387, DGS-388). Checked all 276 permalinks with `git cat-file -e <sha>:<path>`: 0 dead, 0 relative links left.

## Root cause
`buildReferenceLinks` in `update-history.ts` decides with `fs.existsSync` on the working tree. The link is pinned to `HEAD_SHA`. A `plan.md` that is on disk but untracked passes the check and the link is dead.

## Proposed shape (hook 03 only)
`buildReferenceLinks` asks git, not the disk: `git cat-file -e <head>:<path>` for each of design.html, plan.md, report.html. New arguments: `headSha`. It runs in `cwd` (the main checkout).

For each file there are three cases:
| On disk (cwd) | In `<head>` tree | Result |
|---|---|---|
| no | no | Deliberately absent. No link, no error. Same as today. |
| yes | yes | Link. |
| yes | no | DEAD. Fail loud. |
| no | yes | Link (a merge can remove a file from disk only by a later commit; the pinned file still resolves). |

The report is always in the head tree (it comes from `git diff base..head`), but it goes through the same check as a guard.

Fail loud: `main()` collects every DEAD path of every report in range, writes nothing, prints to stderr:
```
Cannot update history: DEAD .digismith/board/DGS-396—x/plan.md (on disk, not in <head>)
Commit it, push, and re-run.
```
Exit 1. The hook already says "stop, do not commit, investigate" on non-zero. The finishing worker commits the file (path-limited), pushes, and the maestro re-pins. Note: the pin `head` is fixed at merge time, so a file committed AFTER the merge is not in `<head>`. Fix: the new text tells the worker to commit before the merge (plan.md next to report.html) or to move the pin by hand (fire-lifecycle-hook.md, "Merge-range pins"). I do not change the pins.

The contract stays: `APPENDED <n>: <titles>`, `NOTHING (no report in range)`, `NOTHING (already recorded)`. A report already recorded is skipped BEFORE the check, so an old entry never fails a re-run.

## Second part: the finish step commits plan.md with the report
Not in this ticket's code. The root cause is the habit, not the script. The hook text (`03-history-update.md`) gets one paragraph: "Commit plan.md and design.html together with report.html" (this matches the saved rule: every merge writes report.html and commits plan.md with it). If you want it in `report-implementation` or the finish skill too, say so and I open a follow-up. I do not touch skills here.

## Files
- `.digismith/hooks/post-finish/scripts/update-history.ts` (`buildReferenceLinks`, `main`, new `findDeadLinks` helper)
- `.digismith/hooks/post-finish/scripts/update-history.test.ts`
- `.digismith/hooks/post-finish/03-history-update.md` (DEAD case, commit-with-report rule)

## Tests (TDD, in a real temp git repo per case)
1. plan.md tracked in head: link written.
2. plan.md on disk, untracked: throws, message holds `DEAD <path>`.
3. plan.md on disk, committed AFTER head: throws DEAD.
4. plan.md absent everywhere: no plan link, no error.
5. design.html tracked and plan.md untracked: error lists only plan.md.
6. main(): two reports, one with a dead link: exit 1, history.html unchanged, both reports in the error text.
7. Already-recorded report with a dead plan: `NOTHING (already recorded)`, exit 0.
8. Existing `buildReferenceLinks` tests move to the git-repo fixture; encoding tests keep passing.

## Own entry
This ticket's `report.html` (h1 "... — Implementation Report", `Ticket: DGS-396`) and this `plan.md` are committed before the merge, so the new check passes on first use.

## Questions for the maestro
- OK to keep the pins unchanged and put the "commit before the merge" rule in the hook text?
- OK that the finish skills are not touched here?
