# dg steward

Keeps ClickUp in step with the work (DGS-549). Not a session: each call loads one ticket's state file, acts, saves, ends.

    dg steward event <event> --ticket <KEY> [--by <who>] [--sha <sha>] [--answer yes|no] [--quote "<Jack's words>"] [--dry-run]
    dg steward rebuild --ticket <KEY>

State: `~/.digismith-depot/steward/<KEY>.json` (one per ticket; rebuildable; never removed in version 1).
The tracker comes from the profile (`tracker: clickup | jira | none`). `release_stage: true` turns on the `release` status.

| Event | From | Into |
|---|---|---|
| `concept-started` | backlog | concept |
| `discovery-started` | concept | discovery |
| `refinement-started` | concept, discovery | refinement |
| `approved` (gate, needs `--quote`) | refinement | to do |
| `started` | to do | in progress (start date) |
| `review-started` | in progress | review |
| `merged` | review | Sign-off Auto: done. Jack: acceptance. Unmarked: stays, records the merge |
| `verified` | review (merge recorded, unmarked) | done |
| `accepted --answer yes\|no` (gate, needs `--quote`) | acceptance | yes: done (release if on). no: refinement |
| `release-started` | review (Auto, merged), acceptance (accepted yes) | release |
| `released` | release | done |
| `documented` | done | documented |
| `discard`, `close` (need `--quote`) | any open status | discarded, Closed |

A non-zero exit (code 2) means a usage error only. Tracker or state failures print one line and exit 0.
Which skill or step sends which event is DGS-551.
