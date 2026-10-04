# DGS-169 spike report: OpenCode as a persistent maestro in herdr (option B)

Worker `dgs-169-spike`, run 2026-10-04 21:4x–21:57 UTC+7 [14:4x–14:57Z], VPS `ubuntu-4gb-nbg1-2`, OpenCode 1.18.34.

## Result

**Yes, with limits.** An `opencode serve` process plus any number of `opencode attach` TUIs, driven entirely from outside through
`herdr agent start/prompt/pane read`, reproduces every mechanic option B needs: slash commands run as real commands, a new session's
id is readable from herdr's own JSON (no scraping needed), a headless `opencode run --attach` reaches a chosen session and shows up
live in an attached TUI, two clients share one session live without disturbing each other on exit, the session survives a client
exit and re-attaches with full history, and a note-based renewal works — but only if the renewal driver itself feeds the note's
content back in; `/new` truly wipes context, "Arise" alone recovers nothing. The one real limit is memory: this VPS has about 700–1100
MB available under normal load, each OpenCode process (server or TUI) costs 230–500 MB RSS, and the server's own RSS grew over the
run (369 MB → 501 MB after about ten turns) with no sign of being bounded.

## Q1 — Start

Commands: `herdr tab create --workspace wN ...` (new pane) → `herdr pane run <pane> 'export OPENCODE_SERVER_PASSWORD=...; opencode
serve --hostname 127.0.0.1 --port 4198'` → `herdr pane read <pane>` confirmed `opencode server listening on http://127.0.0.1:4198`.
Then `herdr agent start spike-maestro --kind opencode --pane <pane> -- attach http://localhost:4198` (password pre-exported in that
pane's shell via a prior `pane run`) returned immediately with `agent_status: idle`, `interactive_ready: true`.

**Verdict:** works. herdr detects an attached OpenCode TUI as a `kind: opencode` agent and reports `idle`/`working`/`done` correctly
(seen live across every later prompt). I did not separately force a `blocked` permission state — none of my test prompts needed a
tool permission the running config didn't already allow — so blocked-state detection for OpenCode specifically is untested, not
disproved.

## Q2 — Prompt in

`herdr agent prompt spike-maestro "Reply with the single word: pong." --wait --until done --timeout 30000` returned in 15.5s with
`agent_status: done`; the pane showed the reply ("pong", 13.6s model time) before the command returned.

**Verdict:** works. `--wait --until done` reliably waits for the full turn and returns only after it finishes.

## Q3 — Slash commands from outside

`herdr agent prompt spike-maestro "/compact" --wait` ran as a real TUI command: the pane showed a "Compaction" card and the
session's token count dropped from 8.1K to 751. `/new` and `/exit` (Q4, Q6) also ran as commands, not literal chat text.

**Verdict:** works, with one wrinkle: `--wait` on `/new` and `/exit` returns an error (`agent_prompt_stalled` or `agent_not_running`)
because those commands cause no working/blocked transition for `--wait` to catch — the command still executes correctly. A renewal
driver must not treat that error as failure.

## Q4 — A new session after `/new`

Before `/new`, `opencode session list` (same directory) and `GET /session` with basic auth both listed the current session
(`ses_ef89...WvK`, title "Pong") among several older ones from other directories — the session store is machine-wide, not scoped to
one working directory. `/new` alone created no new entry (OpenCode only persists a session once a message is sent). The next
`herdr agent prompt` call returned the **new session id directly in its own JSON** (`agent_session.value`) — that is the simplest way
an outside process learns the current id, no polling of `opencode session list` or the HTTP API required, though both work as a
cross-check. A headless `OPENCODE_SERVER_PASSWORD=... opencode run --attach http://localhost:4198 --session <new-id> "Arise"`
reached that session, and the pane TUI showed the exchange live within about a second.

**Verdict:** works. herdr's own prompt/start/list JSON is the id source; the HTTP API and `opencode session list` back it up.

## Q5 — Two clients

Cheap path first, per instruction: a short-lived `opencode run --attach ... --session <id> "<tiny prompt>"` while the pane TUI was
attached. First attempt used a stale session id left over from before Q7's `/new` — it silently wrote into the *old* session, which
`GET /session/<id>/message` confirmed, while the live pane (already moved to the new session) correctly showed nothing — a real trap:
**an outside driver must re-fetch the current session id after any `/new`, a cached id goes stale immediately.** Repeating the call
against the pane's actual current session worked: the pane TUI and `GET /session/<id>/message` showed the identical turn.

Then a second TUI (`spike-client2`, same session, a new pane, +235 MB RSS as predicted): a message sent from `spike-client2` appeared
live in `spike-maestro`'s pane (first attempt returned `agent_prompt_stalled` while the TUI was still finishing its replay — a retry
10s later worked). Exiting `spike-client2` with `/exit` did not disturb `spike-maestro`: a follow-up prompt to it still worked and the
session was unaffected.

**Verdict:** works. Both clients see the same session live; closing one is clean. The only hazard is id staleness after `/new`, not
the multi-client mechanic itself.

## Q6 — Restart

`herdr agent prompt spike-maestro "/exit" --wait` exited the TUI; herdr immediately dropped `spike-maestro` from `agent list`
(`agent_not_running` on the next prompt attempt) and the pane reverted to a bare shell prompt — but OpenCode's own exit screen
printed a ready resume command (`Session new-session-check` / `Continue  opencode -s ses_ef89...C2PG`). The server process
(a separate pane) was untouched and kept running. Re-attaching with `herdr agent start spike-maestro --kind opencode --pane <pane>
-- attach http://localhost:4198 --session <id>` worked, and the pane replayed the full prior history.

**Verdict:** works. The OpenCode session is durable on the server; herdr's agent registry entry is not (it disappears with the
process and must be re-created with `agent start`, not resumed in place).

## Q7 — Renewal from a note

Wrote `dummy-note.md` with a made-up word (`pineapple-937`). Told `spike-maestro` "Resume from <path>", sent `/new`, then sent
"Arise. What secret word were you told to remember?" alone: the model correctly said it had **no** memory of any secret word and
asked for the note to be pasted again — proof `/new` fully clears context; nothing carries forward automatically. Repeating with the
note's content folded into the same prompt ("Arise. Resume from this note: Secret word: pineapple-937. What secret word does it
say?") got back exactly `pineapple-937`, nothing else.

**Verdict:** works, but this is the one place the design in the backlog item needs to be precise: **"Arise" is not a magic word that
restores anything by itself.** Whatever drives renewal (a script, the Operator, `dg`) must read the note file and inject its content
into the prompt text it sends after `/new`. A bare "Arise" reaches an empty, compliant agent with zero memory.

## Q8 — Memory

| Point in the run | Available (MB) | Free (MB) | `opencode serve` RSS | `opencode attach` RSS |
|---|---|---|---|---|
| Baseline, nothing running | 1069 | 316 | — | — |
| Server alone | 839 | 141 | — (369 MB a moment later, with 1 TUI) | — |
| Server + 1 TUI (idle) | 775 | 136 | 369 MB | 235 MB |
| After ~6 turns (Q2–Q7) | 789 | 227 | 501 MB | 319 MB |
| After starting 2nd TUI | 535 (recovered to 644 after settling) | — | ~501 MB | 319 MB + ~235 MB (2nd) |
| After 2nd TUI exits | 837 | 439 | 501 MB | 318 MB |
| After full teardown | 1541 | 1132 | 0 | 0 |

This worker's own Claude process cost 326–370 MB RSS throughout, on top of the above.

**Verdict:** the single biggest risk to this plan. One server + one TUI already costs ~600 MB combined and climbs with turns (no
sign of a ceiling observed in ~10 turns). The VPS's steady-state available memory during this run ranged 650–1100 MB with other
workers active — a persistent maestro server plus one attached Operator would use most of that by itself, leaving little headroom
for a second attached client or for workers running alongside it. Swap was already 2.2–2.7 GB of 4 GB used throughout, independent
of this spike.

## Q9 — Skills (read-only)

`opencode agent list` lists permission-scoped *agents* (`build`, etc. — modes with their own tool-permission policy), not
Claude-style skills. `~/.config/opencode/opencode.json` has no skill-related key. `grep -ril skill ~/.config/opencode
~/.local/share/opencode` found only incidental hits in log/tool-output files, not a skill loader. Based on this read-only look,
OpenCode has no native mechanism to load the DigiSmith plugin's `SKILL.md` files or the Skill tool; the closest native concept
(`opencode agent`) is a different, permission-policy feature. I did not change any configuration to test further, per the brief.

**Verdict:** no evidence of skill support. Treat "the DigiSmith plugin doesn't come along" (named as a known cost in the backlog
item) as confirmed, not just assumed.

## Q10 — Deal-breakers

1. **Memory is the real constraint**, not any OpenCode/herdr mechanic (see Q8). A persistent server plus a persistent Operator attach
   is a standing ~600 MB+ cost on a machine that was OOM-killed once before (2026-09-29) and sits at 650–1100 MB available under
   ordinary load.
2. **Session-id staleness after `/new`** (Q5) is a sharp edge: any outside driver that caches a session id must refetch it after every
   renewal, or it silently writes into an orphaned session no one is watching.
3. **"Arise" carries nothing by itself** (Q7): the renewal driver, not the model, is responsible for reading and injecting the note.
4. **herdr's agent registry entry does not survive `/exit`** (Q6): a supervisor must `agent start` again with the right `--session`,
   not expect the named agent to still exist to resume.
5. Found in passing, not part of this spike: DGS-180's worker left a note that `dg depot`'s process lifecycle is Windows-only and
   blocks `dg` from starting an OpenCode server on this Linux VPS (DGS-181) — relevant to whoever builds the `dg` start/stop/renew
   commands for this shape, since they'd currently fail the same way.

None of these are a stop on the mechanic itself; all are design constraints the build (DGS-169) needs to account for.

## Recommended shape

- One `opencode serve` per maestro project (matches the existing Sol-reviewer pattern), `127.0.0.1` only, a generated
  `OPENCODE_SERVER_PASSWORD`, never printed, read from a root-only file by whatever starts it.
- The Operator (human or script) attaches with `opencode attach`; a second Observer/Operator attaches the same way when needed —
  proven cheap to add and remove without disturbing the first.
- Renewal: a script (not a bare "Arise") that (a) sends `/new`, ignoring the expected `agent_prompt_stalled`, (b) reads the resume
  note, (c) sends one prompt containing the note's content, and (d) re-learns the session id from that prompt's own herdr response
  before doing anything else with it.
- Re-registration after any exit: `herdr agent start <name> --kind opencode --pane <pane> -- attach <url> --session <id>`, not a
  bespoke resume path — OpenCode's own `--session`/`--continue` already does the job.
- Before this goes further than a pilot: measure the server's RSS ceiling over a longer run (this spike only ran ~10 turns across
  ~12 minutes), and decide a memory budget per maestro before letting more than one run at a time on this VPS.

## Deal-breakers for Jack to weigh in on

None stopped the spike. The memory ceiling (Q8/Q10.1) is the one item that could still kill the plan at scale and needs a real
number, not an estimate from a 12-minute run.
