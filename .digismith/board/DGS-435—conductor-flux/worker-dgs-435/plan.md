# DGS-435 plan: conductor flux (checkpoint 1)

2026-10-13, worker `dgs-435`, branch `dgs-435` in `.worktrees/dgs-435`. Nothing is built yet. Nothing here touches a real conductor.

## 1. Shape
- `scripts/conductor/flux.ts`: the JOB MODULE. `fluxConductor(target, opts, deps): Promise<FluxResult>` and `fluxAll(targets, opts, deps)`. All I/O goes through `deps` (herdr, clock, file reads, card list, log append). No global state, no `process.exit`. The Nexus scheduler calls the same functions.
- `scripts/conductor/flux-cli.ts`, wired as `cli.ts flux` and `dg conductor flux <agent> | --all [--dry-run]`.
- `scripts/conductor/flux-targets.ts`: the target list (section 2).
- Tests next to each file (vitest, fakes only).

## 2. Targets: per conductor, not only conductors.json (your fact 1, 2)
`FluxTarget = { agent, project, brief, note, wake?, idleHours? }`. Source of the list, in order:
1. `~/.digismith-depot/flux-targets.json` (new, small, `{ "<agent>": { brief, note, wake? } }`), the one list the scheduler will also read.
2. Flags on one run: `--brief <path> --note <path> [--wake <text>]` override the file for a single named agent.
3. For an agent in neither: `conductors.json` gives the note (existing `resolveNotePath`), the brief is `.digismith/sessions/<agent>/brief.md`; if the file is missing the target is skipped with reason `no brief`.
Tonight's target, `token-economics-conductor`, goes into `flux-targets.json` with brief `.digismith/sessions/b3-maestro/brief.md`, note `.digismith/sessions/b3-maestro/note.md`, and the custom wake text. Jack/Scheduling Maestro confirm the file entry; I do not write the depot file for a real run (only a documented example and a test).

**Wake prompt.** Per-target `wake` field. Generic default (placeholders filled from the target):
> You were renewed with a clear. Read your brief `<brief>` and your state note `<note>`. Continue your standing order. Start no new work unless the note says so. Then wait. Reply in at most 6 lines.

Token-economics override: `read the brief's Current (2026-10-13) section first, then the note's newest section, then wait; reply in at most 6 lines; read no worker pane`. The module prepends the two paths if the custom text does not contain them (a wake that names nothing is refused: `wake_missing_paths`). Wake text goes on ONE line (herdr prompt is one submitted line).

## 3. Entry rules and the checks (each skip carries a reason code)
Order matters; the first failure ends the run for that conductor. `--dry-run` runs every check, prints the plan (agent, pane, brief, note, session id, size, the exact two prompts it WOULD send) and calls no send.

| # | Check | Evidence and how it is read | Skip reason |
|---|---|---|---|
| 0 | Night window | One constant `NIGHT_WINDOW = { startHm: "23:30", endHm: "02:00", utcOffsetHours: 7 }` in `flux.ts` (wraps midnight). Clock from `deps.now`. No flag, no env override. `--dry-run` skips ONLY this check (reports `night: outside window (would skip)`). | `outside_night_window` |
| 1 | Agent exists, one pane | `herdr-ws agent list` filtered by `name == agent` (JSON: `agent_status`, `agent_session.value`, `pane_id`, `tab_id`). 0 or 2+ matches = skip. | `agent_not_found`, `agent_ambiguous` |
| 2 | Status idle/done (your fact 3) | `agent_status` must be `idle` or `done` (herdr's states: idle, working, blocked, done, unknown). `working`/`blocked`/`unknown` = skip. | `status_<value>` |
| 3 | Input box empty (your fact 3) | `herdr-ws pane read <pane> --format ansi`; take the input box lines (between the two rule lines of the Claude TUI, the `> ` row). Text is "typed" when it has non-whitespace characters outside SGR dim (`ESC[2m ... ESC[22m`/`ESC[0m`) runs. Dim = suggestion, normal = typed. If the box cannot be found: skip (never guess). | `input_typed`, `input_box_unreadable` |
| 4 | No worker of this conductor running | (a) Cards: `listCards(project, {scope:"open"})` with `role == "worker"` and `under == <conductor card id>`; any open card = running. (b) herdr: any agent in the list whose card/name matches a worker of this conductor and is `working`/`blocked`. (c) The note's Running block (`parseStateBody().running`) must be empty. Any one positive = skip. For the old-folder note (b3) without a state block, (c) is "no block found" = skip `note_no_state_block`, never "assume empty". | `worker_running:<name>`, `note_running_rows`, `note_no_state_block` |
| 5 | Nothing in flight | The note's Waiting-for-Jack block empty (checkpoint/review/merge waits are rows there); no `Running` rows; plus (your fact 3) the newest note section is not newer than the last handoff while naming a ticket in flight: find the last `## Session end ...` heading (the DGS-418 hook's handoff block, `card-hook.ts:107`), take every `## ` section after it, and if any names `DGS-\d+` with a word from {plan, build, review, merge, checkpoint, in flight, waiting} and no "done/merged/parked" marker on that line = skip. When the note has no handoff heading at all, the whole note counts as newer. | `note_ticket_in_flight:<DGS-n>`, `note_waiting_rows` |
| 6 | Note written after last work | note mtime (and the block's `Updated:`, whichever is later) must be later than the conductor's last work: the transcript file mtime (`~/.claude/projects/<cwd-slug>/<session>.jsonl`) minus 2 min grace, and the card's `last_seen`. A note older than the transcript = skip (the conductor worked after writing it). | `note_stale` |
| 7 | Transcript readable | Needed for the size (section 4). Missing = skip. | `no_transcript` |

## 4. Context size (no model call)
Read the last JSONL line of type `assistant` that has `message.usage` and is not `isSidechain`; size = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (checked on the real file for the digismith-conductor, shape confirmed read-only: 2 + 206343 + 348). Read the tail only (last 256 KB). Before = from the old session's transcript. After = from the new session's transcript once it has its first assistant reply (the wake reply). A missing `after` is reported `null`, not an error.

## 5. `/clear` vs `/new` (what I found; the real test is first use)
- Claude Code: `/clear` starts a new conversation with a new session id and a new transcript file in the same process (DGS-214 `session-id-source.md`, case 6, tested on 2.1.296 in a scratch tab). `/new` is OpenCode's word (the DGS-169 spike); I do not use it for Claude. Hooks fire: SessionEnd (reason `clear`) closes the old card and appends a handoff block to the card's `state` note (`card-hook.ts` endHook); SessionStart (source `clear`) writes a new card for the new id (`startHook`, starter env DIGISMITH_* is inherited by the process).
- herdr `agent prompt <t> "/clear" --wait`: per its help, `--wait` needs a `working` or `blocked` state within 5000 ms else `agent_prompt_stalled`. A clear may never show `working` (DGS-169 saw `agent_prompt_stalled` on `/new` and `agent_not_running`). So: send `/clear` WITHOUT `--wait`, then my own poll (below). A stalled/timeout error from the send itself is not trusted either way; only the observed session id counts.
- **Poll after the clear** (every 2 s, 60 s cap): `agent get` until `agent_session.value` differs from the old id AND `agent_status` is idle/done. Not changed in 60 s = `fail: clear_not_observed`, no wake sent, the run reports it loudly (the one case where a human must look).
- Wake: `agent prompt <t> "<wake>" --wait --until idle --until done --timeout 180000`. Same stall rule: if herdr returns `agent_prompt_stalled` I do not retry the send (a retry could double-submit); I poll status instead and judge by the verify step.
- Open question for you/Scheduling Maestro: the real first use will show whether `/clear` through `agent prompt` lands as a command (the ticket says it is not tested). The plan handles the three outcomes (changed id; no change; changed id but no reply) with distinct results.

## 6. Verify (step 5)
After the wake reply: (a) new session id != old; (b) status idle/done; (c) a NEW open card exists for the new id with the same `id`/`state` (old card has status `closed`, via `findCardBySession` for both); (d) the card's `state` equals the target's note path (still pointing at the right note); (e) the wake text got a reply (new transcript has an assistant entry) so the conductor "read its note". Any false = result `fluxed: false, verify_failed: [...]` and a `needs_attention: true` flag (DGS-434's push notification hook).
**Token registry (DGS-214):** it is keyed by TICKET (`session` lines need `ticket`, `session_id`, `role`; `registry.ts:18`). A conductor session has no ticket, so there is nothing to re-key; the new id is picked up by the next `entry.ts session` call of whatever ticket the conductor works. The flux therefore writes nothing to the registry. The old-id -> new-id mapping goes in the run log. (If you want a registry line anyway, say so; it is one append.)

## 7. Report: run log (proposal for DGS-434)
File: `~/.digismith-depot/runs/<job>/<YYYY-MM-DD>.jsonl`, one JSON object per line, append-only, never deleted by the job (job is `conductor-flux`; DGS-439 owns cleanup). The module only appends; it never rewrites.
```
{"v":1,"job":"conductor-flux","run_id":"<iso7>-<n>","ts":"2026-10-14T00:05:12+07:00","ts_utc":"2026-10-13T17:05:12Z",
 "agent":"token-economics-conductor","dry_run":false,"result":"fluxed"|"skipped"|"failed",
 "reason":null|"<code>","needs_attention":false,
 "tokens_before":108400,"tokens_after":9100,"session_old":"<id>","session_new":"<id>",
 "checks":{"night":"ok","status":"idle",...},"duration_s":41}
```
`--all` adds a first line `{"v":1,"job":"conductor-flux","event":"targets",...}` listing the targets. Dry runs log nothing unless `--log` is passed (a dry run writes no file by default: it is read-only).

## 8. Hard limits, built in
- **Never closes tabs, panes, workspaces, or any agent** (your fact 4). The module's herdr dependency is a closed interface: `list()`, `get(agent)`, `readInput(pane)`, `sendPrompt(agent, text, opts)`. No other herdr verb exists in it; a test asserts the real wrapper builds only `agent list|get`, `pane read`, `agent prompt`.
- Real herdr only via `/Users/workbox/.digismith-depot/bin/herdr-ws` with `HERDR_WS=w2`; a runner guard (like `readOnlyRunner` in `runner.ts`) rejects every other command and every herdr verb outside that set. In `--dry-run`, the guard is built WITHOUT `prompt`: a test asserts a dry run with a recording fake performs zero `prompt` calls, and the dry-run wrapper throws if one is attempted.
- Never targets `digismith-conductor` (the sender) or an active Maestro unless the agent name is given explicitly; `--all` never includes them (the list file has no such entry; targets whose card `role` is `maestro`, or whose name is `digismith-conductor`, are dropped from `--all` and refused for a named run unless `--agent` given and role is conductor). `--all --dry-run` prints the target list first; a real `--all` first line of output is the same list.
- Night rule has no override; no daytime path. Sending to a pane is never done by tests.
- No `rm`/unlink anywhere in the module.

## 9. Tests (TDD, all fakes, vitest; fake clock, temp dirs, fake herdr recording calls, fake card dir via `DIGISMITH_DEPOT`)
1. night window: 23:29 skip, 23:30 ok, 01:59 ok, 02:00 skip, wrap over midnight, fake clock at UTC+7 vs UTC.
2. dry-run: all checks run, outcome has the plan, fake herdr records ZERO prompt calls; outside window it still reports.
3. each skip reason above with a fixture (status working/blocked; typed text vs dim suggestion in ansi; worker card open; Running rows; Waiting rows; ticket in flight after last handoff; note older than transcript; no transcript; no brief; agent missing/ambiguous).
4. context size: last usage picked, sidechain ignored, tail-only reading, missing usage = skip.
5. happy path: `/clear` sent without `--wait`; id change polled; wake sent with brief + note paths, per-target wake text, default text; result fields; run log line.
6. failure paths: id unchanged after 60 s (fake clock) = no wake sent; send returns `agent_prompt_stalled` on clear but id changed = continue; wake stalls = no resend; verify fails = `needs_attention`.
7. no-close: the herdr interface has no close verb; the wrapper runner rejects `tab close`, `pane close`, `agent` anything but the allowed.
8. `--all`: target listing first, excludes digismith-conductor and maestros; one conductor's failure does not stop the next.
9. CLI: flag parsing, exit codes (0 fluxed/skipped, 2 failed/needs_attention), `--dry-run`.
10. A real-file read-only sanity test is NOT in the suite (no real herdr in tests).

## 10. Nexus later (DGS-457)
`fluxConductor`/`fluxAll` take plain data and return plain data. The server wraps them: `POST /jobs/conductor-flux/run` with body `{ "agents": ["..."]|"all", "dryRun": bool }` runs `fluxAll` inside the Nexus process with real deps (same wrapper, same depot paths) and returns the array of results (the same objects the CLI prints). Then `dg conductor flux` becomes a thin client that POSTs the body and prints the response, and the scheduler (DGS-456) POSTs the same endpoint at 23:30. The night rule stays in the module, so a wrong cron entry cannot flux by day.

## 11. Order of work
1 pure helpers (night window, usage reader, ansi input parser, note/handoff scanner) with tests; 2 targets file; 3 `fluxConductor` with fake deps; 4 CLI wiring; 5 herdr runner guard; 6 `pnpm test`, `pnpm --filter @digismith/cli build`; 7 independent whole-branch review, fixes; 8 report.md/report.html/plan.md committed by named paths; STOP for "go: merge".

## 12. Questions for checkpoint 1 (answer or I use the default)
1. Night window 23:30 to 02:00 UTC+7: OK? (default yes)
2. Registry: write nothing (conductors have no ticket)? (default yes)
3. Run log path `~/.digismith-depot/runs/conductor-flux/<date>.jsonl`: OK for DGS-434? (default yes)
4. `--dry-run` against the real conductors, read-only, after your OK only: I will ask once the build is merged-ready, not before.

## Changes made while building (after checkpoint 1)
- A conductor with no open card, or a note with no state block, is NOT skipped (the plan said skip): token-economics-conductor has neither. Evidence then is the herdr status, the input box, the note text scan, the note-after-last-work check, and the `workers` list of its `flux-targets.json` entry. Card checks read `n/a`.
- Review fixes: colour codes no longer read as dim; log write failure never hides a flux; a wake starting with `-` gets a prefix; empty session id refused; a last status + input look right before `/clear` (`changed_before_clear`); one bad `agent get` reply is not fatal; `--all` refuses per-agent flags.
