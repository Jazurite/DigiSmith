# `finishing-a-development-branch` Option 1 never pushes after merging locally

**Status:** Not applied. Finding only — no ticket, no code touched.

**Source:** Real-world friction, 2026-08-20 — DigiSmith's own `main` had
quietly accumulated 65 unpushed commits before anyone noticed and it had to
be pushed by hand. See [[feedback_push-after-ticket-completion]].

## What's confirmed

Read `superpowers:finishing-a-development-branch`'s `SKILL.md` directly
(not assumed). Its own Quick Reference table:

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | yes | **-** | - | yes |
| 2. Create PR | - | yes | yes | - |

**Option 1 ("Merge Locally")** runs `git checkout <base-branch>` →
`git pull` → `git merge <feature-branch>` → tests → delete the feature
branch. It never pushes `<base-branch>` to `origin` afterward — by design,
this option is documented as the "no PR, no review" path. Nothing else in
the flow pushes on its behalf.

`superpowers:subagent-driven-development` owns no merge logic of its own —
once its final review is clean, it hands off entirely to
`finishing-a-development-branch` to present the 3-option menu (see its
`SKILL.md` around "Final review clean: delete this plan's workspace" →
"Use superpowers:finishing-a-development-branch"). So this is squarely
Option 1's gap, not a `subagent-driven-development` one.

## Why it matters for DigiSmith specifically

DigiSmith's own self-work convention is worktree-always, merge back to
local `main` (`feedback_digismith_worktree_always`) — which routes through
Option 1, not Option 2 (PR). Every one of the 65 stacked commits was an
Option-1-shaped merge (`Merge branch 'worktree-digismith-init'`, etc.).
Any DigiSmith-driven ticket that takes the "merge locally" branch of
`finishing-a-development-branch` — self-work or a consuming project — has
the same silent-unpushed-`main` risk.

## Where this would land, not yet decided

Same two-path shape as `pr-creation-fork-and-existing-check.md`:

- **Patch upstream.** Add a push step (or at least a prompt: "push
  `<base-branch>` to origin now?") to Option 1 in
  `superpowers:finishing-a-development-branch` itself — benefits every
  consumer of that skill, not just DigiSmith.
- **DigiSmith-side wrapper.** Add a step after `finishing-a-development-branch`
  completes (when DigiSmith orchestrated the ticket) that pushes the base
  branch if Option 1 was the choice taken. Would need a hook point — none
  exists today; `report-implementation` runs *before* the merge decision,
  not after.

No ticket exists for either path yet.
