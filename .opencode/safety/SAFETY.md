# DGS-226 OpenCode safety layer

Three layers, same idea as Claude Code auto mode.
1. **Ask prompts** (`.opencode/maestro/opencode.json`): `herdr-ws` change verbs (`create start prompt run close stop send wait rename focus`) are `ask`. The request shows in Jack's client
   (web app or `opencode attach`) as a pending bash permission with the full command. The session waits. Nothing runs until he answers.
   Do NOT click "Always": its pattern is `herdr-ws *` and would stop the prompt for every herdr-ws verb (the plugin still reviews each call).
2. **Reviewer plugin** (`maestro-safety.js`, hook `tool.execute.before`, runs before the permission check). Fixed rules decide read-only and clearly bad calls with no model.
   Calls that change things (writes inside the session folder, `herdr-ws` change verbs) go to a small model (default `claude-haiku-5-5` through TokenReply).
   Verdicts: allow, ask, block. Fail closed: key missing, gateway error, timeout (15 s), bad reply, plugin error, log not writable = block.
   A plugin cannot open a prompt. A reviewer `ask` on a `herdr-ws` change verb goes on to the config prompt (layer 1). Any other `ask` becomes a block "needs Jack".
   Log: `~/.digismith-depot/opencode/verdicts.jsonl` (mode 600, times UTC+7, args cut to 120 characters and redacted, never a key).
3. **Deny rules** (`.opencode/maestro/opencode.json` permission block, DGS-169, plus `claude-accounts` and `verdicts.jsonl`).

## Gate
The plugin does nothing unless the server starts with `OPENCODE_SAFETY=1`. **The shared server must ALWAYS start with it.** Sessions without the flag
(offload runners, the depot OpenCode server, Jack's own TUI) are NOT guarded by this plugin.

## Install (Jack's yes first; not done)
1. `cp .opencode/safety/maestro-safety.js ~/.config/opencode/plugins/maestro-safety.js` (one file, one export; do not copy the tests there)
   Config check, free: without `OPENCODE_CONFIG`, `opencode agent list` in this repo shows the default agents (build, plan) and no maestro; with it, maestro and maestro-review.
   Still loaded for every session in this repo: the four skills in `.opencode/skills/` (clickup-rules, dispatch-worker, flux, handoff): text only, loaded on demand, harmless but visible to offload workers..
2. Start line of the shared server (and the LaunchAgent `ProgramArguments` for DGS-223). The maestro config is NOT in the repo root: a root `opencode.json`
   would make every OpenCode session in this repo (offload workers too) read-only. It lives in `.opencode/maestro/opencode.json` and is loaded only through `OPENCODE_CONFIG`.
   The launcher sets `OPENCODE_CONFIG`, `OPENCODE_SAFETY=1` and `SAFETY_ALLOWED_WS`, reads the password file (never printed), detaches (PPID launchd), and runs the loaded check:
   `python3 -I <repo>/.opencode/safety/start-shared-server.py <project-dir> 4198`
   LaunchAgent: `ProgramArguments` = `/usr/bin/python3`, `-I`, `<repo>/.opencode/safety/start-shared-server.py`, `<project-dir>`, `4198` (`SAFETY_ALLOWED_WS` in `EnvironmentVariables`, default `w2`).
   Without the launcher, by hand: `OPENCODE_CONFIG=<repo>/.opencode/maestro/opencode.json OPENCODE_SAFETY=1 opencode serve ...`.
3. Start check (launcher): OpenCode loads plugins lazily, on the first request for a project folder. The launcher sends one request for it, then within 20 s the log must have a new `"event":"loaded"` line; if not, it stops the server. Without the plugin only layers 1 and 3 stand.
4. `SAFETY_ALLOWED_WS` lists the herdr workspaces the plugin accepts; the per-project permission block still pins one workspace per agent (DGS-225).

## Tests (all on a throwaway server, port 4213, fresh random password; live 4198 untouched)
- `node test-rules.mjs` free, no model: 50 calls (reviewer URL dead on purpose).
- `serve-safety.py <port> <workdir> [reviewer-url]`, then `../probes/run_probes.py probe-open <port>` (config allows everything, only the plugin guards),
  `run-steering.py <agent> <port> [summarize|follow]`, `run-ask.py <port>`, `run-outage.py <port>`, `compare-reviewers.mjs <model>...`, `cost.py`.
