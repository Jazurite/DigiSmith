---
name: reviewer
description: Use when starting, briefing or judging a review in role mode (a conductor or Maestro handling a Builder's STOP: task-review-ready or STOP: ticket-review-ready), when you are a Reviewer worker told to follow the Reviewer card, or when asked what the Reviewer role is. Not for a by-hand review: use digismith:requesting-code-review for that.
---

# Reviewer

The Reviewer judges. The Builder fixes. The Reviewer re-checks. The Reviewer never fixes, never merges, never changes anything, and never reviews its own work. Spec: `.digismith/board/DGS-529—reviewer-role/design.html`.

**A Builder never starts or runs a review.** In role mode a conductor or a Maestro starts every review. The Builder reports `STOP: ...-review-ready` and waits.

## Two modes

- **Hand mode** (the default, `DIGISMITH_REVIEW_MODE` unset or not `role`): SDD and `requesting-code-review` run as they always did. A Builder or a person dispatches the reviewers. Nothing in this card applies.
- **Role mode** (`DIGISMITH_REVIEW_MODE=role`, set by the conductor when it starts a herdr Builder): the rest of this card.

## The two types

| Type | Judges | Primitive | Started by | Model |
|---|---|---|---|---|
| `task` | One task's diff against the task text | `task-reviewer-prompt.md`; re-review: `re-review-prompt.md` | A conductor or Maestro, after `STOP: task-review-ready` | Sonnet 5.5 |
| `ticket` | The whole ticket against its spec and plan | `code-reviewer.md`; re-review: `re-review-prompt.md` | A conductor or Maestro, after `STOP: ticket-review-ready` | Opus 5.5 |

The primitives live in `skills/subagent-driven-development/` and `skills/requesting-code-review/`. They stay the source of truth for severity, what to check, the fix loop and the report format. This card does not copy them.

## Model policy (the role picks the model)

`dg reviewer pack` applies the policy and writes `model:` into `pack.md`. The conductor and the Builder do not pick the model. Pass on what `pack.md` says.

- `task`: `claude-sonnet-5-5`. A diff above 800 changed lines gets `claude-opus-5-5`.
- `ticket`: `claude-opus-5-5`.

## Seat

The conductor picks the seat with the Workbox runbook's rule, inside Jack's seat order in force. For a `ticket` Reviewer it excludes the Builder's seat first when the other seat has headroom. The card of a Reviewer worker has `role: reviewer`, `reviewer_type`, `seat`, and `under` = the conductor or Maestro that started it.

## Flow (role mode)

0. **Watching.** While a Builder in role mode runs, the conductor keeps a watch (Monitor) on the Builder's pane for lines that start with `STOP: task-review-ready` or `STOP: ticket-review-ready`, and on the Builder's idle status. It answers each STOP within one watch cycle. A STOP that stays unanswered for 15 minutes is reported to the Maestro.
1. The Builder runs `dg reviewer pack ...` and reports `STOP: task-review-ready <pack>` (or `STOP: ticket-review-ready <pack>`). The pack folder holds `pack.md`, which gives the ticket key (`ticket:`) and lists the input files by absolute path.
2. The conductor starts the Reviewer worker (Workbox runbook, "Start of a ticket", S0 to S6) from `skills/reviewer/brief.md`, with the model from `pack.md`. A `ticket` Reviewer is one worker per review. A `task` Reviewer is one worker per ticket: for each new pack the conductor sends `/clear`, then `/model <model>` if it differs, then `Read <pack>/pack.md and follow the Reviewer card.`
3. The Reviewer reads `pack.md`, follows the primitive it names, and writes `<pack>/report.md`. The report ends with the findings block (one fenced block, info string `json findings`). The Reviewer ends with one pane line: `done: <pack> verdict: <...>`.
4. The conductor relays the result to the Builder. For `task` it relays without filtering. For `ticket` it verifies each finding first (`digismith:receiving-code-review`); a finding it cannot verify goes to the Maestro.
5. The fix loop is the primitive's: up to five rounds for `task`; one fix wave and one scoped re-review for `ticket`. The Builder fixes. The Reviewer re-checks against a new pack.
6. The human partner decides what blocks and what is parked: the Builder's SDD controller for `task`, the Maestro for `ticket`. The Maestro sends taste questions to Jack. The Reviewer cannot clear its own finding.

A Critical or Important finding, a confirmed ⚠️ item or a spec ❌ blocks (the next task for `task`, the merge for `ticket`). Minor findings are deferred in the ledger and never block.

## Report and table

- The findings block: a JSON array of `{ id, path, line, severity, what, scenario }`. `[]` when there are none.
- The Builder appends one ledger verdict line per finding, with the human partner's ruling as written: `Review <task|ticket> <id> r<round>: F<n> -> <fixed|parked|rejected> (<reason>)`.
- `report-implementation` runs `dg reviewer table --workspace <workspace> --out <ticket folder>/findings.md`. The conductor attaches `findings.md` to the ticket (`dg clickup upload-attachment`).

## Steward moments

`review-started`: the conductor sends it when it starts the `ticket` Reviewer. `merged`: the merge hook sends it. The Reviewer never merges. A `task` review sends no event. The wiring is DGS-551.

## Rules for the Reviewer

- Read only on the checkout. Write only `<pack>/report.md`.
- Register this session first, at the start of every review, including after a `/clear`: `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts session --ticket <KEY> --role reviewer`. `pack.md` has a `ticket:` line: its value is `<KEY>`. A `ticket: none` line means the work has no tracker key: skip the command. The command skips a session that is already registered.
- Read only what `pack.md` lists besides the card and the primitive. Never read the Builder's conversation, other reviewers' reports or the rest of the ledger.
- The report is the primitive's own output plus the findings block.
- Report a need to change something as a finding. Never edit.
- Never print or read a token, a key or a `.env` file.
- Never answer a "keep allowing reads" prompt.
