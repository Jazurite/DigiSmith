# `pnpm test` at repo root picks up other worktrees' test files, causing false failures

**Status:** Not applied. Confirmed real via direct testing, not yet scoped.

**Source:** Found live during I.5's `finishing-a-development-branch` run (2026-09-18) —
`pnpm test` from `main`'s root reported a failing test in
`.claude/worktrees/progress-update-screenshots-section/scripts/fill-template.test.ts`, a file
belonging entirely to a different, concurrent session's own worktree and branch, unrelated to
the change actually being merged.

## The bug

There's no `vitest.config.ts` at the repo root, so `vitest run` (via the root `package.json`'s
`test` script) uses its own default file discovery, which has no exclusion for nested worktree
directories. Every worktree lives under `.claude/worktrees/<name>/` — physically inside `main`'s
own working tree — so vitest happily globs into each one and runs its test files too, as if they
were part of `main`'s own suite.

Confirmed via:

```
npx vitest run --exclude "**/.claude/worktrees/**" --exclude "**/node_modules/**"
```

— which drops the test count from 1141 back down to the real 381, all passing, matching the
count from a run inside an isolated worktree by itself.

## Why it matters

- **False failures**, as happened here: a completely unrelated, in-progress branch's broken test
  blocks (or at least alarms) a `finishing-a-development-branch` run for a totally different,
  already-correct change.
- **Silent double-counting** is the flip side, not yet observed but structurally possible: if a
  sibling worktree's tests all happen to pass, they're counted as if they were part of `main`'s
  own coverage, inflating the reported test count with no indication anything unusual happened.
- Gets worse the more worktrees are open at once — this repo routinely has several concurrent
  sessions each in their own worktree (confirmed live: three existed simultaneously during this
  same session).

## Suggested fix

Add a `vitest.config.ts` at the repo root with an `exclude` covering `**/.claude/worktrees/**`,
`**/.worktrees/**`, and `**/worktrees/**` (all three conventions this repo's own
`using-git-worktrees` skill documents), alongside vitest's own default excludes (`node_modules`,
etc. — confirm these aren't accidentally dropped by adding a custom `exclude` array, which
overrides rather than extends the built-in list in some vitest versions).

## Why not applied yet

Single confirmed finding during an unrelated fix's finish flow — flagged for review rather than
patched inline mid-merge. Touches root-level test config shared by every package in the repo, so
it deserves its own small look rather than a drive-by edit.
