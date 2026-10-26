# DGS-622: seat, trigger and lifecycle events for automatic runs

## Why
Runs made by DGS-598 (a session with no `dg run start`) show Seat `-` and Trigger `unknown` in the Oculus Runs table. Probe sessions show Key `-`. The events `review_ready`, `merged` and `pushed` are written by hand today, so finished runs show Review, Merged and Pushed as "waiting" in the phase strip (DGS-613).

## What the code does today (read, not run)
- `packages/cli/src/run/auto.ts` `startAuto` writes `seat: env1(env.DIGISMITH_SEAT)`. Nothing in the repo exports `DIGISMITH_SEAT`, so it is always `null`. `dg run start --seat` is the only writer.
- `packages/cli/src/oculus/derive.ts` `triggerOf` returns `unknown` when `run.order === null`. An automatic run has no order. A builder that the scan claimed but whose record is automatic (the scan journal has a `claim` for its ticket) also gets `unknown`.
- `scripts/claude-account/claude-account` `cmd_env` prints the token export for a seat. It prints no seat name. A pane gets its seat through `eval "$(claude-account env)"`.
- Probe sessions run in herdr under an agent name with "probe" in it. `role.ts` already gives them role `scout`. The labeller (`label.ts`) knows that name. The record has no tag, and `RunsTable.vue` shows Key as `r.ticket ?? '-'`.
- `scripts/run-events/hook-cli.ts` -> `runHook` (`packages/cli/src/run/hook.ts`) already runs after every tool use (`hooks/hooks.json`, PostToolUse `*`). The payload has `tool_name` and `tool_input.command`. The hook never stores them; it may read the command to decide.
- The three lifecycle moments leave a trace in a Bash command:
  - `dg reviewer pack --type ticket --ticket <KEY> ...` (Builder, before `STOP: ticket-review-ready`).
  - `git update-ref refs/digismith/post-finish/<branch>/head HEAD` (`skills/finishing-a-development-branch/SKILL.md`, written ONLY when the merge moved HEAD).
  - `git push origin <base>` (same skill, after the merge is green).
  PostToolUse fires only for a tool call that succeeded.

## Behavior

### A. Trigger (Oculus)
`triggerOf(run, claim, away)` returns, in this order:
1. order set, not `order-ao-*`: `manual` (as today).
2. order `order-ao-*`, or (order null AND role builder AND a scan `claim` for the ticket): `away` when the claim falls in an away window, else `night-scan` (as today).
3. order null, `run.source === "auto"`: `auto`.
4. order null, source `start`: `manual`.
`unknown` is never returned. `TRIGGERS` (`scripts/nexus-shared/oculus.ts`) and `Trigger` (`packages/cli/src/oculus/types.ts`) become `manual, night-scan, away, auto`. The words `night-scan` and `away` stay: they are already in the filters and the scan tests. (The ticket says "scan"; `night-scan` is the same word, kept to avoid a rename.)

### B. Key column
`RunsTable.vue` Key = `r.ticket ?? r.project ?? '-'`. The labeller sets `project: "usage-probe"` on a run whose herdr agent name includes `probe` (role is already `scout`). A probe row then reads Key `usage-probe`.

### C. Seat
New `packages/cli/src/run/seat.ts`, `seatOf(env)`, used by `startAuto`:
1. `DIGISMITH_SEAT` when it passes `plainName`.
2. Else, when env holds NO `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` (key presence only, the value is never read): the lower-cased local part of `oauthAccount.emailAddress` in `$CLAUDE_CONFIG_DIR/.claude.json` (default `~/.claude.json`), if it passes `plainName`. That file has no token. A read error gives `null`.
3. Else `null` (shown as `-`).
`claude-account env` adds `export DIGISMITH_SEAT=<name>` for a seat and for a gateway (the account NAME only). This is how a herdr pane gets its seat. Panes already running keep their old env until restarted.

### D. Lifecycle events (part B of the ticket comment)
New `packages/cli/src/run/lifecycle.ts`; `runHook` calls it for kind `tool`, inside its own try/catch, after the normal event. It writes, with `appendEvent`, to the ticket's newest run with role `builder` (by `created_at`, folder `runs/<KEY>/`). No builder run: nothing is written.
- `review_ready` `{scope:"ticket", round}`: command has `dg reviewer pack` and `--type ticket`; ticket from `--ticket <KEY>`. Task-scope packs write nothing (a task review is not the ticket's Review step).
- `merged`: command has `git update-ref refs/digismith/post-finish/<branch>/head`; ticket from `ticketOfBranch(<branch>)`. Skipped when that run already has a `merged` event.
- `pushed`: command has `git push origin main` or `master` (not `-u`, not a branch push). Written to every builder run of the last 7 days that has `merged` and no `pushed`.
The hook stores only the event type and these small scalars, never the command. The skill string is pinned by a test that reads `skills/finishing-a-development-branch/SKILL.md` (read only).

## Files touched
| File | Protected |
|---|---|
| `packages/cli/src/oculus/derive.ts`, `types.ts` and their tests | no |
| `scripts/nexus-shared/oculus.ts`, `oculus.test.ts` | no |
| `scripts/nexus-web/app/components/oc/RunsTable.vue`, `runs.test.ts`, `tests/oculus-fixtures.ts`, `WorkersTable.stories.ts` | no |
| `packages/cli/src/run/seat.ts` (new), `auto.ts`, `label.ts` and tests | no |
| `scripts/claude-account/claude-account`, `test-claude-account.sh` | no |
| `packages/cli/src/run/lifecycle.ts` (new), `hook.ts` and tests | no |

Protected paths touched: NONE (`hooks/`, `skills/finishing-*`, `skills/reviewer`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/config.yml` stay as they are). The merge does not need the Maestro.

## Split proposal
Not needed. The lifecycle events come from reading the PostToolUse payload in `packages/cli/src/run/`, so neither `hooks/hooks.json` nor the finishing skill changes. The rejected alternative (a `dg run event` line inside the finishing skill and the reviewer skill) edits protected paths and would need the split. Risk to note for the Maestro: the `merged` signal depends on the `git update-ref refs/digismith/post-finish/` line in the finishing skill; the pin test fails loudly if that line moves.

## Out of scope
Token reading of any kind. Renaming `night-scan`. Writing events from `dg run` commands. Backfilling old runs (a run keeps the seat and trigger it had; the trigger is derived on read, so old auto rows show `auto` at once; old seats stay `-`).

## First use (the conductor, after the merge; no ClickUp write, no delete)
1. Plugin reload. Oculus Runs: old auto rows read Trigger `auto` (not `unknown`); a no-ticket row reads Key = project.
2. Maestro approval: run `scripts/claude-account/install.sh` (mkdir and cp only, backs up the old file). Then `claude-account env jack | grep DIGISMITH_SEAT` prints `export DIGISMITH_SEAT=jack` and no token line is shown (grep for that one line only).
3. Open a NEW herdr tab; `dg run list` shows its seat `jack` or `dev0`; Oculus shows it in Seat.
4. Lifecycle without live work: in a temp depot (`DIGISMITH_DEPOT_DIR=$(mktemp -d)`), `dg run start --role builder --ticket DGS-1 --order /tmp/x.md` for a throwaway run, then pipe three PostToolUse JSON payloads (the three commands above) into `node --experimental-strip-types scripts/run-events/hook-cli.ts tool`; `dg run show` lists `review_ready`, `merged`, `pushed`. The next real ticket merge shows Review, Merged, Pushed as done in the phase strip.
