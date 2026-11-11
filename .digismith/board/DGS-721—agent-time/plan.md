# DGS-721 plan

Test runner: vitest on changed files, fork pool of 2. Each task: test first (red), code (green), commit `fix(tokens)` / `fix(clickup)`, title only.

Files: `packages/cli/src/tokens/stamp.ts`, `stamp.test.ts`, `stamp.render.test.ts`, `hallmark-block.ts`, `hallmark-block.test.ts`, `stamps-store.ts`+test, `clickup/task-stamp.ts`+test, `clickup/ticket-total.ts`+test, `tokens/README.md`.

## Task 1: active-seconds function
Test (`stamp.test.ts`): `activeSeconds(timestamps, cap)` pure helper. Cases: empty and one response = 0; spans under the cap sum; a span over the cap is dropped; a span exactly at the cap counts; unsorted input is sorted; equal timestamps give 0.
Code: export `ACTIVE_GAP_CAP_SECONDS = 600` and `activeSeconds` in `stamp.ts`.

## Task 2: taskUsage uses it
Test: records inside two windows from two sessions plus a subagent record (`agent_id` set): active = merged spans; a 7-day gap inside the window is dropped; responses outside every window and other-session responses ignored; `windowSeconds` equals the old wall sum; overlapping windows of different sessions each count their own responses (as today).
Code: `taskUsage` computes `agentSeconds` (active) and `windowSeconds`; update the `closedWindows` comment.

## Task 3: stamp comment text
Test (`stamp.render.test.ts`): window line shows the window length and the active time; Source line says active time and the cap in minutes; no-window case unchanged.
Code: `renderStamp`.

## Task 4: stamp line and stamps-store
Test: `stampLine` writes active seconds to `agent_seconds` and `window_seconds`; `isStamp` accepts old lines without `window_seconds`.
Code: `task-stamp.ts` `stampLine`, `stamps-store.ts` optional field.

## Task 5: ticket block text
Test (`hallmark-block.test.ts`): block has `Agent time: ... (active time, gaps over 10 min dropped)` and a `Window: <start> to <end> UTC+7` line; the stall case (one row 182 h window, 1 h active) shows both; idempotence and sentinel tests stay green. `BlockRow` gets `windowStart`/`windowEnd` (optional; no window = no line).
Code: `renderBlock`, `BlockRow`.

## Task 6: ticket-total recomputes
Test (`ticket-total.test.ts`): a stamped task whose stored `agent_seconds` is the old 182 h now shows active time from the transcripts/registry; reviews, findings and `partial` still come from the stamp; unstamped task unchanged; window line spans first start to last end across tasks.
Code: `rowsFor` always calls `taskUsage` for time and window; passes window bounds into the rows.

## Task 7: README and sanity script
Update `tokens/README.md` (agent time = active time, the cap, window line, old comments not rewritten). Run the DGS-679 sanity check by hand with a scratch script (scratchpad, not committed); record the numbers in the report.

Final: whole `packages/cli/src/tokens` and `clickup` suites at load < 4; known base failure `autonomous/guardrails.test.ts` (DGS-720).
