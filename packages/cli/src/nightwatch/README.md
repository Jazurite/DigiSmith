# nightwatch

`dg nightwatch view <name>` prints one JSON line (the run record seen through one view) to stdout and exits 0. Errors go to stderr with exit 1; stdout stays empty.

Views: `overview`, `attention`, `runs`, `run`, `events`, `plan`.

Flags: `--run ID`, `--ticket KEY`, `--since N`, `--before N`, `--tail N`, `--group G`, `--state S`, `--role R`, `--trigger T`, `--limit N`.

- `run` and `events` need `--run`; `plan` needs `--ticket`. An unknown run exits 1 with `not found`.
- Ids must be safe names (no path parts).
- Read-only: the command never writes to the depot.
- The Nexus API calls this command to serve the Nightwatch UI.
