# DGS-435 conductor flux: Implementation Report

Ticket: DGS-435. Date: 2026-10-13. Branch `dgs-435`. Not run against a real conductor.

## Summary
`fluxConductor(target, opts, deps)` and `fluxAll(...)` in `scripts/conductor/flux.ts` are a job module the Nexus scheduler can call. `cli.ts flux <agent> | --all [--dry-run] [--log] [--json]` is the manual entry. Per conductor: night window (one constant, 23:30 to 02:00 UTC+7, no override) -> agent found -> status idle/done -> input box empty (ANSI: dim = suggestion, normal = typed) -> no worker (cards, `workers` list, note Running/Waiting rows) -> nothing in flight in the note after the last handoff -> note written after the last work -> context size from the last transcript `usage` -> a last look -> `/clear` without `--wait` -> poll the session id (60 s) -> wake prompt naming brief and note -> verify (new id, reply, idle, new card open by the NEW session id, old card closed in the archive, card state = note) -> one JSON line in `~/.digismith-depot/runs/conductor-flux/<UTC+7 date>.jsonl`.

## Hard limits, in code
- herdr only through `herdr-ws` with a closed verb set (`agent list`, `agent get`, `pane read ... --format ansi`, `agent prompt`). No close, kill, start, focus or send-keys exists; the runner guard refuses them (tested). The flux never closes a tab.
- A dry run builds the herdr WITHOUT `agent prompt`; both the module and the runner refuse a send (tested). It logs only with `--log`.
- `--all` prints its targets first and never includes `digismith-conductor`; a maestro card is refused. No daytime flag (a test tries `--force`, `--day`, `--now`, `--override`).
- Nothing in the module deletes.

## Decisions
- `/clear`, not `/new` (Claude Code; DGS-214 case 6). No `--wait` on `/clear`; the poll decides. The wake uses `--wait --until idle --until done --timeout 180000` and is never resent.
- Targets: `~/.digismith-depot/flux-targets.json` (`{agent: {project, brief, note, wake, workers}}`), flags override for one named agent, `conductors.json` as fallback. The wake text is per target with a generic default; paths are prepended if missing.
- Token registry (DGS-214): keyed by ticket; a conductor has none; nothing is written. The old to new id goes in the run log.
- Window and log path are constants at the top of `flux.ts` (`NIGHT_WINDOW`, `FLUX_RUN_LOG_DIR`).

## Run log line
`{v, job:"conductor-flux", run_id, ts (UTC+7), ts_utc, agent, dry_run, result: fluxed|skipped|failed, reason, needs_attention, tokens_before, tokens_after, session_old, session_new, checks{}, would_send?, duration_s}`. Exit code 2 when a conductor failed.

## Nexus later (DGS-457)
The functions take and return plain data. `POST /jobs/conductor-flux/run` with `{agents: [...]|"all", dryRun}` calls `fluxAll` in the Nexus process with the same deps and returns the results array. `dg conductor flux` then POSTs and prints. The night rule stays in the module, so a wrong cron entry cannot flux by day.

## Review
Independent review agent: 9 findings. Fixed: colour codes read as dim (typed text could look empty); a failed log write turned a finished flux into an error; a wake starting with `-` was refused only after `/clear`; an empty session id counted as renewed; no last status look before `/clear`; one bad `agent get` reply ended the run; `--all` ignored per-agent flags. Not changed: `--timeout` is milliseconds per `herdr agent prompt --help`, repeated `--until` is documented. Left to the first use: that `/clear` through `agent prompt` lands as a command.

## Tests
New: `flux.test.ts`, `flux-io.test.ts` (91 tests, fakes only: fake herdr, temp depot, fake clock). Full suite 2138+ pass; no real herdr or pane was touched by a test.

## For the first use
Put `token-economics-conductor` in `flux-targets.json` with brief `.digismith/sessions/b3-maestro/brief.md`, note `.digismith/sessions/b3-maestro/note.md`, its wake text, and a `workers` list (it has no card, so the list and the note are its worker evidence). Run `HERDR_WS=w2 node --experimental-strip-types scripts/conductor/cli.ts flux token-economics-conductor --dry-run` first (read-only).
