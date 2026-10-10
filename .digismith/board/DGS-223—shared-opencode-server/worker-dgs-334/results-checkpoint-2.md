# DGS-334 checkpoint 2 (partial): 2.0.26 does not start serving here. Worker dgs-334, 2026-10-10 ~23:2x UTC+7

## Done
- Installed apart: `pnpm add @opencode/cli@2.0.26` in `~/.digismith-depot/opencode2-test/`. pnpm blocked the package postinstall (ERR_PNPM_IGNORED_BUILDS); I read `postinstall.mjs`
  (picks the platform binary, local only) and ran it by hand in the package folder. `opencode2 --version` = 2.0.26. Live `opencode` still 1.18.35, live binary hash unchanged.
- Isolation works: `XDG_*` moves 2.x data, config, cache, state into the throwaway folder (`opencode2 debug paths`). Live `~/.local/share/opencode` and `~/.config/opencode`: no change
  except the live server's own log growing.
- Throwaway home `~/.digismith-depot/opencode2-test/home/`: maestro config, prompts, both plugins copied (plugins + dotenv), password file (mode 600).

## 2.x design differences found
- `serve` alone is not the way: 2.x runs a background "service" with its own config (`opencode service get|set`: hostname, port, password, cors, env, remote).
  Default `opencode serve --service`; clients (`opencode`, `models`) start it on demand. `opencode pair [--url] [--remote]` prints one-time pairing links; `remote` = OpenTunnel.
- The service password is stored in `service.json` (XDG config) and, if unset, generated (32 random bytes). `service set password <value>` puts the value in argv and the 2.x CLI
  writes the args into its log (`opencode.log`) in clear. I printed one throwaway test password by mistake, then unset it, let 2.x generate a new one into the password file, blanked the log. Never set a real password through argv.
- Plugins and agents: not testable yet (see below).

## Blocker
`opencode2 serve` and `service start` (also via `models`) start a process that sits idle (0 % CPU, no db created, nothing logged, no listening socket) on this Mac
(Intel i7-9750H, macOS 26.7.1). Tried: no config, empty cwd, clean HOME, `--stdio`, `--service`, pty, `--print-logs --log-level debug`, the non-baseline and baseline binary (same bytes).
Control: the live 1.18.35 binary under the same isolation serves on a throwaway port within seconds. `--help`, `service get/set`, `debug paths` work. So it is not the sandbox, the network, or my config.
Not yet tried: asking anyone with a working 2.x server; running with the original `HOME` plus nothing else is what failed too.

## State now
Nothing of mine running, port 4214 free, no Tailscale change (mapping still 443 -> 4198 only), no repo commit. Untracked in my worktree: `.opencode/safety/serve-oc2.py` (does not work; needs rewriting for the service model).
Safety plugin load check, DGS-226 tests, Desktop test: not run (no server). Model spend: $0.

# Update ~23:28 UTC+7: beta channel (option c)
- `@opencode/cli@beta` = 0.0.0-beta-19507, folder `~/.digismith-depot/opencode2-test/beta/` (same postinstall step by hand). **It serves** on 127.0.0.1:4214 within 5 s with the same isolation (the 2.0.26 build hangs, the beta does not).
- Auth: basic auth, user `opencode`, password from `OPENCODE_SERVER_PASSWORD` works (401 without). The beta also PRINTS a generated password to stdout at start if none is set (the log is mode 600, never shown;
  I leaked one throwaway password into my own output once more, the process was stopped and a new password file used).
- API moved: `/api/...` (health, session, agent, config, plugin, permission, event, ...). 1.x paths (`/global/health`, `/config`, `/agent`) return the web app HTML. The DGS-226 probe scripts (1.x REST) will not work unchanged.
- Config: 2.x reads our 1.x `opencode.json` and converts it (`permission` -> `permissions` rule list with `{action, resource, effect}`, `plugin` -> `plugins`, `prompt` file -> `system` text, `provider` -> `providers`). Agents maestro and maestro-review parsed; built-ins disabled kept.
  It also lists `~/.claude`, `<project>/.claude` and `.opencode` folders as config sources (Claude config is read).
- **Plugin API is new.** The 1.x plugin file (`export const X = async () => ({ "tool.execute.before": ... })`) is not loaded: a configured plugin must be a DIRECTORY ("configured plugin path must be a directory"),
  with `server.js` or `index.js`, default export `Plugin.define({ id, setup(ctx) })` (`import { Plugin } from "@opencode/plugin"`). Hooks are registered on domains: `ctx.tool.hook("execute.before", cb)` (input.tool, input.input mutable),
  `ctx.permission.hook("evaluate", cb)` (can set effect), `ctx.shell.hook("create.before", cb)`. The 1.x `tool.execute.before` and `permission.ask` names do not exist. Tool id for bash is `shell`.
- **Port done as a thin adapter** (`.opencode/safety/maestro-safety-v2.js`, copied as `plugin-safety/server.js` next to the unchanged `maestro-safety.js`): **the safety plugin LOADS on the beta**: `/api/plugin` shows `maestro-safety-v2` state active, and verdicts.jsonl got one
  new `"event":"loaded"` line. The launcher's loaded check (a request for the project folder, then the log line) works the same way (first session request triggers it); the first plugin load takes about 10 s.
- **Not verified:** that the hook fires and blocks real model tool calls. A model run needs (a) a 2.x key plugin (the 1.x `tokenreply-key.js` uses the `config` hook, gone; 2.x has integrations and credentials) and
  (b) the TokenReply baseURL, which lives in the global `~/.config/opencode/opencode.json` that the isolation excludes. Neither done; spend $0.
- **Finding:** `POST /api/session/:id/shell` (a client-run shell command, same idea as the 1.x user shell) ran `ls /etc` although the maestro config denies shell and the safety rules block it: that path is NOT `tool.execute.before`.
  Needs `ctx.shell.hook("create.before")` in the adapter. Anyone with the password can run shell on the server this way (also on 1.x, unverified).
- Session storage: new sqlite under the XDG data folder; the beta did not touch `~/.local/share/opencode` (only the live server's own log grew).
- State: server stopped (PID), port 4214 free, Tailscale mapping 443 -> 4198 only, live binary hash unchanged. Branch `dgs-334` has one local commit (adapter + start helper), not pushed.
- Open for Jack: does Desktop 2.0.26 accept the beta server? Not tried (no Tailscale step before checkpoint 2 is approved; the pairing link command is `opencode2 pair --url <https url>`, it works against the service, not yet tried on `serve`).

# Update 2026-10-11 ~00:1x UTC+7: why 2.0.26 listens on the live server but hung in my tests
Jack ran `switch-v2.py --candidates stable` himself. The live server is now 2.0.26 (PID 85023, `~/.opencode/bin/opencode`, 4198, safety plugin logged `loaded` 00:00:20).
- The same script with the same binary, env (PATH, XDG_* in a v2 home, OPENCODE_CONFIG, OPENCODE_SAFETY, password env) and home layout, started by me in rehearsal on 4215 (cwd = the main checkout), hung: no listening socket in 60 s.
  So the env, the XDG home and the config are NOT the cause. The one difference left is WHO started it: Jack's own terminal versus the Claude Code Bash tool of this agent session.
- The beta (and 1.18.35) start fine from the agent session; stable 2.0.26 did not. Best explanation, unverified: something the agent session's process environment restricts (sandbox or inherited state) is needed at 2.0.26 startup only.
  Test for later: start 2.0.26 on a throwaway port from Jack's terminal and from the agent, same command, compare. Not done.
- Cleanup done: 4214 service and 4215 rehearsal stopped by PID, `tailscale serve --https=8443 off`, only `https://workbox.tail730dcf.ts.net -> 4198` remains, no LaunchAgent added (3 existing plists unchanged), PID 85023 untouched.
