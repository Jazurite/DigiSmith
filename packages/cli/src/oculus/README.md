# oculus

`dg oculus view <name>` prints one JSON line (the run record seen through one view) to stdout and exits 0. Errors go to stderr with exit 1; stdout stays empty.

Views: `overview`, `attention`, `runs`, `run`, `events`, `plan`, `live`.

Flags: `--run ID`, `--ticket KEY`, `--since N`, `--before N`, `--tail N`, `--group G`, `--state S`, `--role R`, `--trigger T`, `--project P`, `--limit N`.

- `run` and `events` need `--run`; `plan` needs `--ticket`. An unknown run exits 1 with `not found`.
- `overview` and `runs` show runs with an event in the last 7 days.
- Ids must be safe names (no path parts).
- Read-only: the command never writes to the depot.
- The Nexus API calls this command to serve the Oculus UI.
- `live` lists every herdr agent (name, pane, tab, workspace, role, project, status, open run). It makes one herdr call with the fixed argv `--session default agent list` (3 s timeout) and keeps only allowed fields: no pane text, no terminal title, no folder path. It takes no flag. When herdr fails it still exits 0 with `herdr: "unreachable"` and no agents.
- Token fields (DGS-590). The views only read the files that `dg tokens runs` writes; they never count.
  - `runs` rows and `run` carry `tokens` (`{ total, costUsd, unpriced }` on a row; models, total and price version on `run`) and `tokensAsOf`. Source: `runs/<folder>/<run>/tokens.json`.
  - `overview` carries `burn` (`tokensPerH`, `usdPerH`, `asOf`; source `runs/.tokens/burn.json`) and `seats` (per seat: `readAt`, `stale`, `fiveHour`, `weekly`; source `usage-probe/seats.json`).
  - Freshness is 15 minutes. A run snapshot that is not final and older than that gives `tokens: null` and keeps `tokensAsOf` (the UI says "stale since"). A final snapshot never goes stale. A wrong schema or an unreadable file gives both null.
  - `burn` is null when the file is missing, has the wrong schema or is older than 15 minutes. `seats` is null when the file is missing or older than 15 minutes. A seat is `stale` when its own reading is older than 15 minutes. A window whose `resetsAt` has passed is null.
- Phase times: each run row has `phaseSince`, the start of its current phase on the watchdog's clock (`phaseOf().since`; null when the run has no phase). Each pipeline step has `durationSec`: for a done step, the seconds to the next step with a time, or to the run's end for the last step of an ended run; null for current, waiting and lost steps, for Pushed, and when the times are out of order. The budget's `elapsedMin` counts from `phaseSince`. No new event type: these come from the events that exist.
