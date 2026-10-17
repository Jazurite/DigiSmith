# DGS-529 handoff: texts for the Maestro

## 1. Runbook section (paste into .digismith/sessions/workbox.md, after "Start of a ticket")

#### Start of a Reviewer (owner: conductor; DGS-529)

A Builder reports `STOP: task-review-ready <pack>` or `STOP: ticket-review-ready <pack>`. Never answer it by starting a review in the Builder's pane.

- **Model.** Read `model:` from `<pack>/pack.md`. Never pick it yourself.
- **Seat.** Use "The rule" inside the seat order in force. For a ticket Reviewer, exclude the Builder's seat first when the other seat has headroom.
- **Ticket Reviewer.** Run S0 to S6 with brief `skills/reviewer/brief.md` (TYPE=ticket, PACK=the pack folder), agent `<key>-rev`, label `<KEY> ⚚ Review`, `--model <model>`. Write the card with `role: reviewer`, `reviewer_type: ticket`, `seat`, `under: <your id>`. Send `review-started` to the Steward at S4. Close the worker after the verdict.
- **Task Reviewer.** One worker per ticket: agent `<key>-rev-task`, label `<KEY> ⚚ Review task`. At the first pack run S0 to S6. Write the card with `role: reviewer`, `reviewer_type: task`, `seat`, `under: <your id>`. For each later pack: read the pane with `--format ansi`, send `/clear`, then `/model <model>` if it differs from the worker's, then `Read <pack>/pack.md and follow the Reviewer card.` Close the worker after the last task review is clean.
- **Relay.** Task findings go to the Builder without filtering. Ticket findings: verify each one (`digismith:receiving-code-review`), then relay. A finding you cannot verify goes to the Maestro.
- **Watch.** While a Builder in role mode runs, keep a watch (Monitor) on its pane for lines that start with `STOP: task-review-ready` or `STOP: ticket-review-ready`, and on its idle status. Answer each STOP within one watch cycle. A STOP unanswered for 15 minutes: report it to the Maestro.
- **Builder start.** When you start a Builder, set `DIGISMITH_REVIEW_MODE=role` in its pane before `agent start` (S3). A Builder without it runs the old hand mode.
- **After the build.** Attach `<board folder>/findings.md` to the ticket with `dg clickup upload-attachment`.

## 2. DGS-488 (statuses and roles): row changes

- Status table, `review` row: "whole-branch review, fixes, merge" becomes "Reviewer judges; Builder fixes; Reviewer re-checks; then merge". Skills and roles column: "Reviewer (digismith:reviewer)".
- Role table, Reviewer row: Does: "review, re-check findings". Never: "fixes, merges, builds". (The preview for Jack tickets: see section 3 of the DGS-529 spec.)
- Open points: delete "Reviewer and Releaser as one role or two". Decided: two roles.

## 3. DGS-404 (role architecture): row changes

- Authority ladder, Reviewer row: Alone: "Read the target. Write findings, a verdict and one report file in scratch. Run the profile's preview recipe for a Sign-off: Jack ticket after an approved verdict, to the preview target only." Needs the role above: "A wider read scope." Always needs Jack: "Anything that changes something else."
- Session card: new optional fields `reviewer_type` (task | ticket; reviewer only) and `seat` (an account name; worker or reviewer). A reviewer's legal parents are a conductor or a Maestro.
- Roles table, Reviewer row, "Who starts it": "A conductor or a Maestro. Never a Builder."

## 4. First live use: does the mode variable reach the Builder? (do this once, after the merge)

Claude Code removes some variables from the environment of its Bash tool (DGS-553: `CLAUDE_CODE_OAUTH_TOKEN`). The role mode depends on `DIGISMITH_REVIEW_MODE` reaching the Builder's Bash tool. Prove it before the first real role-mode build:

1. In a herdr pane, run `export DIGISMITH_REVIEW_MODE=role`, then start a Claude session in that pane, the way the conductor starts a Builder (`herdr agent start ...`).
2. In that session, ask it to run exactly one Bash command: `bash skills/subagent-driven-development/scripts/review-mode`.
3. Expected output: `role`. Then repeat in a pane without the variable. Expected: `hand`.
4. If the first run prints `hand`, the variable does not arrive. Then the mode must come from the session card instead: do not start a role-mode build. File the card-mode build ticket (see the Refiner output, "Contingency") and wait.
