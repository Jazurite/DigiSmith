# DGS-334 Implementation Report: OpenCode 2.x side by side, then the live switch

Worker dgs-334, 2026-10-10 to 2026-10-11 (UTC+7). Branch `dgs-334` (not pushed). Details and findings: `results-checkpoint-2.md`, plan: `plan.md`.

## Summary
2.0.26 installed apart (pnpm, throwaway folder), a beta channel build tested, a v2 safety adapter written, and the live shared server switched to 2.0.26 by Jack running `switch-v2.py` (PID 85023, port 4198, safety plugin loaded). TokenReply spend: $0.

## State tonight
- Live server: `~/.opencode/bin/opencode` 2.0.26 on 4198; 1.18.35 kept at `~/.opencode/bin/opencode-1.18.35` (sha256 46b8ee40...d761). Tailscale: only 443 -> 4198. Jack's PC v2 CLI connects.
- v2 data is separate: `~/.digismith-depot/opencode/v2/xdg/` (the 1.x db is untouched, so rollback to 1.18.35 keeps history).
- Test servers 4214 and 4215 and the :8443 path are gone.

## What changed on branch dgs-334
- `.opencode/safety/maestro-safety-v2.js`: 2.x adapter (plugin DIRECTORY, `server.js`, `Plugin.define`, `ctx.tool.hook("execute.before")`, `ctx.shell.hook("create.before")`) around the unchanged `maestro-safety.js`.
- `.opencode/safety/switch-v2.py`: installs the v2 home (plugin dir + pnpm `@opencode/plugin`, merged config), stops the old server by PID, starts a candidate, requires listen in 60 s and a new `loaded` line after `POST /api/session` and `GET /api/plugin`, else falls back to 1.18.35 with `start-shared-server.py`.
- `.opencode/safety/serve-oc2.py`: throwaway server helper for tests.

## Findings
- 2.x: plugin API is new (directory plugins, domain hooks, no `tool.execute.before` or `permission.ask` names), config 1.x is auto-converted, REST moved to `/api/...`, pairing and a background "service" exist, a plugin loads only after `GET /api/plugin` or similar, the CLI logs argv (never pass a password on a command line), the server prints its generated password at start (log must be mode 600).
- 2.0.26 hung when started from the agent session but listens when Jack starts it (see results file); beta served from both.

## Open items
1. **Key plugin for v2.** The 1.x `tokenreply-key.js` uses the `config` hook. The beta runtime has `ctx.catalog` and `ctx.integration` (no `ctx.provider`). No models work on the live server yet; provider baseURL comes from the config merge in `switch-v2.py`, the key does not.
2. **No 1.x history in v2** (separate data folder). Migration route exists in 2.x (`/api/experimental/migration/v1`), untested.
3. **Shell route:** `POST /api/session/:id/shell` bypassed the rules; the adapter now has the `shell` hook, untested on a live server.
4. **DGS-226 probes and tests not run on v2** (1.x REST scripts need porting); only the load check passed.
5. **Launcher and LaunchAgent (DGS-331)** must use `switch-v2.py` or a v2 launcher: `start-shared-server.py` runs `opencode serve` from PATH with the 1.x plugin file, which 2.x does not load.
6. Clients: PC CLI v2 `opencode --server <url> -c` (password env `OPENCODE_SERVER_PASSWORD` or `OPENCODE_PASSWORD`); Desktop 2.0.26 add-server path not found, pairing via `opencode pair --url` needs 2.x service mode.
7. Beta build lives in the throwaway folder `~/.digismith-depot/opencode2-test/beta/` (fallback candidate for the script); move it into the depot or drop it.
