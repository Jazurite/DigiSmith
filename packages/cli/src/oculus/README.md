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
