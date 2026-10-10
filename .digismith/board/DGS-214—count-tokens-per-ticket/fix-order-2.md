# DGS-214 slice 1: fix round 2, Sol's 10 findings (all verified in the code by Jack's Desktop session)

Sol's full review: .digismith/board/DGS-214—count-tokens-per-ticket/sol-review.md (main checkout) (gpt-6-astra, verdict "ready after fixes").
Jack approved: fix all 10 now, test-first, before the merge. For every fix, first write a test that fails on the current code, using fixtures in the REAL transcript format (no message text).

1. count.ts:33 dedupe rank puts "read from its own session's file" before output. Design: highest output_tokens wins. New order: ticket session, then output, then own file as the tie-breaker. Test: two copies with different output, both read orders.
2. claude-code-reader.ts:45 fallback response_id has no file identity; two subagent files (or a subagent and the main file) collide on line|<parent>|main|<index>. Add the source file to the fallback key.
3. Valid JSON with a bad shape: a `null` line crashes at o.message (reader:36); a `null` registry line crashes at e.kind (count.ts:20); a string count ("2") concatenates. Validate shapes; skip bad records; accept only finite, non-negative numbers.
4. attribution.ts:39 readHead still reads whole files (split limit only). Read incrementally (stop at the head limit for branch and cwd); the usage reader may stay whole-file for now if a line-by-line read is out of scope, but say so in the README.
5. attribution.ts:53 a custom-title or agent-name line after line 200 is missed. Find title lines beyond the head limit (incremental scan); keep the 200-line limit for branch and cwd only.
6. count.ts:84 resolveSnapshotPath checks only the exact cwd. Resolve the checkout root first (git rev-parse --show-toplevel or walk up to .claude-plugin/plugin.json). Also: the DGS-214 board folder is untracked, so it does not exist inside .worktrees/dgs-214; from a linked worktree, resolve the board folder in the MAIN checkout (git rev-parse --git-common-dir), else fall back to the depot. Test from a nested folder and from a linked worktree.
7. registry.ts:23 a torn tail (no trailing newline) glues onto the next append and both lines are lost. Before appending, make sure the file ends with a newline. Test: a torn tail without newline, then one append, then read: the new entry survives.
8. snapshot.ts:6 timestamps compared as strings; mixed precision in one second picks the wrong step. Compare parsed instants (Date.parse); handle invalid timestamps explicitly.
9. A subagent line without agentId gets agent_id null. Fall back to the id from the file name (agent-<id>.jsonl); an explicit line-level agentId wins.
10. raw_flags (design section 4) is missing. Add raw_flags to UsageRecord and keep service_tier, speed, iterations and fallback_credit uninterpreted. No message text.

Done when: each fix has its failing-first test; the tokens suite and the full suite pass (only the known index.e2e non-TTY failure); `pnpm --filter @digismith/cli build` passes; `node --experimental-strip-types packages/cli/src/index.ts tokens DGS-214` in the worktree still lists session 2da6e8d0-cfee-4f35-a956-6636b30d1c5b with non-zero counts; one commit per finding or per small group, conventional titles, no attribution. Run a scoped re-review of the fix diff as usual. Then stop and report. No push, no merge, no ClickUp write.
