# DGS-191 + DGS-403 report: apply the Maestro and conductor role names (text only)

Worker `dgs-191`, 2026-10-11 (UTC+7). Branch `dgs-191`. Part of DGS-405, epic DGS-402.

## Built
- Role words changed in `skills/handoff`, `skills/bootstrap`, `skills/finishing-a-development-branch`, the post-finish hook 02 text, a comment in `scripts/session-path.ts`, and the four `.opencode/skills/*/SKILL.md` files (Master -> Maestro, maestro role -> conductor). Identifiers, paths, `K: Maestro` and commands kept.
- New guard test `scripts/role-words.test.ts`: fails on "Master" or a lowercase "maestro" outside backticks in `skills/**` and `.opencode/skills/**`. Seen failing on 7 files first, then green.
- Runbook `.digismith/sessions/workbox.md` (untracked, not committed): Roles table at the top, role words changed in the current-setup and live-rule parts. The Hetzner-era part, dated quotes and the kicker test log keep the old words.
- Whole repo passes with `FORCE_COLOR=1`; CLI build clean; vendored-skills check passes (no other `check_*` script exists).

## Not changed
- `.opencode/prompts/maestro.md`, `.opencode/maestro/opencode.json`, `.opencode/safety/*` (dgs-401 changes them): about 55 old-word hits left for the DGS-405 step.
- `.digismith/docs/**`, board reports, `.digismith/history.html`, `packages/cli/src/tokens/*` (`Role = "maestro"`), `update-field.test.ts` sample option names.

## Review
Claude review subagent: no identifier changed, no hit missed, guard test clean. One finding, not taken: it says the OpenCode skills should say "conductor" because the agent dispatches workers. The Maestro's order names the OpenCode app session as a Maestro, so "Maestro" stays; flagged for the conductor to confirm.

## First use
ClickUp renames after the push: DGS-170, DGS-176, DGS-145 (new names plus the line "Renamed 2026-10-11 (epic DGS-402)"), DGS-139 (name kept, one line). Read-back reported separately.
