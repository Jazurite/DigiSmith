# DGS-546 Hallmark: spike findings

Spike for order hm-01. Read-only. No ClickUp write. Written 2026-11-01 22:25 UTC+7.

## Answer in short
- Use the **registry windows plus the transcripts** (what `tokens task-start`/`task-end` and `buildSnapshot` already do) as the one source of per-task tokens and agent time.
- Do **not** price the snapshot's per-task totals. Price each response, then sum. Pricing the sum gives a wrong cost (proof below: 5 times too high for Haiku).
- Review rounds, findings and fix rounds come from the **SDD ledger** (`progress.md`) and `findings.md`. The ledger is deleted at cleanup, so a backfill after cleanup has no review numbers unless `findings.md` or `report.md` survived.
- Claude Code cost-state records are exact, but only per session. They cannot give a per-task number. Use them to check the ticket total, not the tasks.

## Sources compared

| Source | Tokens | Cost | Agent time | Per task? | Exact? | Broken? |
| --- | --- | --- | --- | --- | --- | --- |
| Registry `task_start`/`task_end` + transcripts (`tokens.json` `tasks.<N>.<model>`) | yes, per model: input, output, cache read, cache write 5m and 1h | not stored; computable | window = `task_end - task_start` (wall clock) | yes | Haiku and Opus match cost-state exactly; Sonnet output 4 % under, cache read 9 % under (DGS-679, whole session) | No. Two limits below |
| `tokens task-tokens` | one line, sums models | no | no | yes | same as above | Needs `--ledger`; drops the per-model split |
| DGS-613 phase times (`phaseSince`, `durationSec`) | no | no | per **step** of a run (building, reviewing...), not per task | no | wall clock | Works, wrong grain |
| `dg run` records (`~/.digismith-depot/runs/<Key>/<run>/events.jsonl`) | no | no | phase events with timestamps | no | wall clock | Works, wrong grain. DGS-679 and DGS-674 have no run record (built before runs existed) |
| Claude Code cost-state (`type: cost-state` lines in the session `.jsonl`; DGS-532) | exact per session and model, side calls and subagents included | exact list price (`costUSD`) | `totalDuration`, `totalAPIDuration` per session | **no**: one cumulative record per session, two snapshots in DGS-679's file | yes | Not usable per task |

Limits of the registry-window source:
1. A task window is wall clock. Time Jack or the conductor spent before the reviewer came back is inside it. Call it "agent time (task-start to task-end)", as the order says, never "compute time".
2. The window covers one session (the controller). Subagent records join it because they are in the same transcript; the ledger `dispatch ... agent=<id>` lines move a subagent's records to the right task when windows overlap.

Check on DGS-679 (whole session, transcripts against cost-state): Haiku output 18 624 and Opus output 3 660 match exactly. Sonnet output 40 833 against 42 621; cache read 21.11 M against 23.19 M. Cost-state total $4.04.

## Pricing finding (changes the build)
`claude-haiku-5-5` has a long-prompt tier in `packages/cli/src/tokens/prices/anthropic.ts`: when one request's prompt is over 100 000 tokens, every rate is 5 times higher. The tier is per **request**. `run-count.ts` already prices per response (`countedOf`). The snapshot keeps only sums. A sum of Haiku task 1 has a 540 K prompt, so `costFromPricing(sum)` picks the long tier.

DGS-679 task 1, Haiku: sum priced = $0.0785. Per response priced = $0.0157. No single Haiku request in that task was over the tier.

So `task-stamp` must read the responses (as `countTicket` does) and price each one, not read `tokens.json`. Backfill works the same way as long as the transcripts still exist on the Workbox (they do: DGS-679's transcript is present).

## Proof: DGS-679 task 1

Inputs: registry `~/.digismith-depot/token-registry/DGS-679.jsonl`, session `10102674-4b06-4671-b83d-57fa4eefb92f`.
- `task_start` 2026-10-27T09:50:59.499Z = 16:50:59 UTC+7
- `task_end` 2026-10-27T09:52:43.207Z = 16:52:43 UTC+7
- Agent time 1 min 44 s (103.7 s)

Counts (equal to `tasks.1` in `.digismith/board/DGS-679—voice-hook/tokens.json`):

| Model | Input | Output | Cache read | Cache write | Responses | List price |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| claude-sonnet-5-5 | 24 | 5 348 | 2 766 374 | 41 753 (5m 32 937, 1h 8 816) | 10 | $0.4478 |
| claude-haiku-5-5 | 18 | 5 594 | 474 505 | 65 254 (5m 65 254, 1h 0) | 9 | $0.0157 |
| Total | 42 | 10 942 | 3 240 879 | 107 007 | 19 | $0.4635 |

Review rounds, findings, fix rounds: **not recoverable** for DGS-679. Its ledger is gone and the board folder has no `findings.md`. The comment says "not recorded".

Comment that would post (plain text, ClickUp does not render Markdown; first line is the idempotence marker):

```
Hallmark task 1 of DGS-679
Window: 2026-10-27 16:50:59 to 16:52:43 UTC+7 (agent time 1 min 44 s)
claude-sonnet-5-5: in 24, out 5348, cache read 2766374, cache write 41753 (10 responses) = $0.4478
claude-haiku-5-5: in 18, out 5594, cache read 474505, cache write 65254 (9 responses) = $0.0157
Task total: in 42, out 10942, cache read 3240879, cache write 107007 = $0.4635 (list price)
Reviews: rounds not recorded | Findings: not recorded | Fix rounds: not recorded
Source: registry window + transcripts, per-response list prices (list prices version 2026-10-18)
```

(For a ticket built with the stamp in place, the last line of "Reviews" reads like `Reviews: 1 round | Findings: 2 (1 fixed, 1 parked) | Fix rounds: 1`, taken from the ledger.)

Scripts used for the proof are in the session scratchpad; the build will turn them into tested code.

## Idempotence (needed by the spec)
- `ClickUpClient.getTaskComments` returns the newest 25 comments. `addTaskComment` has no duplicate check; `add-comment` warns that a second `--yes` posts a second comment.
- Proposal: the first line `Hallmark task <N> of <Key>` is the marker. `task-stamp` reads the comments, and if one has the marker it does nothing (exit 0, "already stamped"). A ticket with more than 25 newer comments could miss the marker: the build either pages (check the API) or also keeps a ledger line `Task <N>: stamped (comment <id>)` as the second check. The spec decides.

## Proposed build tickets (proposals only; the Maestro writes ClickUp)

| Ticket | Proposal | Reason |
| --- | --- | --- |
| DGS-535 (Builder tasks as ClickUp subtasks) | **Discard** | Replaced by one comment per task (Jack, 2026-11-01). No subtask per task, no extra task IDs |
| DGS-536 (subtask whose home list differs from the parent's) | **Discard**, or park with no milestone | Its only reason was DGS-535. No other caller named. Keep it only if Jack wants subtasks across lists for another case |
| DGS-545 (roll-up from subtask to ticket, epic, initiative, as ClickUp fields) | **Rewrite** | A parent sums its children's totals once, at close, from the "Hallmark" block each child already carries in its description. No custom fields (a field needs Jack's yes). Re-runnable: same totals twice. Scope: ticket to epic to initiative; Jack's time (DGS-533) stays out |
| DGS-532 (totals from Claude Code cost-state records) | **Keep, narrow** | Cost-state is exact per session but not per task. Use it as a **check on the ticket total** (warn when the transcript total differs by more than a set share, 10 % as a start) and to catch side calls. Not a per-task source |
| DGS-445 (registry records nothing since 2026-10-10) | **Correct the note** | The registry still records. Last write 2026-10-27 (DGS-674, DGS-679 have `task_end`). The old cause (depot clone behind) was fixed; the ticket text is stale. Close it or re-title it to what is left (conductor-started workers skipping `bootstrap`) |

New ticket proposal (not in the order): **price per response in the snapshot**. Store `cost_usd` per task and model in `tokens.json` (summed from per-response prices), so no later reader prices a sum. `task-stamp` can do it alone inside Hallmark; a snapshot change would be a second, smaller ticket.

## Open points for the spec
1. Where `task-stamp` finds the task's review data: ledger first, `findings.md` second, "not recorded" last.
2. Whether the stamp posts on a plan **task** only, or also on `final` (whole-branch review). Default: also on `final`, titled "final review".
3. Comment text is plain: ClickUp does not convert Markdown in comments.

## Review findings table

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | packages/cli/src/tokens/stamp.ts:297 | Minor | inferredSessions defaults to [] so omitting it silently drops inferred sessions as unattributed. | taskUsage(records, entries, agents, "1") on a ticket with inferred sessions returns lower totals than the snapshot. | fixed (commit 32d6157) [r2] |
| task 1 | 1 | packages/cli/src/tokens/stamp.ts:316 | Minor | Overlapping windows from different sessions are double-summed and a repeated task_start while open is dropped, both untested. | Two sessions work task 1 at the same time for 10 minutes: agentSeconds is 1200, not 600. | fixed (commit 32d6157) [r2] |
| task 1 | 1 | packages/cli/src/tokens/stamp.test.ts:222 | Minor | The missing-transcript test leaves console.error output in the run. | Running stamp.test.ts prints 'tokens: no transcript found for session sess-gone'. | fixed (commit 32d6157) [r2] |
| task 1 | 1 | packages/cli/src/tokens/stamp.ts:299 | Minor | The ticket-session set is derived a third time (collectRecords, buildSnapshot, taskUsage). | A change to the attribution rule in one place leaves the others out of step. | fixed (commit 32d6157) [r2] |
| task 1 | 2 | - | - | approved, no findings | - | - |
| task 2 | 1 | packages/cli/src/tokens/review-data.ts:123 | Minor | Findings without a ruling line are counted as fixed (hand path) or dropped (role path). | Ledger has `Task 2: reviewed (3 findings)` and only `Review task 2 r1: F1 -> fixed`: findings = 1. With no Review lines and no parked line: fixed = 3 although nothing was ruled. | fixed (commit 0254c6b) [r2] |
| task 2 | 1 | packages/cli/src/tokens/review-data.ts:105 | Minor | A Scoped re-review line alone makes the ledger win for final, with findings 0 and rounds null. | reviewData('final', {ledgerText:'Scoped re-review (fix base a..b, m): clean', findingsText: <ticket rows>}) returns the ledger result with 0 findings instead of the findings.md rows. | fixed (commit 0254c6b) [r2] |
| task 2 | 2 | - | - | approved, no findings | - | - |
| task 3 | 1 | packages/cli/src/tokens/stamp.ts:155 | Minor | Window start uses windows[0] while the end uses the latest end, so the range depends on window order. | Two closed windows passed latest first: the printed start is the later window's start, not the first start. | fixed (commit 28de090) [r2] |
| task 3 | 1 | packages/cli/src/tokens/stamp.ts:167 | Minor | A model with one response prints '(1 responses)'. | Any model with responses = 1 gives a grammatically wrong line; the test at stamp.render.test.ts:64 asserts it. | fixed (commit 28de090) [r2] |
| task 3 | 2 | - | - | approved, no findings | - | - |
| task 4 | 1 | packages/cli/src/tokens/stamps-store.ts:188 | Minor | A complete JSON last line missing only its newline is ignored on read but counted after the next append. | Crash after the JSON bytes and before the newline: readStamps omits the stamp, then appendStamp adds the newline and the stamp reappears. | fixed (commit 3acbb70) [r2] |
| task 4 | 1 | packages/cli/src/tokens/stamps-store.ts:194 | Minor | The read guard checks only that task is a string. | A hand-edited line {"task":"1"} is returned as a StampLine with no comment_id, and a caller reading comment_id gets undefined. | fixed (commit 3acbb70) [r2] |
| task 4 | 2 | - | - | approved, no findings | - | - |
| task 5 | 1 | packages/clickup-client/src/client.ts:132 | Minor | `last.date as string \| number` hides a missing date; paging ends silently with a partial list | Last row has no `date`: `start` is undefined, page 1 comes back again, repeat guard stops the loop | fixed (commit 2327974) [r2] |
| task 5 | 1 | packages/clickup-client/src/client.ts:130 | Minor | Repeat-id stop could end paging early if ClickUp returns the boundary row on the next page; only the real probe (Step 4b) can show it | ClickUp includes the `start_id` row in page 2: page 2 counts as repeated, loop stops, comments past 50 are never read | fixed (commit 2327974) [r2] |
| task 5 | 2 | - | - | approved, no findings | - | - |
| task 6 | 1 | packages/cli/src/clickup/task-stamp.ts:438 | Minor | A ledger write failure after a successful post gives a generic warn with no 'do not send again' wording. | --ledger points into a missing directory; the comment is posted, appendLedger throws, the user sees only warn: and may re-send. | fixed (commit 8ee6148) [r2] |
| task 6 | 1 | packages/cli/src/clickup/task-stamp.ts:415 | Minor | The task id is built into a RegExp unescaped; in --all the ids come from unvalidated registry entries. | A registry task_end entry with task 'a.b' or '(' makes the ledger check match wrongly or throw. | fixed (commit 8ee6148) [r2] |
| task 6 | 1 | packages/cli/src/clickup/task-stamp.test.ts:243 | Minor | Two reg.append calls are joined with \|\| and depend on a void return value. | If append starts returning a truthy value, the task_end line for final is never written and the test fails for the wrong reason. | fixed (commit 8ee6148) [r2] |
| task 6 | 2 | - | - | approved, no findings | - | - |
| task 7 | 1 | packages/cli/src/tokens/hallmark-block.ts:560 | Minor | The Agent time line says "1 tasks" for a single task. | A ticket with one task renders "over 1 tasks". | fixed (commit 0acccac) [r2] |
| task 7 | 1 | packages/cli/src/clickup/ticket-total.ts:328 | Minor | The stamp's partial flag is ignored, so the Partial line covers only sessions without a transcript. | A task stamped with partial: true and all transcripts present gives a block with no Partial warning. | fixed (commit 0acccac) [r2] |
| task 7 | 1 | packages/cli/src/tokens/hallmark-block.ts:512 | Minor | The new sentinels match as substrings anywhere in the text, not as whole lines. | A description that mentions "Hallmark totals end" in a sentence is read as a sentinel and makes applyBlock throw or cut text. | fixed (commit 0acccac) [r2] |
| task 7 | 2 | - | - | approved, no findings | - | - |
| task 8 | 1 | packages/cli/src/tokens/README.md:87 | Minor | The line "Each stamp is also written there." does not say what is written or in which format. | A reader of the Hallmark section cannot tell that the stamps file holds one JSON line per stamp. | fixed (commit 6fdd344) |
| ticket | 1 | packages/cli/src/clickup/task-stamp.ts:67 | Important | Missing review data (null) is stored as 0 in the stamps file, so ticket-total shows 0 findings and 0 fix rounds where the task comment says not recorded. | Backfill a ticket with no ledger and no findings.md (source none), or stamp from findings.md (fixRounds null), then run ticket-total: the row shows 0 and counts as recorded. | fixed (commit 8f33e48) [r2] |
| ticket | 1 | packages/cli/src/tokens/review-data.ts:33 | Important | Hand-mode findings are summed over every 'reviewed (<K> findings)' line instead of taking the highest K as the spec says. | Ledger: reviewed (2 findings), fix round 1/5, reviewed (1 findings), fix round 2/5, reviewed (clean): the stamp says 3 findings, the truth is 2. | fixed (commit 7e4c5e3) [r2] |
| ticket | 1 | packages/cli/src/tokens/README.md:83 | Minor | README says --all stamps every task of the ledger; it takes tasks from the registry task_end entries. | A backfill without a ledger: the reader expects nothing to happen. | fixed (commit 76fe8ae) [r2] |
| ticket | 1 | packages/cli/src/clickup/task-stamp.ts:95 | Minor | The ledger 'stamped' check does not accept a leading '- ' bullet, unlike review-data.ts. | A ledger line '- Task 1: stamped (comment 9)' misses idempotence check 1; the stamps file still blocks the double post. | fixed (commit 76fe8ae) [r2] |
| ticket | 2 | - | - | approved, no findings | - | - |
