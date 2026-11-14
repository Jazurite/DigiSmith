# DGS-178 Spec: finishing posts one ClickUp progress comment per merge

Status: draft for checkpoint 1. Refinement only. Written 2026-11-13 by worker `dgs-178-refine`.
Scope source: the Pitch at the end of the DGS-178 description (the October text above it is history).

## Goal

When a ticket merges (finishing Option 1), ClickUp gets one short human comment on the ticket:
what merged, tests, decisions, what is next, what was split off, and a pointer to the attached
`report.html`. Today the status move (DGS-551), token stamps (Hallmark) and files (DGS-547) land,
but nothing gives a summary. The rule from Jack (2026-10-04) was only done by hand on DGS-159 and DGS-161.

## Decisions fixed by the brief (not reopened)

1. One comment per merge, fixed shape, short. UTC+7 first, UTC in brackets. No AI attribution.
2. A failed post is logged; finishing goes on.
3. ClickUp key only (`^DGS-\d+$`, same rule as `attach-record`). Jira stays with `jira-progress-write-back`.
4. No-gos: status changes, files, token numbers, Nightwatch alerts, checkpoint or blocked comments.
5. Part-done comment: in only because it costs one optional flag (see D6).
6. Writes go through `dg`. `dg clickup add-comment` already exists; the missing piece is a command that builds the body (a plan TASK, not a script).

## Technical decisions (mine, with reasons)

**D1. A new command `dg clickup merge-comment`, not prose in the skill.**
The skill is read by an LLM. If the LLM also lays out the comment, the shape drifts between merges.
So the command renders the fixed shape and the skill only passes the few free-text fields. Facts that
git or files know (range, commits, plugin version, time, report pointer) are computed by the command, not typed by the agent.
Reason: testable with mocks, same shape every time, and no one-off script (brief rule 6).

**D2. Inputs.**
`--task <Key>` (required), `--base <sha>` and `--head <sha>` (the pin refs the finishing skill already holds),
`--tests <text>`, `--decisions <text|@file>`, `--next <text>`, `--split-off <text>`, `--part <label>` (optional),
`--board-folder <path>` (to find `report.html`), `--yes`. Without `--yes`: print the rendered comment and the call, send nothing (same dry run as `add-comment`).
The agent supplies four short fields: tests, decisions, next, split-off. A missing field renders as `not reported` (tests, decisions) or `none` (next, split-off), so the shape never loses a line.

**D3. Computed by the command.**
- Range and commits: `git log --format=%h %s <base>..<head>`, merge commits excluded, capped at 8 lines then `+N more`. The range line reads `merge <base7>..<head7>`.
- Plugin version: `version` in `.claude-plugin/plugin.json` read at `HEAD` of the checkout with `git show HEAD:...` (not at `<head>`: the hook 01 bump is a separate commit after the merge commit, as DGS-161's comment shows, so `<head>` is one version behind). Missing or unreadable file: the `, plugin <version>` part is omitted.
- Time: now in UTC+7 with UTC in brackets, `2026-11-13 14:20 UTC+7 [07:20Z]`.
- Report pointer: one line `Report: report.html is attached to this ticket.` only when `<board-folder>/report.html` exists AND the depot attachment record (`readAttached`) shows it attached. Otherwise the line is omitted. The comment never repeats report content.

**D4. Shape (fixed, about 10 to 14 lines).**
```
<Key> merged, <time>: <part label or "done">.
Merge <base7>..<head7>, plugin <version>.
- <commit subject> (<sha7>)   (max 8, then "+N more")
Tests: <tests>
Decisions: <decisions, max 3 one-line items>
Next: <next>
Split off: <split-off>
Report: report.html is attached to this ticket.
```
Plain text. ClickUp does not convert markdown through this API (add-comment help says so), so no markdown syntax.
The wording is a taste question (Q1 below); this is the proposal.

**D5. No duplicate on a re-run.**
`add-comment` has no duplicate check ("a second --yes posts a second comment"). Finishing can be re-run after a stop.
The command records `{head sha, comment id}` per ticket in the depot (`<Key>.comments.json`, same folder and write style as `attachments-store`) and skips with `skipped: already posted for <head7>`. Key is the head sha, so a part-done comment on a later part (different head) still posts.

**D6. Part-done (decision 5).**
`--part "Part 2 of 3"` changes the headline to `<Key> part merged ... : Part 2 of 3.` and nothing else. No new logic, one string and one test. Not wired by default: the finishing skill passes it only when the ticket's plan says it merges in parts.

**D7. Reuse.**
Refactor the post-and-read-back block of `add-comment.ts` into an exported `postComment(client, taskRef, text)`; `add-comment` calls it, `merge-comment` calls it. Same read-back check, same `notify_all: false`. No new client method.

**D8. Never block.**
The handler catches everything. A failure prints a line starting `warn:` to stderr and sets exit code 1. The skill block ends `|| true`, and a printed `warn:` line triggers the ledger line `Merge comment: failed (<that line>)`, exactly like `Attach record`. A non-ClickUp key prints `not a ClickUp key, skipped` and exits 0.

**D9. Where it sits in finishing.**
Option 1 only (the same place as the `merged` Steward event: the merge happened). After the `attach-record` lines (so the report is attached before the pointer is computed) and before `documented`. Option 2 (PR) sends nothing, because the merge happens later; Option 3 and discard send nothing. DigiSmith's own repo and consumer repos behave the same; a repo with a Jira key skips silently.

**D10. Skill wiring guard.**
A test beside `attach-hooks.wiring.test.ts` asserts the finishing skill contains the `dg clickup merge-comment` line, it ends `|| true`, sits after the `attach-record` lines and inside Option 1 only, and names the `warn:` ledger sentence. A drift in the skill text then fails a test.

## Out of scope

Status moves, files, token numbers, Nightwatch alerts, checkpoint or blocked comments, Jira, comments on non-merge events, editing or deleting a posted comment, comments from the Maestro by hand (they keep using `add-comment`). The autonomy-policy line (DGS-176) is not part of this ticket: the finishing step is the permission, by Jack's 2026-10-04 rule.

## Risks

- The comment repeats `report.html`: held down by the 8-commit cap, one line per field, and the pointer line.
- The agent writes a long tests or decisions field: the command truncates each field at 300 characters with `...` and renders only the first 3 decision items.
- Pins are deleted by Step 6 cleanup, before the attach and comment steps run: the skill reads `<base>` and `<head>` from the pins in the `merged` event block and keeps both values for the comment step (plan Task 5). The version comes from `HEAD` after the hooks, so it includes the bump.

## Questions for the Maestro (taste, user-facing)

Q1. Wording of the comment: is the D4 shape and its English right (headline `DGS-178 merged, 2026-11-13 14:20 UTC+7 [07:20Z]: done.`, field labels Tests, Decisions, Next, Split off)? The October model comments were long prose; this is shorter and fixed.
Q2. What "decisions" means for a reader: my proposal is the decisions from the ticket's spec that a reader would not assume from the title, max 3 one-liners (for example "ClickUp key only, Jira untouched"). Not every spec choice, not review findings.
Q3. Should the comment notify the ticket's watchers? Proposal: no (`notify_all: false`, as `add-comment` does today).

## Acceptance

- `dg clickup merge-comment --task DGS-x --base A --head B` prints the fixed shape in a dry run; with `--yes` it posts once and reads it back; a second run for the same head posts nothing.
- A failed post (client error, read-back miss, missing credentials) prints `warn:` and never stops finishing.
- The finishing skill carries the step in Option 1, after attach-record, guarded by a wiring test.
- `add-comment` behaves as before (its own tests pass after the `postComment` refactor).
- No status change, no file, no token number is ever sent by this step.
