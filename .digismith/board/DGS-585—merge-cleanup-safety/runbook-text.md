# Text for the sessions runbook (DGS-585)

The Maestro pastes these parts into the sessions runbook. `.digismith/sessions/` is git-excluded, so this file is the source.

## Merge step (night merges)

Before a night merge, run `dg autonomous merge-gate --ticket <KEY>`.

- `go` (exit 0): merge per hooks 01-03, then release `merged`.
- `refused: <reason>` (exit 1): do not merge. Release with `dg autonomous release --ticket <KEY> --result failed --cause merge-refused`. The gate has already opened a `refused` attention item.

The merge order text already says `run dg autonomous merge-gate --ticket <KEY> first`. The conductor's hooks 01-03 merge order must name the gate too, so no merge path skips it. Day merges (Jack present) do not call the gate.

The gate and the scan read the policy from the local `main` ref (`git show main:.digismith/config.yml`). Keep local `main` current. `git fetch origin main` in the scan does not move it.

## Salvage

Before any teardown of a ticket's worktree, run `dg salvage --ticket <KEY>`. Use `--dry-run` to see the plan first.

- It commits a dirty tree (WIP, no hooks), writes and verifies a bundle in `~/.digismith-depot/salvage/`, and pushes `rescue/<KEY>` to origin (`rescue/<KEY>-<UTC>` if the plain name has diverged).
- It checks the files of every commit in `main..branch` and of the dirty tree. A secret-like name (`.env*`, `*.pem`, `*.key`, `*secret*`, `*token*`, any folder) or a file over 5 MB stops it with `not salvaged: ...; Jack decides`.
- It never deletes anything. If it fails, stop and tell Jack.
- Rescue branches stay on origin until Jack deletes them.

## First use

After the merge, rebuild the CLI dist and run `scripts/nexus-api/install.sh`. Then:

1. `dg salvage --ticket DGS-585 --dry-run` on a finished ticket's worktree prints the plan and writes nothing.
2. `dg autonomous merge-gate --ticket <KEY>` on a night branch: `go`. On a throwaway branch that edits `hooks/hooks.json`: `refused: protected path: hooks/hooks.json`, and `dg autonomous attention` lists the `refused` item.
3. Break `nightwatch.budgets.building` on a scratch copy of the config: the next `dg autonomous scan --dry-run` reports `guardrail-config` and claims nothing.
4. The next morning report has a `Drift` section. The first real night is the real test of the already-done check.
