# Nightwatch run record

Every worker run (Builder, Reviewer, Scout) gets two files in the depot. Later Nightwatch tickets read these two files and nothing else.

## Files

The root is `$DIGISMITH_DEPOT_DIR` when set, else `~/.digismith-depot`.
A run lives in `<root>/runs/<KEY>/<run-id>/`.
It holds `run.json` and `events.jsonl`.
Two helper files may sit beside them: `seq` (the counter) and `lock/` (the lock directory).
A run id looks like `builder-20261021T133005-a1b2c3`: role, UTC time, 6 hex digits.
Every attempt gets a new id. An id is never reused.
The ticket key and the run id must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
Hook errors go to `<root>/runs/hook-errors.log`, which stops growing at 256 KB.

## run.json

`dg run start` writes it once, at dispatch. Nothing edits it later.
Fields: `schema` (`nightwatch-run/v1`), `run`, `ticket`, `role` (builder, reviewer, scout, other), `order`, `seat`, `model`, `plugin_version`, `base_sha`, `branch`, `worktree`, `herdr` (`workspace`, `tab`, `pane`), `budget` (optional), `created_at`.
A fact that is not known is `null`, so the field set is always the same.
`created_at` is the dispatch time. Later facts go into events.

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

Each command tests `DIGISMITH_RUN_ID` in the shell first. With no id, no node process starts.
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

Cursor caveat: a follower that uses `--since` as a cursor may miss a line that repeats a `seq` it already passed.
A follower that must not miss a line re-reads the file and counts lines.
