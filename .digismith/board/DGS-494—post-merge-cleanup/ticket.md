# finishing-a-development-branch: extend the post-merge cleanup step

**Key:** DGS-494
**Source:** ClickUp DGS-494, list F.8 Primitives. Brief: .digismith/sessions/dgs-494/brief.md

## Description
After a pushed merge the worker leaves its worktree and merged branch, and the Maestro asks Jack each time.
`git worktree remove` fails on untracked tool caches. A stale board file in the main checkout blocks `git merge`.
Fix: one cleanup script, a `post_merge_cleanup` preference gate, a stale-board move before the merge,
the runbook allowlist, and briefs that point at the preference.

## Acceptance criteria
- `scripts/post-merge-cleanup.ts` checks merged, deletes pins, removes the worktree (caches only with --force), deletes the branch with `-d`. Vitest tests pass.
- The skill reads `post_merge_cleanup` (auto / ask / unset).
- The skill moves an untracked stale board copy to the depot backups before the merge.
- The runbook start command carries the allowlist flag; briefs point at the preference.
