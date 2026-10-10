# tokens: per-ticket token counter (DGS-214, slice 1)

`dg tokens <ticket> [--json] [--write]` counts the tokens a ticket used. Counts only, no prices.

## What the reader counts

- Source: Claude Code transcripts (`~/.claude/projects/*/<session>.jsonl`, plus `<session>/subagents/agent-*.jsonl`).
- Five token classes per response: `input`, `output`, `cache_read`, `cache_write_5m`, `cache_write_1h`. When a line has no `cache_creation` split, all cache writes go to 5m and the record is marked `write_split: unknown`.
- Dedupe: one response = message id + request id. A repeated line keeps the highest `output` (streamed lines grow). Dedupe also runs across sessions of one ticket, because a resumed transcript replays earlier responses.
- Top-level `usage` counts are used. `usage.iterations` is ignored.
- Synthetic responses and non-assistant lines are skipped.

## Registry

`Registry` (types.ts) has `append(entry)` and `read(ticket)`. Default store: `~/.digismith-depot/token-registry/<ticket>.jsonl`; override the folder with `DIGISMITH_TOKEN_REGISTRY_DIR`. Where the registry finally lives belongs to DGS-220 (`backlog/telemetry-and-data-collection-plan.md`). Slice 1 only reads it; an empty registry works and sessions come from fallback tagging (custom title, first `gitBranch`, first `cwd` of each transcript), shown as `inferred`.

## tokens.json

`schema_version: 1`. `--write` puts it in `.digismith/board/<ticket>—<slug>/tokens.json` when run in DigiSmith's own repo, else in the depot as `<ticket>.tokens.json` next to the registry.

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

## Known limits

- Slice 2 is not built: skills and the SDD ledger do not write registry entries yet, so steps are `other` unless a registry exists.
- Live session id: the "newest transcript in the project folder" rule is unreliable (several live sessions share a folder). Slice 2 is blocked until a reliable source exists.
- Fallback tagging misses sessions whose branch, cwd and title do not carry the ticket key.
