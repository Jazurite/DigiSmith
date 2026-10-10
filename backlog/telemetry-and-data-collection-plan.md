# Telemetry and data collection: one plan for what DigiSmith records, where it is stored, and who collects it

**Status:** Idea, Jack (2026-10-10 ~12:0x UTC+7 [05:0xZ]). ClickUp: **DGS-220** (Imperium, the roadmap list, task id `14zcebrvckg`).
An **epic** under the Imperium rule (DGS-215): its tickets stay in their clan lists and link to it; DGS-214 (B.3) is the first. No design yet.

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
- **One record shape.** Common keys for every record: ticket, session id, agent, seat, model, time. Each source adds its own fields.
- **Collection points.** Which lifecycle points write records (ticket start in `init`, subagent dispatch, the finish, a limit stop, a reboot), and
  whether hooks or skills do it. The telemetry marker is already a start point.
- **Who collects.** A worker, a hook or a standing pane; not the maestro, which only gives orders.
- **Privacy and retention.** Token counts and ids can be kept for a long time. Transcript text is sensitive (client code for Emma); decide what is
  copied, what is only counted, and when raw files are deleted.
- **Readers.** The DGS-214 report, the DGS-204 comparison, the account balancer, a usage page, and living history (DGS-187).
- **Migration.** How DGS-214's interim `tokens.json` and the telemetry skill's copies move into the new store.

## Related

DGS-214 ([count-tokens-per-ticket.md](count-tokens-per-ticket.md)), DGS-204 ([token-economics-b3.md](token-economics-b3.md)),
[usage-monitoring-client.md](usage-monitoring-client.md), [telemetry-auto-lifecycle.md](telemetry-auto-lifecycle.md),
DGS-168 ([shipped-product-telemetry.md](shipped-product-telemetry.md)), DGS-187 ([living-history.md](living-history.md)).
