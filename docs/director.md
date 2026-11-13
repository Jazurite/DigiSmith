# The Director

The Director keeps the Workbox factory running and nothing else: flow, capacity, unblocking, escalation. It is a Claude session of kind `factory` in the Castle herdr session. Its card is `skills/director/SKILL.md`; its code is `packages/cli/src/autonomous/director/`. Inside its written authority it decides, does and records, and never asks. Outside it, it puts one question on the ticket (the ticket goes to `concept`) and waits for Jack.

## Lanes

- **Build lane:** the scan claims a `to do` ticket (`lock.json`, one at a time) and hands the order to the ticket's driver.
- **Refine lane:** the scan claims a `refinement` ticket (`refine-lock.json`, one at a time, under the `role` limit). A refine worker writes the spec and plan; a plan Reviewer judges them; on a clean report `dg director refine-release --result ready` moves the ticket to `to do`. The gate refuses a plan that names an authority path without Jack's written line on the ticket.

The lanes are independent. A refine claim never writes a ClickUp status.

The Director never writes a ticket status itself. Its two status moves are Steward events: an escalation sends `returned` (refinement, discovery or to do, back to concept) and the refinement gate sends `approved` (refinement to to do). They need a profile whose tracker is `clickup`: with `tracker: none` every Director escalation fails with "no ClickUp tracker".

## The files it keeps in `~/.digismith-depot/autonomous/`

| File | Holds |
|---|---|
| `refine-lock.json` | the refine claim (ticket, round, claimed at) |
| `director/decisions.jsonl` | every decision, one line each (append only) |
| `escalations.jsonl` | every question asked, open or returned |
| `comment-pending.jsonl` | ClickUp comments that failed and wait for the next `plan` |
| `director/last-tick.json` | the hash and time of the last wake-up |
| `director/authority-approvals/<KEY>.json` | Jack's approval for a plan that changes the Director's authority; read by the merge gate |

## Commands

- `dg director plan [--json]`: the moves the world calls for (read only).
- `dg director do <move-id>`: run one move and record it.
- `dg director decide --id <id> --ticket <KEY> --what <t> --why <t>`: record a decision; a Jack-only id is refused.
- `dg director escalate --ticket <KEY> --question <t> [--id <id>] [--via-release]`: one question to Jack.
- `dg director refine-round --ticket <KEY>`, `dg director refine-release --ticket <KEY> --result ready|escalated|failed ...`: the refine gate.
- `dg director seat --readings <file.json> [--heavy]`: rank the Claude seats.

The Director never merges a protected path. Until the Warden exists the Maestro answers a protected-path merge.

express lane: DGS-700, later
