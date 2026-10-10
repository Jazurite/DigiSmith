# Telemetry and data collection: one plan for what DigiSmith records, where it is stored, and who collects it

**Status:** Idea, Jack (2026-10-10 ~12:0x UTC+7 [05:0xZ]). ClickUp: **DGS-220** (task id `14zcebrvckg`; list **G.0: Pavilion** of clan `G: TBD` since 2026-10-10 ~16:5x UTC+7, Jack: "move it to the G clan";
before that Imperium). It is clan G's plan for data collection. Tickets in other clans keep their own part and link to it (Jack's cross-clan rule,
DGS-215): DGS-214 (B.3) counts the tokens; **DGS-238** (G.0) ingests, analyses and shows the counts. No design yet.

**Source:** Live session 2026-10-10, during the DGS-214 brainstorm. The worker's Question 2 asked when token counts are collected and where they
are stored. Jack: "I think we need a new plan to handle the telemetry and data collection." He chose a separate ticket in Town Hall (renamed Imperium
the same morning, DGS-215), because the plan spans clans, and DGS-214 goes on with a small interim store (a `dg tokens <ticket>` command plus a `tokens.json` snapshot in the board folder)
that moves into this plan's store later.

## The problem

Several pieces collect data about DigiSmith's own work, each in its own place and its own shape:

| Data | Today | Where | Ticket or item |
|---|---|---|---|
| Ticket session transcripts (process record) | `digismith:telemetry` (map item P): `bootstrap`/`adopt` write `.digismith/telemetry-marker` when the profile has `logging: true`; at the finish the skill copies the transcript from that point into the repo | the repo | [telemetry-auto-lifecycle.md](telemetry-auto-lifecycle.md) (start and stop automatically, deferred) |
| Token counts per ticket | Being designed: registry written by `init` and the finish, transcript tagging as fallback, `dg tokens` | interim `tokens.json` in the board folder | DGS-214 |
| Prices per model and channel | Hardcoded tables in `scripts/token-counter/` (out of date) | the repo | DGS-204 |
| Seat usage (5h and weekly percent) | The usage probe, read by hand | `~/.digismith-depot/usage-probe/out*.json` | [usage-monitoring-client.md](usage-monitoring-client.md) (C.3, no ticket) |
| Which worker runs on which seat | Written by hand in the runbook tables | `.digismith/sessions/workbox.md` | DGS-144, DGS-151 |
| OpenCode and TokenReply usage | Not collected | OpenCode's session store, TokenReply's request log | DGS-214 phase 2 |
| The deployed product's behavior | Out of scope here | | DGS-168 (D.1) |

## What the plan must decide

- **One store or several.** A file layout under `~/.digismith-depot/`, files in the repo, a small database, or ClickUp. What is per machine, what is
  shared, and what is committed.
- **The session registry (DGS-214's Question 4, handed here by Jack, 2026-10-10 ~12:1x UTC+7).** DGS-214 needs a registry: one line per ticket,
  session id, role (worker, subagent, reviewer, maestro) and start time. Jack: "we will have multiple registries right now ... I don't know if we
  should have a global registry ... the global registry, we will need to record it, so we will have the registry by month, by year ... that's why I
  said we still need brainstorming." Options on the table: one file per ticket in the depot (`~/.digismith-depot/token-registry/<ticket>.jsonl`,
  the worker's pick), one file per ticket in the board folder, or one global registry split by month and year. DGS-214 designs the registry behind
  a small read and write interface and leaves the location to this plan.
- **One record shape.** Common keys for every record: ticket, session id, agent, seat, model, time. Each source adds its own fields.
- **Collection points.** Which lifecycle points write records (ticket start in `init`, subagent dispatch, the finish, a limit stop, a reboot), and
  whether hooks or skills do it. The telemetry marker is already a start point.
- **Who collects.** A worker, a hook or a standing pane; not the maestro, which only gives orders.
- **Privacy and retention.** Token counts and ids can be kept for a long time. Transcript text is sensitive (client code for Emma); decide what is
  copied, what is only counted, and when raw files are deleted.
- **Readers.** The DGS-214 report, the DGS-204 comparison, the account balancer, a usage page, and living history (DGS-187).
- **Migration.** How DGS-214's interim `tokens.json` and the telemetry skill's copies move into the new store.

## Jack's direction after DGS-214 shipped (2026-10-10 ~20:3x UTC+7)

DGS-214 is done (both slices merged, 0.91.0-beta): `dg tokens` counts a ticket at about 78.3 million tokens, 97.6% of them cache reads. Jack: "this is a
great first step. We still need to enrich the data more and add more columns and fields ... and we need to figure out a place for us to store all of
this data for Grafana or another chart tool."

**Enrichment: fields to consider** (a candidate list for the brainstorm, not a decision):

- *Where the work sits:* project and repo, epic, ticket, step, task, role (worker, maestro, reviewer, subagent), agent name, session and parent session,
  subagent id and type.
- *Who paid:* seat or account (`jack`, `dev0`), channel (subscription seat, TokenReply and its group, direct API), harness (Claude Code, OpenCode,
  Codex), machine.
- *How it ran:* model, effort level, thinking, speed (fast mode), service tier, refusal fallbacks, tool calls and their names.
- *Time:* the timestamp of each response, the duration of each step and task, wall clock against active time.
- *Outcome:* commits, lines changed, tests run and passed, review findings, fix rounds, merged or not.
- *Seat side:* 5-hour and weekly percent before and after (the usage probe).
- Dollars stay out of the store: the separate Analysis plan computes them from counts and a dated price table (DGS-214 Q5, DGS-204).

**A store that Grafana or another chart tool can read.** Options to weigh:

- SQLite file in the depot plus Grafana's SQLite data source: one file, no server; Grafana runs on the Workbox or Jack's PC.
- PostgreSQL (or TimescaleDB): a server to run; strong SQL; the usual Grafana pairing.
- Prometheus or a push gateway: built for metrics, poor for per-ticket events.
- ClickHouse or DuckDB: fast analytics over many events; DuckDB is a file, like SQLite.
- Keep JSONL files and point Grafana's Infinity data source at them: no migration, weak queries.

Open: where Grafana itself runs (the Mac Workbox, Jack's PC, Grafana Cloud's free tier), who writes rows (`entry.ts` at the finish, or a collector),
and whether the store is a Depot runtime service (D.1, like the OpenCode server and the Agentic Bridge).

## Related

DGS-214 ([count-tokens-per-ticket.md](count-tokens-per-ticket.md)), DGS-204 ([token-economics-b3.md](token-economics-b3.md)),
[usage-monitoring-client.md](usage-monitoring-client.md), [telemetry-auto-lifecycle.md](telemetry-auto-lifecycle.md),
DGS-168 ([shipped-product-telemetry.md](shipped-product-telemetry.md)), DGS-187 ([living-history.md](living-history.md)).
