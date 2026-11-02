# Review pack: DGS-683 part 2, task 12 (cross-project audit log) plus the pane move/swap commit, round 1

Model: claude-sonnet-5-5 (Builder, seat dev0, run record S3b)
Base: e9914eb7 (T11 r2 head, clean)
Head: 3cad50ca
Worktree: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope (branch DGS-683__herdr-scope)
Spec: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/spec.md (7.1 item 5, 6.3)
Plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/plan.md (Ticket A3, Task 12)

## Brief
Two commits:
1. 32261a68 fix(herdr-ws): check every pane and destination of pane move and swap (Maestro's follow-up to T11 r2, no pack yet). `relocate_check()`: `--new-workspace` and `--current` refused; every pane named (positional, --pane, --source-pane, --target-pane) and every destination (--tab, --workspace) must be in the scope; swap needs two explicit panes and a --direction swap needs --target-pane (a neighbour by direction is implicit); in Suite every named pane must belong to a tc-/nw- agent. Checked with `herdr pane --help`, `pane move --help`, `pane swap --help` (read-only). Proven: with the Suite agent check disabled 3 tests go red.
2. 3cad50ca feat(herdr-ws): log a cross-project act (T12). `audit()` runs when a call is forwarded: session default, HERDR_WS set, verb not list/get/read, target workspace != HERDR_WS. Line `{time (+07:00), who (DIGISMITH_NAME or unknown), target, workspace, verb "<group> <verb>"}` to `<DIGISMITH_DEPOT_DIR or ~/.digismith-depot>/drivers/<KEY>.log`; KEY = first dgs-<n> of the agent name (a pane target is mapped to its agent through agent list), uppercased, else _unmapped.log. A write failure prints one stderr line and the call goes on. Proven: with the audit call removed 7 tests go red.

Points to judge:
- A. The plan's test text says `agent prompt dgs-2` writes _unmapped.log, but its own rule (first DGS-\d+ of the name, uppercased) gives DGS-2.log. I followed the RULE and test dgs-2 -> DGS-2.log; the unmapped tests use a non-ticket agent (fake gained scout-a in w3).
- B. The log is written when the call is forwarded (an attempt), not only when herdr returns 0.
- C. create logs the --workspace as target; start logs the agent name with the --pane's workspace.
Files: scripts/opencode-boot/herdr-ws, scripts/opencode-boot/herdr-ws.test.ts (42 tests). Verification: vitest 42/42; old script ALL PASS. No protected path.
