# DGS-494 spec: post-merge cleanup

## Script
`skills/finishing-a-development-branch/scripts/post-merge-cleanup.ts`, run as
`node --experimental-strip-types post-merge-cleanup.ts --branch <b> --worktree <path> [--dry-run]`.
Run it from the main checkout, after the post-finish hooks fired. Logic is an exported function
`cleanup({repo, branch, worktree, dryRun})` that returns `{ok, steps[], message}`; the CLI wrapper prints and sets the exit code.
Steps, in order. A failing step stops the run with a clear message, and later steps do not run:
1. Branch is in `git branch --merged main`. Else stop.
2. Delete `refs/digismith/post-finish/<branch>/base` and `/head`. A missing pin is not an error (idempotent re-run).
3. List untracked files in the worktree (`git status --porcelain --untracked-files=all`). A tracked change also stops the run.
   None -> `git worktree remove`. Only paths under a known cache prefix (constant `KNOWN_CACHES`, starts with `.impeccable/`) -> `git worktree remove --force`.
   Anything else -> stop and list the files.
4. `git worktree prune`, then `git branch -d <branch>` (never `-D`).
`--dry-run` runs the checks and prints the plan, changes nothing.

Reason for the order from the brief: pins go first, because step 1 proved the merge and the hooks already read them.
A worktree that is already gone is skipped (re-run after a partial failure).

## Preference gate
Skill Step 6 reads `post_merge_cleanup` with `digismith:preferences`. `auto`: run the script, no question.
`unset`: ask once, save the answer (`auto` or `ask`). `ask`: ask each time. The preferences skill has no key list; its
storage example gets the new key.

## Stale board copy
Step 5 Option 1, before `git merge`: if the main checkout has an untracked copy of the branch's board folder (a path the branch
commits), move it to `~/.digismith-depot/backups/<branch>-stale-board/`. A move, never a delete. Bootstrap Step 1 and
jira-intake write `ticket.md` into the board only after the worktree exists (bootstrap gets a note; the bare-key flow with
the worktree first is already how Step 2 reads, so the fix is to reorder Step 1 and 2 text for the keyed board write).

## Allowlist and wording
Runbook `.digismith/sessions/workbox.md` ("Start of a ticket") start command gets
`--allowedTools "Bash(node --experimental-strip-types */post-merge-cleanup.ts *)"`. It is git-excluded: edit on disk only.
Runbook sections "Start of a ticket" and "Merge order for a worker" point at `preferences.post_merge_cleanup`.

## Tests
Vitest against temp git repos: merged and unmerged branch, no untracked, cache-only, real untracked, missing pins, dry-run.
