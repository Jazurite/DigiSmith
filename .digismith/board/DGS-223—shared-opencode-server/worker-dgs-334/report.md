# DGS-334 Implementation Report: OpenCode 2.x on the shared server

Worker dgs-334, 2026-10-10 to 2026-10-11 (UTC+7). Plan: `plan.md`. Findings log: `results-checkpoint-2.md`. TokenReply spend: under $0.10 (model probes only).

## Summary
OpenCode 2.0.26 now runs the live shared server (port 4198) with the maestro config, a v2 safety plugin and a v2 key plugin, started by one boot script, `opencode-boot`. Luna and sonnet answer through it. The key is not readable through any API route or file. Jack switched the live server himself (the agent session cannot start stable 2.0.26: it hangs there; see Findings).

## Built
- `scripts/opencode-boot/opencode-boot.py` + `install.sh`: the ONLY boot script. Installed to `~/.digismith-depot/bin/opencode-boot` with its payload in `~/.digismith-depot/opencode/boot/`. Stops what holds the port (by PID), starts 2.0.26 from the v2 home, requires the safety plugin's `loaded` line, falls back to `~/.opencode/bin/opencode-1.18.35`. `--test` = throwaway home and port 4217, never 4198, no fallback. The password comes from a file; the server log is mode 600 and never shown.
- `.opencode/safety/maestro-safety-v2.js`: 2.x adapter (plugin directory, `Plugin.define`, `tool.execute.before` and the client-shell hook) around the unchanged `maestro-safety.js`.
- `.opencode/safety/tokenreply-key-v2.js`: key plugin. dotenv, in memory, adds the Bearer header per model request (`session` hook `model.request`); strips `*_API_KEY`, `*_TOKEN`, `*_AUTH` from shell env.
- `.opencode/safety/probe-v2-models.py` and `check-key-exposure.py`: model probe and a boolean-only key exposure check (`--live` for 4198).
- Removed: `start-shared-server.py`, `switch-v2.py`, `serve-oc2.py`, `serve-safety.py`, `serve-probe.py`; `SAFETY.md` and the DGS-223 report updated.

## Results
- Live (PID from `opencode-boot`, 2026-10-11 00:19 UTC+7): both plugins active, safety plugin `loaded`, luna replied `OK`, no key in any of 19 routes plus session routes, none of 160 files in the v2 home, none in the server env.
- Test server 4217: luna `OK`, sonnet `FINE`.
- First key version (header on the provider definition) exposed the key through `GET /api/provider/tokenreply`; it ran live for a few minutes before the per-request version replaced it. Jack rotates the key.

## Findings
- 2.x: plugin directories (`server.js`, deps by pnpm), domain hooks, `/api/...` REST, 1.x config auto-converted, plugins load only after `GET /api/plugin`, new sessions start on `opencode/exo-free` (deprecated: set the model explicitly), agent model from config not applied by the agent switch, the CLI logs argv, the server prints its password at start.
- Stable 2.0.26 hangs when started from the agent session but listens when Jack starts it (same script and env): the launching context matters, cause unverified.
- The installer `https://opencode.ai/v2/install` overwrites `~/.opencode/bin/opencode`; `opencode pair` only pairs with the 2.x background service, not with `serve`.

## Open items
1. DGS-346: DGS-226 probes and tests on v2, including the client shell route (the adapter hook exists, untested on a live call).
2. DGS-347: 1.x session history is not in v2 (separate data folder; rollback keeps 1.x intact).
3. DGS-331: the LaunchAgent must call `opencode-boot`.
4. Desktop 2.0.26 pairing needs the 2.x service mode; not done.
5. Model choice per session: clients pick `tokenreply/gpt-5.6-luna` themselves.
