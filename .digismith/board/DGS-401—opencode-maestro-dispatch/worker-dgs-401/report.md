# DGS-401 report: let the OpenCode Maestro dispatch

Status: built, installed live, proven by Jack's probes, reviewed, merged. Ticket line: DGS-401.

## Cause
The config was not the problem. The safety plugin (`maestro-safety.js`, run by the v2 adapter) blocked three calls after the config allowed them or Jack approved them (decision log `verdicts.jsonl`, 21:37-21:42 UTC+7):
- Two brief writes: every write inside an allowed folder went to the Haiku reviewer, which used all 400 output tokens and returned no text. The plugin could not read a verdict and failed closed ("reviewer reply not valid").
- `herdr-ws tab create`: the v2 adapter stubs the session messages, so the reviewer saw no user request and blocked ("no matching user request is visible").
- The edit check used a hard-coded folder list and ignored the config's allow globs.
`opencode-boot` rebuilds `v2/` from the payload `~/.digismith-depot/opencode/boot/` on every start, so the change goes in the repo, then `install.sh`, then the restart.

## Fix (agents `maestro` and `maestro-review`)
- Writes are allowed by rules, with no model, on the real path (no `..`, symlinks resolved, relative to a project root): `.digismith/sessions/opencode-maestro/*`, `.digismith/sessions/dgs-<n>/brief.md`, files directly in `.digismith/board/<ticket>/` and its `worker-*/` folders. `Move to:` paths in a patch are checked. Secret paths, outside-root paths, secret text and deletes block first.
- `herdr-ws tab create`, `agent start`, `agent prompt`, `agent wait` (`HERDR_WS=w2`, full path) are allowed by rules. `close`, `stop`, `run`, `send`, `rename`, `focus` stay on the config `ask` and go to the reviewer (1500 tokens, a prompt that says Jack's approval follows; a bad reply or a down gateway still blocks).
- Config: edit allows for `dgs-*/brief.md` and `board/*`; four bash allows after the ask block and before the deny block, so a deny still wins (last match wins). The plugin throws before OpenCode can grant anything, and a plugin allow never grants.
- Prompt: active Maestro, the new role words (conductors and their workers are never prompted), the write scope, today's rules.

## Tests (free, no model)
`test-dgs-401.mjs` (60 cases: traversal, symlinks, dangling symlinks, secret paths, repo files, `brief.md` outside `dgs-*`, delete, move-out, workspaces, duplicate flags), `test-config-order.mjs` (both agents, deny wins), `test-rules.mjs` with `OPENCODE_SAFETY=1` (50; two expectations changed: a session-folder write and `tab create` in w2 now pass by rule). Tests were written first and seen to fail.

## Review
Claude whole-branch review (subagent). Verified and fixed with tests: (1) a dangling symlink as the last path component passed the symlink check (the write would create the target); now blocked. (2) Duplicate `--workspace` / `--pane` flags, `-w` and `=` forms passed the workspace check, while the `herdr-ws` wrapper reads only the first occurrence; now blocked. Not fixed: no per-verb flag whitelist for the four dispatch verbs (herdr's flags are unverified; the wrapper still pins workspace and pane). Config glob `board/*` is wider than the plugin; the plugin decides.

## Live proof
Backups with suffix `.before-dgs-401-20261011` (payload, `v2/`, `bin/opencode-boot`); `restore.md` has the restore commands. Jack restarted `opencode-boot`; probes a-f in `probe.md` all passed: write `dgs-999/brief.md` (no prompt), `agent list`, `tab create` (no prompt) and `tab close` (prompt, Jack approved) = the first use, one tab created and closed; a write to `.claude/settings.json`, a read of a `.env` path and `ls /etc` stayed blocked. The review fixes came after the restart; they reach the live server with the next `opencode-boot`.

DGS-346 stays its own ticket (the DGS-226 probe set on v2); here only the deny shapes were run.
