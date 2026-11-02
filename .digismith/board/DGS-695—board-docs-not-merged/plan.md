# DGS-695 plan: board-docs commits are not "already merged"

Rule: see spec.md. A key-scoped commit whose files ALL lie under `.digismith/board/<KEY>—*/` does not count.

Setup: `pnpm install --frozen-lockfile` inside the worktree only.
Test command: `cd packages/cli && pnpm exec vitest run --maxWorkers=2 src/autonomous/already-done.test.ts src/autonomous/scan-guard.test.ts src/autonomous/drift.test.ts` (then once `src/autonomous`).

Protected paths touched (all of `packages/cli/src/autonomous/`): already-done.ts, scan-guard.test.ts, drift.test.ts, already-done.test.ts. The merge needs the Maestro.

Test style: `already-done.test.ts` uses a real temp git repo (`commit()` writes `f.txt`); extend `commit` with an optional `files: Record<string,string>` argument. `scan-guard.test.ts` and `drift.test.ts` use fake git; their `log` strings change to the new format (see Task 2).

### Task 1: readMainLog reads files; board-docs rows do not count
Tests first (`already-done.test.ts`, real git, em dash in the folder name):
- "a docs(dgs-7) commit with only files under .digismith/board/DGS-7—x/ does not count" (null).
- "a key-scoped commit touching the board folder AND src/x.ts counts".
- "a docs(dgs-7) commit in another key's board folder (DGS-8—y) counts".
- "a docs(dgs-7) commit in board folder DGS-70—z does not match key DGS-7 as its own folder" (counts, not skipped).
- "a feat(dgs-7) commit with only board files does not count" (the rule is about files, not the type).
- "an empty commit and a merge commit with a key-scoped subject count".
- "a rename from src/a.ts into the board folder counts".
- "a scope in upper case (DGS-7) with only board files does not count".
- "blockerProblem: a board-only docs commit is not a main hit" (falls to the branch rules).
- "rule (b): an ancestor branch whose only key-scoped commits are board docs is not counted".
Code (`already-done.ts`):
- `MainLog = { sha: string; subject: string; files: string[] }[]`.
- `readMainLog`: one call `["-c","core.quotepath=off","log","origin/main","--no-renames","--name-only","--format=%x01%h%x09%s"]`; a line starting with `\x01` opens a row, other non-empty lines go to its `files`.
- New `isBoardDocs(key: string, files: string[]): boolean`: files non-empty and every file starts with `.digismith/board/${key.toUpperCase()}—`.
- `counts(row, want)` = `namesKey(row.subject, want) && !isBoardDocs(want, row.files)`; used by `mergedOnMain` rule (a) and `blockerProblem`.
- Rule (b): branch log call becomes `log <b> --max-count=200 --no-renames --name-only --format=%x01%s` (same parse via a small shared `parseLog`); count a branch commit with `counts`.
- Update the header comment: board-docs commits do not count.
Commit: `fix(autonomous): board-docs commits do not count as already merged`

### Task 2: fake-git tests for the scan guard and drift
Tests first:
- `scan-guard.test.ts`: add a helper `logOf(rows: [sha, subject, files?: string[]][])` that builds the new format (`\x01sha\tsubject\nfile\n...`); change the existing `log` fixtures to it. New tests: "a board-docs-only key commit is not already-merged (alreadyDone returns null)"; "a code commit with the same scope is still already-merged"; "a blocker whose only main commits are board docs is not satisfied by them" (goes to the branch rules).
- `drift.test.ts`: `fakeGit` log fixtures through the same helper; new test "gatherDrift: board-docs commit gives mergedSha null".
Code: none beyond Task 1 if the fakes pass (`scan-guard.ts` and `drift.ts` pass the log through). If the old fixtures break only on format, fix the fixtures, not the code.
Commit: `test(autonomous): scan guard and drift ignore board-docs commits`

### Task 3: whole suite and first use
- Run `src/autonomous`, then the whole package suite, `maxWorkers=2`.
- `WATCHDOG.md` line on "already merged" (grep `already-merged`): add "a commit that only touches its own board folder is refinement docs and does not count". Check `index.ts` scan help for the same text.
- First use (conductor, after merge and install): the throwaway-ticket proof in spec.md; do not touch DGS-683.
Commit: `docs(autonomous): state that board-docs commits are not a merge`
