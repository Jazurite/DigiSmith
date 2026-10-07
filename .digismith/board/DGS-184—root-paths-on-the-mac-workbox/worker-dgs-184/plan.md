# DGS-184 plan: `/root` paths on the Mac Workbox

Approved design (checkpoint 1, 2026-10-06 UTC+7): item 3 = A (delete the line), no opencode update.

## Checks first (shell, run before and after; they fail now)

| # | Check | Before | After |
|---|-------|--------|-------|
| C1 | `~/.claude/settings.json` parses and has no `/root` | fail | pass |
| C2 | `~/.claude/hooks/herdr-agent-state.sh` exists; `herdr integration status` says claude `current` | fail | pass |
| C3 | `~/.digismith-depot/usage-probe/settings.json` has no `/root` | fail | pass |
| C4 | `.digismith/config.yml` has no `ssh_key` and still parses (`scripts/preferences.ts` get of another key works) | fail | pass |
| C5 | `.digismith/sessions/workbox.md`: no `date -d` outside Linux-labelled text, no `/root` in the probe steps (lines 135 to 153), a macOS section exists | fail | pass |
| C6 | `pnpm test` count unchanged (only `index.e2e` fails, passes with `FORCE_COLOR=1`) | n/a | same |

## Steps

1. Item 1 (done): copy `settings.json` to `settings.json.before-dgs-184`; `herdr integration install claude`; drop the `/root` SessionStart entry with python; C1, C2.
2. Item 2: copy first (done); set the command to `python3 "$HOME/.digismith-depot/usage-probe/statusline.py"`; shell test passed; the real probe runs at checkpoint 3; C3.
3. Item 3: in the worktree, delete `ssh_key` from `.digismith/config.yml`; C4. Commit `fix(config): drop the dead ssh_key preference`.
4. Item 4: edit the runbook on disk with python: `$HOME` form in the probe steps and `resets-in.py` line; Linux and macOS `date` forms; add a short macOS section; keep VPS history lines. Never commit; C5.
5. Run `pnpm test` before and after; acceptance: new Claude session in a herdr pane with no hook error; one probe run with seat `jack`, keys only.
6. Write `worker-dgs-184/report.html`; checkpoint 3.

## Not in scope

Fixtures with `/root/.ssh/...`, the opencode integration, VPS history lines in the runbook, `preferences.yml.migrated`.
