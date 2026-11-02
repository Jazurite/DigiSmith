# DGS-695 spec: board-docs commits are not "already merged"

## Cause
`packages/cli/src/autonomous/already-done.ts:31` `namesKey` and `:41-44` `mergedOnMain` (rule a) count any origin/main commit whose conventional scope names the key. Refinement commits its probe, spec and plan to main as `docs(dgs-683): ...`, and every file is under `.digismith/board/DGS-683—*/`. The scan then skips the ticket as `already-merged: <sha>` (found 2026-11-01 ~22:0x UTC+7, DGS-683). Same read feeds rule (b) (`already-done.ts:46-48`), `blockerProblem` (`:62`, same `namesKey` on the log) and `drift.ts:41`.

## Rule
A key-scoped commit whose changed files ALL lie under `.digismith/board/<KEY>—*/` (the key's own board folder) is refinement docs and does not count. It does not count for rule (a), rule (b), `blockerProblem` and `drift`. Any other key-scoped commit counts as before (feat, fix, docs, chore). Unsure means counts (same stance as the file header).

## How the files are read
`readMainLog` reads main once per scan. It now runs ONE call: `git -c core.quotepath=off log origin/main --no-renames --name-only --format=%x01%h%x09%s`. Rows get `files: string[]`. A line that starts with `\x01` opens a commit; other non-empty lines are its paths. No per-commit `git show`: one call, about 0.7 s and 560 KB for 2834 commits, so cost is the same single read as today plus the file lists. Rule (b) reads branch subjects only (`git log <b> --format=%s`); it gets the same file lists by adding `--name-only` in the same format.

## Edge cases (decided)
- **Em dash in `DGS-683—suite`**: git quotes non-ASCII paths as `"\342\200\224"` by default. `core.quotepath=off` keeps the real character, so a plain `startsWith` works. Not `-z`: with `--format` records plus `-z` the parse is harder for no gain.
- **Any other quoted path** (tab, quote, backslash, newline in a name): git still quotes it, the line starts with `"`, does not start with `.digismith/board/`, so the commit counts. Safe direction.
- **Prefix check**: the path must start with `.digismith/board/<KEY>—` (key upper-case, em dash, compare case-insensitively on the key only). `DGS-68` must not match `DGS-683—`: the em dash after the key prevents it.
- **A different key's board folder** (`.digismith/board/DGS-684—x/a.md` in a `docs(dgs-683)` commit): not the key's own folder, so the commit counts.
- **Board folder AND anything else** (one file outside the folder): counts.
- **Merge commit**: `git log --name-only` lists no files for a merge. Empty file list counts (unsure means merged). Same for an `--allow-empty` commit.
- **Renamed file**: `--no-renames` lists the old and the new path, so a move out of `src/` into the board folder shows both and counts.
- **Key in a different case** in the scope: already lower-cased by `scopeOf`; the folder prefix is compared with the key lower-cased on both sides.
- **Old behaviour**: feat/fix/chore commits with code files, and a docs commit with code files, count as today.

## Protected paths touched
`packages/cli/src/autonomous/`: `already-done.ts`, `scan-guard.ts` (only if the fake log format changes its test), `drift.ts` (no code change expected: it passes the log through), and the tests `already-done.test.ts`, `scan-guard.test.ts`, `drift.test.ts`. The merge needs the Maestro. Sign-off Auto.

## First use (after merge and install)
`dg autonomous scan --dry-run --repo <main checkout>` must show a to-do ticket whose only main commits are `docs(<key>)` board docs as `ready`. DGS-683 qualifies by history (its commits 8cacaae8, 30f467c1, 6a6c2210, 123cfe19 are board-only) but it is Mode Manual now, so its fields stay as they are. Do not touch it. Proof on a throwaway ticket instead: create a test task with a spec and a plan attached, status `to do`, Mode Autonomous; commit a `docs(<its-key>)` file under its board folder to a scratch clone of origin; run the scan with `--repo <scratch clone>`; it must show `ready`, not `already-merged`. Delete the throwaway task and clone afterwards (own test leftovers).
