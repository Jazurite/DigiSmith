# dg steward

Keeps ClickUp in step with the work (DGS-549). Not a session: each call loads one ticket's state file, acts, saves, ends.

    dg steward event <event> --ticket <KEY> [--by <who>] [--sha <sha>] [--answer yes|no] [--quote "<Jack's words>"] [--hook] [--dry-run]
    dg steward rebuild --ticket <KEY>

State: `~/.digismith-depot/steward/<KEY>.json` (one per ticket; rebuildable; never removed in version 1).
The tracker comes from the profile (`tracker: clickup | jira | none`). `release_stage: true` turns on the `release` status.

| Event | From | Into |
|---|---|---|
| `shaped` | backlog | concept (the shaping skill fires it at its end; from concept it does nothing) |
| `discovery-started` | concept | discovery |
| `refinement-started` | concept, discovery | refinement |
| `approved` (gate, needs `--quote`; `--into to do\|scheduled`, default to do) | refinement | to do or scheduled |
| `returned` | refinement, discovery | concept (DGS-739; no quote; the Director's code sends it when a question waits for Jack; from concept it does nothing) |
| `started` | to do, claimed | in progress (start date; a start later than today is replaced) |
| `review-started` | in progress | review |
| `merged` | review | Sign-off Auto: done. Jack: acceptance. Unmarked: stays, records the merge |
| `verified` | review (merge recorded, unmarked) | done |
| `accepted --answer yes\|no` (gate, needs `--quote`) | acceptance | yes: done (release if on). no: refinement |
| `release-started` | review (Auto, merged), acceptance (accepted yes) | release |
| `released` | release | done |
| `documented` | done | documented |
| `discard`, `close` (need `--quote`) | any open status | discarded, Closed |
| `completed` (gate, needs `--quote`) | in progress | done (due date); a ticket that ends without a merge |

`scheduled` leaves by `dg autonomous schedule-release` (DGS-601), not by a Steward event.

A non-zero exit (code 2) means a usage error only. Tracker or state failures print one line and exit 0.

## Who sends what (DGS-551)

The status flow is the SOP DGS-731. Every send is `dg steward event <event> --ticket <KEY> --hook --by <who>`. `--hook`: silent without a ClickUp tracker; a usage error in the handler exits 0. A refusal is logged in the state file and printed once; nothing retries it. yargs checks the flags before the handler runs, so a bad flag still exits non-zero: every hook line in a skill ends with `|| true`.

| Event | Sent by | Where |
|---|---|---|
| `refinement-started` | the refine worker | bootstrap, adopt |
| `started` | the factory (in process), the Builder | `autonomous/steward-started.ts`, the order text, subagent-driven-development, executing-plans, init |
| `review-started` | the Builder | subagent-driven-development at `task-start --task final` (role mode runs it too); a Reviewer sends no event |
| `merged` | finishing, Option 1 | after the push; Option 2: whoever merges the PR |
| `documented` | report-implementation, finishing | after `report.html` is committed. The report's send is refused before the merge (the ticket is in review); finishing's send after the merge applies |
| `shaped`, `approved`, `accepted`, `completed`, `discard`, `close` | the Maestro, never a hook | see the Maestro rule |
| `returned` | the Director's code (`autonomous/director/escalate.ts`), never a skill hook | an escalation moves the ticket back to concept. The Director's refine gate also sends `approved --into to do` with its own approval line as the quote |

Not hooked: `claimed` (the factory's lock, `autonomous/scan.ts`), the claim rollback, `scheduled` to `to do` (`schedule-release`). `status-writers.test.ts` keeps this list honest.

## Dates and "Reschedule dependencies"

The ClickUp space setting "Reschedule dependencies" is ON. ClickUp can move the dates of a ticket that waits on another ticket, whenever the other ticket's dates change. The Steward does not fight this between events: it has no timer and no watcher. It repairs dates inside its own events, at every event, from the snapshot it reads first, even when the status is already there:

- A ticket in progress or later (not discarded or Closed): a start date later than today (UTC+7) becomes today.
- In every one of those statuses: a start date later than the due date becomes the due date.
- A missing start date is filled with the day the ticket entered in progress (from the state log), else today. An earlier start date is kept.
- `started` also replaces a late start date and reads the ticket back once after its write.
- If ClickUp still answers ITEM_238 (start after due) on the done write, the Steward retries once with start = due.
- A failed repair is a warning. The next event repairs again.
