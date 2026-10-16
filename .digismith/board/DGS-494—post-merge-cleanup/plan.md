# DGS-494 plan

1. TDD the script `skills/finishing-a-development-branch/scripts/post-merge-cleanup.ts` (Vitest, temp git repos):
   unmerged stop, merged + clean, cache-only force, real untracked stop, tracked change stop, missing pins, dry-run, gone worktree.
2. Skill: Step 5 Option 1 stale-board move before merge; Step 6 preference gate and script call; Quick Reference.
3. Preferences skill: add `post_merge_cleanup` to the storage example. Bootstrap: write the board only after the worktree exists.
4. Runbook (on disk, untracked): allowlist flag and preference pointer in "Start of a ticket" and "Merge order for a worker".
5. Whole-branch review, fix findings, checkpoint 2.
