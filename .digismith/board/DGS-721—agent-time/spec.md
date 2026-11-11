# DGS-721 spec: Hallmark agent time = active time

## Problem
Agent time is `task_end - task_start`, summed over closed windows (`closedWindows`/`taskUsage` in `packages/cli/src/tokens/stamp.ts`). A stalled build counts in full: DGS-546 task 8 shows 182 h 21 min (window opened 2026-11-03, ended 2026-11-10); the ticket total says 184 h 3 min. Cost and tokens are right (priced per response). Only time is wrong.

## Decision
Agent time = ACTIVE time. For each closed window, take the responses inside it (controller and subagents of the window's own session, those with `ts` in [start, end]; subagents share the session id. Windows of different sessions are not merged, so overlap is not double counted and parallel sessions each keep their own active time), sort by `ts`, and sum the span between each two consecutive responses. Drop any span longer than `ACTIVE_GAP_CAP_SECONDS` (one named constant, 600 = 10 min, in `stamp.ts`).

Why this shape:
- A gap over the cap is a stall (herdr down, repo move, Jack away), not work. A span under the cap is model time, tool time or short waits; all are work.
- Subagent responses merge into one sorted list per window, so parallel subagents are not double counted (union of spans, not sum of per-agent spans).
- The first response of a window has no earlier response, so its own span is not counted. Tiny undercount (one response), accepted: nothing to measure it from. The window start is NOT used as an anchor: a stall right after task_start would count in full.
- Response `ts` is already on `UsageRecord` (from `readClaudeCodeSession`), so no new transcript reader.
- Records with a task attribution are not needed: the window decides, as `closedWindows` already does. Records of other tasks in the same window are rare (windows of one session do not overlap) and the window is the existing time rule.
- Filter by ticket sessions (`own`), as cost does.

## Output
- `TaskUsage.agentSeconds` becomes active seconds. New field `windowSeconds` keeps the old wall-clock sum.
- `renderStamp` (task-stamp comment): the Window line stays and shows both: `Window: <start> to <end> UTC+7 (agent time <active>)`. The existing first line already carries the window; add the window length only when it differs from active by more than the cap-free case: `Window: 2026-11-03 07:05:11 to 2026-11-10 12:00:00 UTC+7 (window 7 d 5 h, agent time 1 h 22 min)`. Source line: `agent time = active time, gaps over 10 min dropped`.
- `renderBlock` (ticket description): `Agent time: <active> over N tasks (active time, gaps over 10 min dropped)` plus a second line `Window: <first start> to <last end> UTC+7` so a stall stays visible. The table's Agent time column is active time.
- `ticket-total` RECOMPUTES: for stamped tasks it today takes the stored `agent_seconds` (old wall-clock). It will recompute from `taskUsage` for every task. The stamp line still supplies reviews/findings/partial. Existing ClickUp comments and stamps-store lines are NOT rewritten. New stamp lines store active seconds in `agent_seconds` and add optional `window_seconds`.

## Sanity check against Claude Code totalAPIDuration (DGS-679)
DGS-679 has one session (10102674-...). Its transcript ends with `totalAPIDuration` = 554 606 ms (9 min 15 s, whole session, API time only). Registry windows: task 1 104 s, task 2 124 s, final 133 s = 361 s wall. Check, in a test-free script run by hand: active time over the WHOLE session (all responses, same cap) must land near 554 s (API time excludes tool time, active includes it, so active >= API duration, within a small factor); active time of the three windows must be <= 361 s and >= the API time that fell inside them. Numbers go in the report. Not an assertion in the suite (needs the live transcript).

## Out of scope
No rewrite of posted comments. No change to cost/token counts. No new CLI flag (the cap is a constant). No live ClickUp write.
