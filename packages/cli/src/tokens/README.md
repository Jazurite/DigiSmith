# tokens: per-ticket token counter (DGS-214, slice 1)

`dg tokens <ticket> [--json] [--write]` counts the tokens a ticket used. Counts only, no prices.

## What the reader counts

- Source: Claude Code transcripts (`~/.claude/projects/*/<session>.jsonl`, plus `<session>/subagents/agent-*.jsonl`).
- Five token classes per response: `input`, `output`, `cache_read`, `cache_write_5m`, `cache_write_1h`. When a line has no `cache_creation` split, all cache writes go to 5m and the record is marked `write_split: unknown`.
- Dedupe: one response = message id + request id. A repeated line keeps the highest `output` (streamed lines grow). Dedupe also runs across sessions of one ticket, because a resumed transcript replays earlier responses.
- Top-level `usage` counts are used. `usage.iterations` is ignored.
- Synthetic responses and non-assistant lines are skipped.

## Registry

`Registry` (types.ts) has `append(entry)` and `read(ticket)`. Default store: `~/.digismith-depot/token-registry/<ticket>.jsonl`; override the folder with `DIGISMITH_TOKEN_REGISTRY_DIR`. Where the registry finally lives belongs to DGS-220 (its ClickUp ticket). Slice 1 only reads it; an empty registry works and sessions come from fallback tagging (a `custom-title` or `agent-name` line anywhere in a transcript; any `gitBranch` value or `cwd` path segment that carries the key in the first 200 lines), shown as `inferred`.

## tokens.json

`schema_version: 1`. `--write` puts it in `.digismith/board/<ticket>—<slug>/tokens.json` when run in DigiSmith's own repo, else in the depot as `<ticket>.tokens.json` next to the registry. The path rule: resolve the checkout root (`git rev-parse --show-toplevel`, else the nearest parent with `.claude-plugin/plugin.json`); in DigiSmith's own repo (plugin name `digismith`) use that checkout's board folder, or from a linked worktree the main checkout's board folder (the board is untracked); otherwise the depot.

## Cross-check with ccusage

```
pnpm dlx ccusage@20.0.28 session --json
```

Pinned 2026-10-10. Compare one `session` entry (`period` = session id) per model with the `dg tokens` rows; ccusage cache write = `cache_w5m + cache_w1h`.

Result on 2026-10-10, ticket DGS-154, session f94b2d68 (DGS-198 has no transcript in this corpus): all four totals equal for all three models.

| model | input | output | cache read | cache write (5m+1h) |
|---|---|---|---|---|
| claude-sonnet-5-5 | 682 | 240602 | 32350245 | 1346894 |
| claude-opus-5-5 | 36 | 2395 | 898005 | 150337 |
| claude-haiku-4-5 | 502 | 4164 | 2272295 | 184280 |

## Corpus findings (2026-10-10, 110461 lines, 307 MB)

- `usage.iterations` with more than one entry: none found in corpus on 2026-10-10 (28170 lines carry it, all with one entry). Rule stays: top-level counts. A fixture test pins it.
- Compaction: 13 `isCompactSummary` lines and 13 `compact_boundary` lines, none with usage. They add nothing. Fixture test pins it.
- Resumed sessions: 4 session ids appear in two files. The newer file replays the older lines (same message and request ids, old `sessionId`) before adding its own. Fix: `countTicket` dedupes across sessions and tags each record with the session whose file it read. Test added in `count.test.ts`.

## Task tagging and inferred steps

`tokens.json` `tasks` maps a plan task id to its counts. A response gets at most one task. First the SDD ledger: an `agent=<id>` on a `Task <N>: dispatch ...` line (text after the id is ignored). Then the task window: `entry.ts task-start --ticket K --task N` and `task-end` write `task_start`/`task_end` marks; a response of the same session inside a window belongs to that task. A window closes at the `task_end` of the same task, at the next `task_start`, or at `step_end implementation`. The controller's own turns have no agent id; the window is what tags them. Output outside any window (setup, report, merge prep) stays in its step only.

A worker session with no `step_start` and a `step_end finishing` (a build that never opened a build skill) has its responses up to that end counted as `implementation`. The snapshot then lists `inferred_steps: ["implementation"]`. The field is absent otherwise.

## Known limits

- Slice 2 is not built: skills and the SDD ledger do not write registry entries yet, so steps are `other` unless a registry exists.
- Live session id: the "newest transcript in the project folder" rule is unreliable (several live sessions share a folder). Slice 2 is blocked until a reliable source exists.
- Fallback tagging misses sessions whose titles and agent names do not carry the ticket key and whose branch and cwd in the first 200 lines do not either.
- The usage reader (`claude-code-reader.ts`) still reads each transcript whole into memory. Attribution reads incrementally (64 KB chunks, a line over 1 MB is skipped), so a huge unrelated transcript is safe to scan, but a huge ticket transcript is still read whole when counted.
- If a ticket includes resumed session B but not original session A, the A work replayed inside B's file is counted for the ticket.

## Run snapshots (DGS-590)

`dg tokens runs [--run <run-id>] [--dry-run]` is the 5-minute job for the Oculus dashboard. One pass writes three files. `--run` matches the whole run id. `--dry-run` writes nothing and prints `-` for the burn. `--run` leaves `burn.json` alone, because one run is not the burn of all runs, and counts the named run even when it is final.

- `runs/<folder>/<run>/tokens.json` (`oculus-tokens/v1`): per model counts and cost, the total, `unpriced_models`, `sessions`, 5-minute `buckets` and `final`.
- `runs/.tokens/burn.json` (`oculus-burn/v1`): tokens and cost of the last 60 minutes (12 full 5-minute buckets before now) over all runs (read from each stored `tokens.json` changed in the last 25 hours, so ended and unchanged runs stay in; a file that does not parse is skipped), the number of runs with a bucket in it, and `unpriced_models`.
- `usage-probe/seats.json` (`oculus-seats/v1`): the five-hour and weekly window of each seat, from the probe's `out-<seat>.json` files.

Scope: every `runs/<folder>/<run>/` with a `run.json`. Folders and runs that start with `.` are skipped. A run with `final: true` is skipped unless `events.jsonl` is newer than `tokens.json` (the run started again). A run is kept when `events.jsonl` (else `run.json`) changed in the last 7 days, or when its `tokens.json` is older than `events.jsonl`. An ended run gets one last pass and is then marked `final`. A run that started again is counted again and `final` is recomputed.

Sessions: the `session_id` in `run.json` plus the `session_id` of each `started` event. Only responses with `ts >= created_at` count.

Incremental: `tokens.state.json` beside `run.json` keeps file cursors and per-response counts. It holds no text and no folder path. Delete it to recount the run.

Cost: per response, at list price, from the table `ANTHROPIC_PRICES_VERSION`. A model with no price is listed in `unpriced_models` and its cost is null, so the sums that include it are null too.

Job: `oculus-tokens` in the Nexus API scheduler runs the command every 5 minutes. It starts no model. It loads at the next API restart.

The usage probe stays manual. The conductor saves `out-<seat>.json` (runbook "Reading usage"). A scheduled probe is a follow-up ticket the Maestro files.
