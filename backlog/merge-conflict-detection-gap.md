# finishing-a-development-branch Option 1: no explicit guidance when `git merge` itself fails

**Status:** Not applied. Findings only. **Lower confidence than the other
backlog items** — flagged explicitly below, may not be worth doing.

**Source:** `D:\Workspace\Library\automaker`,
`apps/server/src/services/merge-service.ts`.

## What automaker does

Automaker's merge service can't just eyeball `git merge` output — it's a
headless server reporting structured state to a disconnected UI — so it
classifies "conflict vs. some other failure" with three layers: text
markers scanned with `LC_ALL=C` forced (locale-stable English output),
`git diff --name-only --diff-filter=U` for the conflicted file list, and
`git status --porcelain` parsed for unmerged status codes (`UU`, `AA`,
`DD`, `AU`, `UA`, `DU`, `UD`) as a fallback. Any layer hitting means
"conflict."

## Possible gap in DigiSmith's actual flow

`superpowers:finishing-a-development-branch`'s "Option 1: Merge Locally"
runs `git merge <feature-branch>` then a test command, but its explicit
guidance only covers *"tests fail after the merge succeeded"* — there's
no explicit instruction for what to do when `git merge` itself fails
(a conflict, a rejected fast-forward, a hook rejection, etc.), before
tests even run.

## Why this is probably lower value than it looks

DigiSmith runs interactively inside Claude Code, not as a headless
service — Claude sees `git merge`'s raw output directly in the tool
result and doesn't need a programmatic classifier the way automaker's
server does when its only channel to the UI is structured events.
Porting the full 3-layer detection is likely overkill for an interactive
skill.

## The narrower version, if this is worth doing at all

A single added line to Option 1: after a failed `git merge`, run
`git status --porcelain` and check for the unmerged status codes above
to confirm "this was a conflict" before deciding how to report/proceed —
closes the one real gap (no guidance for merge failure *before* tests
run) without importing the rest of automaker's machinery.

## Where this would land, not yet decided

Same as the other items — this is inside `finishing-a-development-branch`,
an upstream Superpowers skill, not a DigiSmith file. No ticket exists.
Given the low-confidence framing above, worth a second look before
committing effort here — this may just get dropped.
