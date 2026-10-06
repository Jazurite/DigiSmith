# Hard-coded `/root` paths break on the Mac Workbox

**Status:** Not applied. Found 2026-10-06 07:5x UTC+7 [00:5xZ] by the maestro while starting DGS-181. ClickUp: **DGS-184** (list C.2: CLI, created 2026-10-06 07:5x UTC+7 [00:5xZ], task id `14zcebruxww`).

**Source:** the Mac Workbox is the main machine (DGS-182). Files copied from the Hetzner Workbox still name `/root`, which does not exist on macOS (home is
`/Users/workbox`). Found so far:

1. `~/.claude/settings.json`: the SessionStart hook runs `bash '/root/.claude/hooks/herdr-agent-state.sh' session`. The file is not on the Mac, so every
   Claude session prints "SessionStart:startup hook error ... No such file or directory". herdr's status line for that agent may also lose its state.
   Fix: run `herdr integration status`, then `herdr integration install claude` (it writes the hook for this machine), and drop the stale `/root` entry.
2. `~/.digismith-depot/usage-probe/settings.json`: `statusLine` command is `python3 /root/.digismith-depot/usage-probe/statusline.py`. The usage probe
   cannot run on the Mac until the path is `$HOME`-relative or rewritten.
3. `.digismith/config.yml` (tracked): `preferences.ssh_key: /root/.ssh/jazurite_github`. Decide what the value means on a machine with another key path.
4. `.digismith/sessions/workbox.md` (untracked runbook): 15 `/root` paths and `date -d` (GNU only) in the usage probe steps; `resets-in.py` needs a
   check. Part of this ticket's text goes in a macOS section (see the `workbox-macos.md` notes).
5. Two test fixtures (`scripts/config-parse.test.ts`, `scripts/own-repo-config.test.ts`) use `/root/.ssh/...` as sample data. They are only strings: leave
   them unless a test fails.

## To do

1. Fix items 1 to 4 so each works on macOS and Linux (use `$HOME`, `os.homedir()` or the tool's own installer, never a literal home).
2. Run `herdr integration status` first and say what it reports. Do not read any token, key or `.env`.
3. Acceptance: start a new Claude session in a herdr pane with no startup hook error; run the usage probe once on the Mac (use the `claude-account` seat,
   never print a token) and show `out.json` keys only.
4. Keep the diff small. Item 4 edits an untracked file on disk: do not commit it.

## Related

DGS-182 (the Mac move), DGS-181 (depot lifecycle on macOS), `.digismith/sessions/workbox-macos.md` (untracked), DGS-151 (`dg workbox`).
