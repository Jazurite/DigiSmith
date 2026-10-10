# DGS-334 plan (checkpoint 1): test OpenCode 2.0.26 side by side. Worker dgs-334, 2026-10-10 ~23:2x UTC+7

Read only so far. Nothing installed, nothing started, no branch yet. Reads done: the brief and order, ticket DGS-334, `backlog/shared-opencode-server.md`,
`.opencode/safety/SAFETY.md`, DGS-226 `plan-dgs-226.md`, `start-shared-server.py`, `serve-safety.py`, `test-rules.mjs`, `maestro-safety.js` (head), the 2.x npm metadata
(`pnpm view`, the update API, the first 80 lines of `https://opencode.ai/v2/install`, not run).

## Facts found
- `@opencode/cli` 2.0.26 on npm: bins `opencode` and `opencode2` (both `bin/opencode.exe`), platform packages as optionalDependencies (`@opencode/cli-darwin-x64`, plus `-baseline`).
  This Mac is Intel (i7-9750H), so darwin-x64.
- **The official 2.x installer is unsafe for this test.** `https://opencode.ai/v2/install` installs to `$HOME/.opencode/bin`, the folder that holds the live 1.18.35
  binary (`~/.local/bin/opencode` is a symlink into it). It would overwrite the live server's binary and edit shell config. I do not run it.
- **Shared state is the second risk.** 1.x keeps sessions in `~/.local/share/opencode/opencode.db` and reads `~/.config/opencode/` (global plugins `tokenreply-key.js`,
  `maestro-safety.js`, `herdr-agent-state.js`). A 2.x binary that opens that database could migrate it and break the live server. So the test must not point at those folders.

## 1. Install apart (after approval)
- pnpm only: `pnpm add @opencode/cli@2.0.26` inside a throwaway folder `~/.digismith-depot/opencode2-test/` (not in the repo, not in `~/.config/opencode`).
  Result: `~/.digismith-depot/opencode2-test/node_modules/.bin/opencode` (and `opencode2`). Nothing global (`-g` never used), no PATH change, no shell config edit.
  The postinstall: I check first that the platform binary arrives (`@opencode/cli-darwin-x64` through optionalDependencies); if pnpm blocks lifecycle scripts, I do not approve any
  build script outside the package.
- **How the two commands stay apart:** the live `opencode` is `/Users/workbox/.opencode/bin/opencode` (found through `~/.local/bin`). I always call 2.x by its full path
  `~/.digismith-depot/opencode2-test/node_modules/.bin/opencode2` (the `opencode2` alias, so a typo cannot hit the 1.x name), never put that folder on PATH, and run
  `opencode --version` (still 1.18.35) and a hash of the live binary before and after. The launcher test copy names the binary by path, not by `opencode` on PATH.

## 2. Throwaway server (after approval)
- Port **4214** (checked free just now: nothing listens on 4214 to 4220). Never 4198. Host `127.0.0.1`. Stopped by PID at the end, no `pkill -f`.
- Throwaway copy of the setup in `~/.digismith-depot/opencode2-test/home/` (mode 700): `opencode.json` copied from `.opencode/maestro/opencode.json`, `plugins/maestro-safety.js` and
  `plugins/tokenreply-key.js` copied from `~/.config/opencode/plugins/` (copy only, source untouched; `herdr-agent-state.js` is not copied), a fresh random password file (mode 600,
  value never printed), a log folder. The repo stays unchanged, except the code I put on branch `dgs-334`.
- **Isolation:** the server starts with `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` pointing inside the throwaway folder, `OPENCODE_CONFIG` to the copied config,
  `OPENCODE_SAFETY=1`, `SAFETY_LOG` to a throwaway log, `SAFETY_ALLOWED_WS=w2`, autoupdate off. `HOME` stays real because both plugins read `~/.digismith-depot/.env` in memory (the key is never printed).
  If 2.x ignores XDG and writes under `~/.local/share/opencode` or `~/.config/opencode`, I stop at once: I take a listing with mtimes of both folders before the first start and compare after.
  If 2.x cannot be isolated, I stop and ask.
- Server cwd: a throwaway project folder with a copy of the repo's `.opencode/` text (prompts, skills), not the live checkout.
- I record what breaks, per area: plugin API (does `file://` plugin load, hook names `tool.execute.before`, `permission.ask`, the `@opencode-ai/plugin` import, one-export rule),
  config and permission format (agent block, `bash` pattern rules, `external_directory`, disabled built-in agents), password and pairing scheme (`OPENCODE_SERVER_PASSWORD`, basic auth user `opencode`,
  pairing endpoint, `opencode service`), the launcher's loaded check (lazy load on first request, the `"event":"loaded"` log line), session storage (new db or files, location, whether it reads a 1.x db).

## 3. Safety tests (after approval; free ones first)
1. `OPENCODE_SAFETY=1 SAFETY_LOG=<throwaway> SAFETY_REVIEWER_URL=http://127.0.0.1:1 node .opencode/safety/test-rules.mjs` (50 calls, no model). This tests the plugin hook function itself and does not
   need 2.x, so it only proves the file is unchanged. The real test is the next point.
2. Load check on 2.0.26: start the server, send one request for the project folder (as `start-shared-server.py` does), expect one new `"event":"loaded"` line within 20 s. **No `loaded` line =
   the safety plugin cannot load = 2.x is not offered to Jack, and I stop there.**
3. Through the live 2.x server, with the DGS-226 scripts on port 4214 and the throwaway password: `run_probes.py probe-open 4214` (config allows all, only the plugin guards), `run-ask.py 4214`,
   `run-outage.py 4214`, `run-steering.py maestro 4214 summarize`. I check the scripts work against 2.x API first (they use the 1.x REST paths); an API difference is reported as a finding, and I adapt
   the script call only in my own worktree copy.
4. Also check on 2.x: the ask prompt for a `herdr-ws` change verb still pauses (`permission` config shape), deny rules still deny (grep and glob off, bash patterns), built-in agents disabled.

## 4. Desktop test with Jack: Tailscale path (needs Jack's yes before I run it)
Current mapping (read only, `tailscale serve status`): `https://workbox.tail730dcf.ts.net` (443) -> `http://127.0.0.1:4198`. It stays untouched.
Add a second HTTPS port on the same name, tailnet only (no Funnel):
```
tailscale serve --bg --https=8443 http://127.0.0.1:4214
```
Test address for Jack: `https://workbox.tail730dcf.ts.net:8443`. If 2.x offers a pairing link, I give the link (built with that address). Else the password FILE path
(`~/.digismith-depot/opencode2-test/home/pass`), never the value.
Remove right after the test:
```
tailscale serve --https=8443 off
```
then `tailscale serve status` must show only the 443 -> 4198 line. I also stop the 4214 server by PID. I will say if `--https=8443` is refused on this Tailscale version; I do not try other forms without asking.

## 5. Switch plan (checkpoint 3, written, not done)
Launcher (`start-shared-server.py` binary path and the loaded check), LaunchAgent text (DGS-331), the depot home (`~/.digismith-depot/opencode/`, where the 2.x binary and db would live, migration
or fresh storage), rollback (1.18.35 binary stays, db backup), the Desktop and `opencode attach` clients, the TUI plugin `herdr-tui-session.js`. Content depends on the test results.

## Cost estimate (TokenReply, cap $0.30)
Free: install, plugin load, the rules test, config and API checks, Desktop test (no model).
Model runs (only if the plugin loads):
| Run | Model | Est. |
|---|---|---|
| `run_probes.py probe-open` (about 25 prompts, DGS-226 measured about $0.004 each) | luna | about $0.10 |
| reviewer calls during those (about 30 at $0.0003) | haiku 5.5 reviewer | about $0.01 |
| `run-ask.py` + `run-outage.py` (a few turns) | luna | about $0.02 |
| `run-steering.py maestro 4214 summarize` | luna | about $0.01 |
Total about **$0.14**, hard stop at $0.30; I estimate again before each batch and use `cost.py` after. The sonnet check is skipped unless the budget is clearly left.

## Files and git
After approval: branch `dgs-334` in `.worktrees/dgs-334` from `origin/main`. Expected repo changes are small: a throwaway-start helper (`.opencode/safety/serve-oc2.py`, the `serve-safety.py` pattern with the 2.x binary path,
XDG isolation and the port guard) and, if the tests need it, small adaptations to the probe scripts. Report `report.md` and `report.html` in `worker-dgs-334/`. Commits title-only, no push, no merge, no ClickUp write.

## Questions for the maestro
1. Is the throwaway home `~/.digismith-depot/opencode2-test/` (outside the repo, outside the live depot folder) acceptable, or do you want another folder?
2. May I run the two Tailscale commands in section 4 when the tests pass (at checkpoint 2, with Jack there), after your yes?

Waiting for "approved: checkpoint 1".
