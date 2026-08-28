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
- [Multi-repo distribution (I.2)](jira-write-back-adf-reporting.md) — profile-gated worktree fan-out across market repos, learned from EMKT-784; I.1 (real ADF formatting) shipped 2026-08-26
- [Technical writing / content-voice skill (new letter, tentatively T)](technical-writing-content-voice.md) — I.1's first progress-comment draft leaked git/PR mechanics at a PO/PM audience; no map letter reserved yet
- [Ticket description Track-section template (Deliverable / Per Market)](track-section-template.md) — live-tested on EMKT-756, tension with `I.1`'s current single-checkmark Step 7 noted; natural output for I.2
- [Opinionated default tech stack (new letter, tentatively U)](opinionated-tech-stack-defaults.md) — Jack has standing defaults (Vitest, SCSS, Playwright, more not yet captured) that brainstorming currently has no way to know about and re-asks fresh each time
- [First non-fast-forward merge — re-examine report-implementation's assumption](non-fast-forward-merge-first-occurrence.md) — happened for real merging K.2; didn't break anything since the report is written pre-merge, but the original design note asked to be revisited when this occurred
- [AI Gateway Vendors (new letter, tentatively W)](ai-gateway-vendors-new-letter-w.md) — pluggable gateway choice beyond Chutes, live-tested via TokenReply + Claude Agent SDK; cost-comparison, parallel-gateway, and harness/vendor benchmark companion ideas
