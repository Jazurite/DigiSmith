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
2. Start the shared server with `opencode-boot` (the ONLY boot script; source `scripts/opencode-boot/`, installed by `sh scripts/opencode-boot/install.sh` to `~/.digismith-depot/bin/opencode-boot`, payload in `~/.digismith-depot/opencode/boot/`).
   It stops what holds the port (by PID), starts OpenCode 2.0.26 from the v2 home (`~/.digismith-depot/opencode/v2`) with the maestro config, the v2 safety plugin (`maestro-safety-v2.js`, a plugin directory) and the v2 key plugin (`tokenreply-key-v2.js`) and `OPENCODE_SAFETY=1`,
   and requires the `loaded` line; if that fails it falls back to `~/.opencode/bin/opencode-1.18.35` with the 1.x setup (global 1.x plugins, `OPENCODE_CONFIG`). The password comes from `~/.digismith-depot/opencode/server-password` (never printed; the server log is mode 600 and not to be shown).
   `opencode-boot` restarts the live server on 4198; `opencode-boot --test` starts a throwaway server (port 4217, home `~/.digismith-depot/opencode/test`) and never touches 4198. The LaunchAgent (DGS-331) calls `opencode-boot`; `SAFETY_ALLOWED_WS` goes in its `EnvironmentVariables` (default `w2`).
   The maestro config is NOT in the repo root: a root `opencode.json` would make every OpenCode session in this repo (offload workers too) read-only. It lives in `.opencode/maestro/opencode.json` and is installed into the payload.
3. Start check (`opencode-boot`): OpenCode loads plugins lazily, on the first request for a project folder. The launcher sends one request for it, then within 20 s the log must have a new `"event":"loaded"` line; if not, it stops the server. Without the plugin only layers 1 and 3 stand.
4. `SAFETY_ALLOWED_WS` lists the herdr workspaces the plugin accepts; the per-project permission block still pins one workspace per agent (DGS-225).

## Tests (all on a throwaway server, port 4213, fresh random password; live 4198 untouched)
- `node test-rules.mjs` free, no model: 50 calls (reviewer URL dead on purpose).
- (Needs a port to v2, DGS-346: the throwaway server and probe agents `serve-safety.py` made are gone; these scripts speak the 1.x REST API.) `../probes/run_probes.py probe-open <port>` (config allows everything, only the plugin guards),
  `run-steering.py <agent> <port> [summarize|follow]`, `run-ask.py <port>`, `run-outage.py <port>`, `compare-reviewers.mjs <model>...`, `cost.py`.
