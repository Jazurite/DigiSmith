# Review pack: DGS-683 part 2, task 11 (the Suite close rule), round 1

Model: claude-sonnet-5-5 (Builder, seat dev0, run record S3b)
Base: e7bdc94e (T10 r2 head, clean)
Head: a508ba47
Worktree: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope (branch DGS-683__herdr-scope)
Spec: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/spec.md (section 7.1 item 4)
Plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/plan.md (Ticket A3, Task 11)

## Brief
In session Suite, `tab close` (label read with `tab get`), `agent stop` (agent name; a pane-id target is resolved to its agent through `agent list`) and `pane close` (pane resolved to its agent through `agent list`) are refused unless the label/name starts with tc- or nw-; an unknown label or pane fails closed. The old `WS:t1` position rule now applies to every non-Suite session (default keeps it for every workspace in its scope). Workspace membership (T10) still applies first, so a Suite close outside the caller's Suite workspaces is refused.
Judgement call to check: spec says "pane close" with a tc-/nw- label; herdr has no label for a pane, so I use the agent that owns the pane (fake: w7:p2 = tc-dgs-9).
Files: scripts/opencode-boot/herdr-ws, scripts/opencode-boot/herdr-ws.test.ts (24 tests, 6 new). Verification: vitest 24/24; old script ALL PASS. No protected path.
