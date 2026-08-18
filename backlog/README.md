# Backlog

Improvements, findings, and ideas that are worth doing but not yet
applied to any skill or doc. One file per item. Not a roadmap (see
`MEMORY.md` for that) — this is the holding pen for things noticed
along the way that shouldn't get lost, but also shouldn't get edited in
immediately without review.

Delete an item's file once it's been applied (or explicitly dropped).

## Items

- [capture-ephemeral-url: fetch PR comments via REST, not `gh pr view`](capture-ephemeral-url-rest-comment-fetch.md) — Step 4's comment fetch has two independent bugs that can silently return "not found"
- [PR creation: existing-PR check, fork-aware remotes, injection-safe args](pr-creation-fork-and-existing-check.md) — gaps found against upstream `superpowers:finishing-a-development-branch`'s bare-bones "push and create PR" option
- [Worktree creation: support arbitrary per-project setup](worktree-custom-setup-script.md) — `.env` provisioning (and similar) isn't covered by `using-git-worktrees`'s fixed package-manager install list
- [Merge-conflict detection gap in Option 1](merge-conflict-detection-gap.md) — lower confidence; no explicit guidance when `git merge` itself fails, before tests even run
- [Stale `.git/index.lock` auto-recovery](stale-index-lock-recovery.md) — an interrupted git command can silently break every future git command in a worktree until manually cleaned up; nothing currently detects or recovers from it
- [Per-worktree dev server port allocation](dev-server-port-allocation.md) — medium confidence; only matters if concurrent worktrees' dev servers are actually a thing Jack does
- [Telemetry: automatic session lifecycle](telemetry-auto-lifecycle.md) — start/stop tied to session start/close/delete instead of manual trigger; deferred until real telemetry data exists
- [`inject-standards` has no scenario for review-time dispatch](review-time-standards-injection-gap.md) — diff-hygiene standards shape what implementers write but never reach the whole-branch final review
