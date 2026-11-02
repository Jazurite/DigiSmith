# Review pack: DGS-683 part 2, task 10 (scope parsing and --session), round 1

Model: claude-sonnet-5-5 (Builder, seat dev0, run record S3b)
Base: 91554b768ceaa68c357e2a1edcf4478255fbcf78 (origin/main)
Head: ab1e3d79
Worktree: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope (branch DGS-683__herdr-scope)
Spec: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/spec.md (section 7.1 items 1-3)
Plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/plan.md (Ticket A3, Task 10; Maestro note in T10)

## Brief
Review only task T10: `scripts/opencode-boot/herdr-ws` now parses HERDR_SCOPE (`session:wN` pairs, fallback `default:$HERDR_WS`), selects the session by a leading `--session S`, refuses a later `--session`/`--socket`, drops HERDR_SOCKET_PATH from the herdr env, and checks lists/create/start/targets against the workspaces of the chosen session. Multi-pair tests cover several `default` pairs, a default workspace outside the scope, and the same workspace id in Suite not accepted through a default pair. T11 (close rule) and T12 (audit log) are NOT in this pack.

Files: scripts/opencode-boot/herdr-ws, scripts/opencode-boot/herdr-ws.test.ts (17 tests, hermetic, fake herdr).
Verification: vitest on the file 17/17 pass; `node scripts/opencode-boot/test-herdr-ws.mjs` ALL PASS (read-only, live herdr).
Not installed, deployed copy untouched. No protected path in the diff.
