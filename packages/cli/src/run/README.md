# Nightwatch run record

Every Claude Code session with the DigiSmith plugin is a run (DGS-598): a run that `dg run start` makes (Builder, Reviewer, Scout, sent by the conductor) or an automatic run that the SessionStart hook makes. Oculus and later tickets read these files and nothing else.

## Files

The root is `$DIGISMITH_DEPOT_DIR` when set, else `~/.digismith-depot`.
A run lives in `<root>/runs/<ticket or project>/<run-id>/`. The folder is the ticket key when the branch names one (`<KEY>__…`) at the start, else the project (the main repo folder name, made safe). It never changes.
`runs/.index/` holds `sessions/<session_id>` and `pids/<claude pid>` (one line: `<folder>/<run-id>`, plus the session for a pid) and `node-cache/` (the hooks' compile cache). Readers skip names that start with `.`.
An automatic run id is `s-<session_id>` of the session that started it.
It holds `run.json` and `events.jsonl`.
Two helper files may sit beside them: `seq` (the counter) and `lock/` (the lock directory).
A run id looks like `builder-20261021T133005-a1b2c3`: role, UTC time, 6 hex digits.
Every attempt gets a new id. An id is never reused.
The ticket key and the run id must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
Hook errors go to `<root>/runs/hook-errors.log`, which stops growing at 256 KB.

## run.json

`dg run start` writes it once, at dispatch. Nothing edits it later.
Fields: `schema` (`nightwatch-run/v1`), `run`, `ticket`, `role` (builder, reviewer, scout, maestro, conductor, other), `order`, `seat`, `model`, `plugin_version`, `base_sha`, `branch`, `worktree`, `herdr` (`workspace`, `tab`, `pane`), `budget` (optional), `created_at`, `source` (`auto` or `start`), `project`, `session_id`, `role_from` (`herdr`, `identity`, `pending`, `none`, `start`).
`ticket` is `null` for an automatic run without a ticket. A missing field in an old record reads as `start`/`null`.
The herdr labeller rewrites an automatic run's `run.json` once (role, role_from, ticket) through a temp file and a rename.
A fact that is not known is `null`, so the field set is always the same.
`created_at` is the dispatch time. Later facts go into events.

## Automatic runs

SessionStart without DIGISMITH_RUN_ID: a known session_id (resume, compact) appends `started` to its run. A `/clear` (source clear) continues the run of the same claude process (`CLAUDE_PID`) when that run is open or ended with reason `clear`. Otherwise a new run is made.
The role comes from `roleOf` in `role.ts`, the only role rule (DGS-599 imports it): outside herdr, one identity card for the repo root gives `maestro`, else `other`. Inside herdr the hook writes `other`/`pending` and starts `label-cli.ts` detached; the labeller reads this pane's agent name through `herdr-ws agent list` (3 s timeout) and applies the name table: `*-conductor` conductor, `*-rev*` reviewer, `*scout*`/`*probe*` scout, `<lower-case ticket key>` builder, else other.
The other hooks find an automatic run through `runs/.index/sessions/<session_id>`. No entry: nothing is written.
An explicit DIGISMITH_RUN_ID always wins.
Two env overrides exist for tests: `NIGHTWATCH_HERDR_WS` (path of the herdr-ws program) and `NIGHTWATCH_LABEL_NODE` (node path for the labeller spawn).

## Events

`events.jsonl` is append only. Each line is one JSON object:
`{"schema":"nightwatch-event/v1","seq":1,"ts":"<ISO UTC>","run":"<run-id>","type":"started","data":{}}`.

The hooks write five types: `started`, `blocked`, `tool`, `turn_end`, `ended`.
`dg run event` writes five conductor types: `review_ready`, `merged`, `pushed`, `lost`, `phase`.
A `phase` event needs `data.phase` to be exactly `building`, `review` or `merge`. Any other value, or none, is refused and nothing is written.
The set of types is closed. `dg run event` refuses an unknown type.

Order rule: the line order of the file is the authority. `seq` is a strong hint, not a unique key.
A very small race in the stale-lock break can give two lines the same `seq`.
Readers order by file position and tolerate a duplicate `seq`.
`show` takes the last event from the last line and counts lines, not distinct `seq` values.
The summary field `ended` is true only when an `ended` event comes after the last `started` event in file order (a `/clear` writes `ended`, then `started`, so that run is not over). An `ended` with no `started` at all counts as ended.
If the counter file is missing, the writer counts the lines of `events.jsonl` instead.

## Hooks

`hooks/hooks.json` has five entries that call `scripts/run-events/hook-cli.ts <kind>`.

| Hook | Type | Data |
| --- | --- | --- |
| SessionStart | `started` | `source`, `session_id` |
| Notification | `blocked` | `kind` (from `notification_type`), `session_id` |
| PostToolUse | `tool` | `tool`, `ok`, `session_id` |
| Stop | `turn_end` | `session_id` |
| SessionEnd | `ended` | `reason`, `session_id` |

Every hook event carries the `session_id` of the session that fired it (an id or null), so an `ended` from a child `claude -p` session that inherits `DIGISMITH_RUN_ID` can be told apart.

Each command starts node only when `DIGISMITH_RUN_ID` is set or the depot folder exists, and sets `NODE_COMPILE_CACHE` to `runs/.index/node-cache`. A machine without the depot starts no node process. Each hook stays under 100 ms (`scripts/run-events/hook-timing.test.ts`).
The script also writes nothing when the run directory has no `run.json`.
A hook always exits 0 and prints nothing.
A hook never writes message text, prompts, tool inputs or tool outputs.
The `tool` hook waits at most 150 ms for the lock, then drops its event and logs it. Every other writer waits up to 2 s.

## Commands

- `dg run start --ticket KEY --role R --order PATH (required; a Scout without an order file passes the path of its brief) [--seat S] [--model M] [--worktree DIR] [--branch B] [--base-sha SHA] [--workspace W] [--tab T] [--pane P] [--budget JSON]` writes `run.json` and prints the run id alone.
- `dg run event <run-id> <type> [--data JSON]` appends one conductor event. Exit 1 on an unknown run or type. `--data` must be a JSON object.
- `dg run list [--ticket KEY] [--json]` prints one row per run, newest first.
- `dg run show <run-id>` prints the main fields (run, ticket, role, seat, model, branch, worktree, herdr, created) and a summary. `dg run show <run-id> --json` prints the full `run.json` and the summary.
- `dg run tail <run-id> [--since seq]` prints the lines in file order, once, and exits. It keeps the lines whose `seq` is greater than the value (default 0). It skips a line that does not parse.
- `dg nightwatch view <overview|attention|runs|run|events|plan> [flags]` prints one read-only JSON view of the run record for the Nexus API. See `../nightwatch/README.md`.

Cursor caveat: a follower that uses `--since` as a cursor may miss a line that repeats a `seq` it already passed.
A follower that must not miss a line re-reads the file and counts lines.
