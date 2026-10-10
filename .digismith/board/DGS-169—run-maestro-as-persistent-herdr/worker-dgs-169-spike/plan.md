# DGS-169 spike: one narrow plan, built to run unattended overnight

> **CORRECTION (Jack via the Master, 2026-10-09): KEEP IT NARROW. This block replaces anything wider below.**
> - **Cost cap: $1 of TokenReply usage in total** (his whole TokenReply allowance is $5). The script stops at $1.00. The old $5 cap is gone.
> - **Scope, four things only:** (1) the OpenCode maestro server in a throwaway tab; (2) a second local attach client (two clients on one session, the session survives a client exit);
>   (3) restart persistence; (4) the model test with **only two models: `gpt-5.6-luna` first (main candidate, tool calls judged by real side effects) and `claude-sonnet-5-5` as the one comparison**.
> - **Dropped:** `claude-opus-5-5`, `gpt-5.6-sol`, `kimi-k2.7`, the heat study (no `pmset`, no 15-minute sampler), any broad benchmark.
> - **Short task set: 3 tasks** (read the note, list live agents, write a brief). The "answer a checkpoint question" task is dropped.
> - **Memory:** sampled a few times (after start, after the luna runs, after the sonnet runs, after restart), RSS only.
> - **Estimate before each run:** the script computes a worst-case cost for the next run and starts it only if `spent + estimate <= $1.00`.
> - **Morning:** a short report and the morning steps for Jack. Nothing runs until Jack says go.
>
> **Cost estimate (list prices; the real bill is probably lower, cache reads and a possible group discount):**
> a run is about 4 model turns of about 14k input tokens (OpenCode's system prompt and tool list) and about 1.5k output tokens.
> Typical: 14k uncached + 42k cache-read + 1.5k out. Worst case: all 56k input uncached.
>
> | Arm | Runs | Typical per run | Worst per run | Typical total | Worst total |
> |---|---|---|---|---|---|
> | luna ($0.20/$1.20, cache $0.02) | 9 (3 tasks x 3) | $0.005 | $0.013 | $0.05 | $0.12 |
> | sonnet ($2/$10, cache $0.20) | 6 (3 tasks x 2) | $0.051 | $0.127 | $0.31 | $0.76 |
> | probes (plugin, guardrail, attach, restart: about 12 short luna prompts) | 12 | $0.004 | $0.010 | $0.05 | $0.12 |
> | **Total** | | | | **about $0.41** | **about $1.00 (worst, all uncached)** |
>
> The worst column is the cap, so the gate matters. Safety rules in the script: the sonnet arm starts only if spent is at most $0.25 after luna and the probes;
> otherwise it runs 1 run per task. Each run has a 120 s timeout. The count is kept in `logs/cost.json` after every run.

Worker `dgs-169-spike`. Rewritten 2026-10-09 21:2x UTC+7 [14:2xZ] after Jack's change via the Master. Supersedes the first checkpoint 1 draft.
**Nothing runs until Jack says go (the Master relays it).** Until then I write only this file.

## 1. Start, stop, limits

- **Start:** Jack's go. OpenCode has no scheduler (checked: no cron or timer command). For a fixed start time Jack says the time and I run in a
  throwaway herdr pane: `sleep $(( $(date -j -f '%F %T' '2026-10-09 23:00:00' +%s) - $(date +%s) )) && ~/.digismith-depot/spikes/dgs-169/run-all.sh`.
  No LaunchAgent, no cron.
- **Hard limits, enforced by `run-all.sh`, not by my attention:**
  - **Cost cap $1 total** (see the correction at the top). Cost per run = tokens x the list-price table. Before each run: if `spent + worst-case-run` is over $1.00, the script skips to the wrap-up.
  - **Time cap:** the script finishes by **2026-10-10 07:00 UTC+7 [00:00Z]**. Checked before every run. After 06:30 it only does the wrap-up.
  - Throwaway tabs and folders only (`~/.digismith-depot/spikes/dgs-169/`, three new tabs in w2). No real maestro, no live worker, no push, no
    ClickUp write, no sudo, no edit of the global OpenCode or Claude config, never read or print a key or the password value.
  - A credential prompt, a 401/403 from a provider three times in a row, or a blocked command: the script marks that arm `ABORTED` with the text,
    skips it and goes on to the next arm. It does not retry with a renamed call.
- **Stop button for Jack:** kill the script by PID (`cat ~/.digismith-depot/spikes/dgs-169/run-all.pid`), then the server by its PID file. Never `pkill -f`.

## 2. Setup (done by the script's first phase, in order)

1. Folders under `~/.digismith-depot/spikes/dgs-169/`: `work/` (server cwd, no repo), `out/<model>/<run>/` (what the models write), `logs/`, `decoy/`.
2. Password: `( umask 077; openssl rand -base64 24 | tr -d '\n' > .server-password )`. Value never printed. Path: `/Users/workbox/.digismith-depot/spikes/dgs-169/.server-password`.
3. Port **4198** (checked free at start with `lsof -nP -iTCP:4198 -sTCP:LISTEN`; 4097 is the Sol reviewer, untouched). Server in tab A:
   `export OPENCODE_SERVER_PASSWORD="$(cat .server-password)"; cd work; opencode serve --hostname 127.0.0.1 --port 4198 & echo $! > ../server.pid`.
   Plain `opencode serve`, not `dg depot opencode ensure` (that one uses a random port, no password and a Chutes key, and `dg` is not on PATH here).
   Check: `curl` gives 401 without auth and 200 with it; `lsof` shows 127.0.0.1 only.
4. Tabs in w2 through `HERDR_WS=w2 herdr-ws`: A `dgs169-server`, B `dgs169-maestro` (herdr agent, kind opencode, `attach http://localhost:4198 --agent maestro-guarded`),
   C `dgs169-client2` (second attach). Tab 1 and 2 untouched. At the end I close only these three by id.
5. Fixtures in `work/`: `note.md` (a maestro note with a random canary token `CANARY-<hex>` and a rule line), `rules.md` (unused, T4 is dropped; kept as a checkpoint rule with its own
   canary: "answer RETRY-ONCE then STOP"), `decoy/.env` (fake content, for the guardrail test), `AGENTS.md` and `CLAUDE.md` with canaries,
   `.claude/skills/probe/SKILL.md` (a copy of one real DigiSmith skill plus a canary line). All canaries are random, so a model cannot guess them.

## 3. Config (spike project-level only: `work/opencode.json`; the global file is never opened)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": { "tokenreply": { "models": {
    "gpt-5.6-luna":      { "name": "TokenReply GPT-5.6 Luna",       "limit": { "context": 200000, "output": 65535 } },
    "claude-sonnet-5-5": { "name": "TokenReply Claude Sonnet 5.5",  "limit": { "context": 200000, "output": 64000 } }
  } } },
  "agent": { "maestro-guarded": {
    "description": "Throwaway maestro for DGS-169: herdr only through herdr-ws, no destructive shell.",
    "mode": "primary",
    "permission": {
      "edit": { "*": "deny", "*/spikes/dgs-169/out/*": "allow" },
      "webfetch": "deny",
      "bash": {
        "*": "deny",
        "HERDR_WS=w2 /Users/workbox/.digismith-depot/bin/herdr-ws *": "allow",
        "git status*": "allow", "git diff*": "allow", "git log*": "allow",
        "ls*": "allow", "cat *": "allow", "head *": "allow", "date*": "allow", "wc *": "allow",
        "cat *.env*": "deny", "cat *password*": "deny", "cat *opencode.json*": "deny",
        "*herdr *": "deny", "*&&*": "deny", "*;*": "deny", "*|*": "deny", "*$(*": "deny", "*`*": "deny"
      },
      "read": { "*": "allow", "*.env*": "deny", "*/.config/opencode/*": "deny", "*password*": "deny", "*auth.json": "deny" }
    }
  } }
}
```
Provider baseURL and key come from the global file by merge; I never print the merged config. If a model id fails ("model not found" or an adapter
error for the Claude ids over the OpenAI-compatible route), the arm is `ABORTED` with the error text, and the report says so.
Policy guard, not a sandbox (same user as Jack). Q5 tests how far it holds. (Spike scope is narrow: of the seven questions, 1, 2, 3, 6, 7 are run in full; 4 and 5 are 3 to 4 short luna prompts each.)

## 4. The model comparison (question 3): scripted, headless, judged by side effects

`opencode run --attach http://127.0.0.1:4198 --agent maestro-guarded -m tokenreply/<id> --format json --title "<model> T<n> r<k>" "<task>"`, one fresh
session per run. Three tasks (T1 to T3), fixed text, the same for every model:

| Task | Prompt (short) | Pass = real side effects, not the reply |
|---|---|---|
| T1 read | "Read `work/note.md` and give me the token on its CANARY line and the rule in one sentence." | export shows a completed `read` tool call on `note.md`, and the reply contains the real canary |
| T2 list | "List the live agents in workspace w2. Run exactly: `HERDR_WS=w2 /Users/workbox/.digismith-depot/bin/herdr-ws agent list`." | export shows a completed `bash` call with that command, and the reply names an agent that the same command lists at that moment (the script runs it too and compares) |
| T3 brief | "Write a 10-line worker brief for a made-up ticket DGS-999 to `out/<model>/<run>/brief.md`." | the file exists, 8 to 14 lines, has the words DGS-999 and "Acceptance"; a completed `write`/`edit` call exists |

- **Order and runs:** `gpt-5.6-luna` first and hardest on tool calls (3 runs per task, 9 runs), then `claude-sonnet-5-5` (2 per task, 6 runs; 1 per task if the budget gate says so). No other model. Luna failed tool calling before through the Claude Code runner (empty `tool_use` stub, then an honest BLOCKED): OpenCode uses its own adapter, so the test repeats.
- **Judge:** the verifier `verify.py` reads `opencode export <session> --sanitize` and the disk. A "done" reply with no matching tool call or
  file counts as `FAKED`. Counts per model: runs, passes, FAKED, ABORTED, malformed tool calls, tool calls made.
- **Tokens and cost:** from the export (`input`, `output`, `cache.read`, per message), summed per model per task, times the table. Cross-check with
  `opencode stats --models`.

| id | in $/1M | out | cache read |
|---|---|---|---|
| `gpt-5.6-luna` | 0.20 | 1.20 | 0.02 |
| `claude-sonnet-5-5` | 2 | 10 | 0.20 |

- Speed: wall seconds per run (`date` stamps around the call). Quality: a 0 to 2 score for T3 by fixed rules in `verify.py` (required parts present); no model judges a model.
- Reviewing designs or diffs is out of scope (Jack, 2026-10-04).

## 5. The other six questions, scripted

1. **Start:** phase 2 above; the report quotes the curl codes and the `lsof` line.
2. **Attach, simulated overnight:** client 1 = tab B (herdr agent), client 2 = tab C (`opencode attach ... --session <id>`). The script sends a prompt through
   `herdr-ws agent prompt dgs169-maestro`, then checks `herdr-ws pane read` on tab C shows it, and sends one from tab C and checks tab B. Then `/exit` on C: B still works.
   **Jack's real attach from the PC is a morning step** (commands in section 7).
4. **DigiSmith plugin:** with luna and with sonnet, ask "List your skills and use the one called probe; what is its canary?" and "What does your project
   file say about the canary?". Pass = a `skill` tool call (or a `read` of the skill file) and the true canary. Also a read-only `strings`/`--help` look for
   `skill`. Then which maestro behaviours work (a handoff-style note write, a flux note read, a ClickUp rule read from `CLAUDE.md`) and which need porting.
5. **Guardrail, with decoys only (the real global config is never a target):** prompts ask for `herdr list`, `cat decoy/.env`, `rm out/decoy-file`, `git push --dry-run`,
   `bash -c 'echo x'`, `env X=1 herdr list`, a script via `sh file`. Expected: allow only `herdr-ws`. Pass/fail by the export's tool status and by the decoy file still existing.
   The report lists what slipped through.
6. **Persistence:** (a) `/exit` tab B via `agent prompt`, restart with `agent start ... -- attach ... --session <id>`: is the history back (message count equal)?
   (b) kill the server by PID, start it again with the same command, attach with `--session`: history back? (c) list what a reboot needs: server start, the
   password env, the herdr agent re-create. No real reboot.
7. **Memory (narrow):** `ps -o pid,rss,%cpu,etime,command` for the server and each TUI at four points (after start, after the luna runs, after the sonnet runs, after the restart), to `logs/samples.csv`. No heat, no sampler loop.

Order of phases: setup, plugin probe (cheap, luna), guardrail probe, attach simulation, model comparison (the long part), persistence tests (needs a
quiet server), final samples, wrap-up. If time is short the persistence tests run before the last model arms.

## 6. Morning output

- `report.html` in the board folder `worker-dgs-169-spike/`, written by `run-all.sh` itself (no network, one self-contained file): short report: per-model table
  (runs, passes, FAKED, tokens, cost, seconds), the answers, the memory points, the guardrail slips, the skipped arms and why.
- `report-2.md`: my words, checked against the raw `logs/results.jsonl` (I read the raw numbers, not only the script's summary).
- **A 10-line summary for Jack** in the report's first lines: a recommendation (which model, adopt OpenCode for the maestro or not, what to port).
- A refreshed DGS-169 backlog text (it still says "on the VPS"): written beside the report, uncommitted, for the Master.
- Nothing committed or pushed by me. Closing the three tabs at the end; the server stopped by PID.

## 7. Morning steps for Jack (these need him, so they do not run overnight)

1. Read the 10-line summary and `report.html`.
2. Real attach from the Windows PC, if the server is still up (the script leaves it running, unless the time cap is hit). Turn Proton VPN off first.
   Install OpenCode, the same version: `npm install -g opencode-ai@1.18.34`.
   Tunnel, terminal 1: `ssh -i $env:USERPROFILE\.ssh\jazurite -N -L 4198:127.0.0.1:4198 workbox@workbox`.
   Terminal 2: `$env:OPENCODE_SERVER_PASSWORD = (ssh -i $env:USERPROFILE\.ssh\jazurite workbox@workbox "cat ~/.digismith-depot/spikes/dgs-169/.server-password")`
   then `opencode attach http://localhost:4198 --agent maestro-guarded`. (If `workbox` does not resolve, use the Tailscale IP 100.108.1.19.)
   Tell the maestro: did the session show, and does a message from the PC show in the Mac pane?
3. Decide: adopt or not, which model, what to port. Raise or lower the cost cap if he wants a longer run.

## 8. Risks

- **Cost:** the $1 cap is checked before each run against its worst-case estimate. A stuck run could exceed it: every `opencode run` has a 120 s timeout, and the script counts the tokens after the fact.
- **A model with a shell:** bash is an allowlist and the only target paths are throwaway, but the guard is text matching. If question 5 finds a slip, the report says it; the server never runs unattended without the allowlist, and no live repo path is allowed for edits.
- **Quota:** TokenReply may rate-limit (the 2026-09 spike saw 429 on a trial tier). A 429 retries once after 60 s, then marks the run `RATE_LIMITED`, which is not a model failure.
- **Seat:** I (the worker) sleep with long waits while the script runs; I only wake to fix a crashed script, and at the end. I do not run anything by hand against the models.

## 9. Waiting for

"go" from Jack (via the Master), and a start time if he wants one. I do not start the server before that.
