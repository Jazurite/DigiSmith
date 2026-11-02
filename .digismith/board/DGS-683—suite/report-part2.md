# DGS-683 Castle, part 2: the herdr-ws scope — Implementation Report

Ticket: DGS-683 (part 2 = tasks T10, T11, T12 of plan.md). Branch DGS-683__herdr-scope. Read "Suite" in spec.md and plan.md as "Castle" (rename by Maestro/Jack, 2026-11-02; spec and plan on main are not edited).

## What changed
`scripts/opencode-boot/herdr-ws` (Python source; NOT installed, the deployed copy `~/.digismith-depot/bin/herdr-ws` is untouched):
- **Scope (T10).** `HERDR_SCOPE` = comma list `session:wN` (fallback `default:$HERDR_WS`). A leading `--session S` selects the session (must be in the scope). The wrapper builds the herdr argv itself; `--session`, `--socket` and `HERDR_SOCKET_PATH` of the caller are never forwarded. Lists are filtered and merged per session (the first reply's envelope is kept); `create`, `start` and every target are checked against the workspaces of the chosen session.
- **Castle close rule (T11).** In `Castle`, `tab close`, `agent stop`, `pane close` need a `tc-` or `nw-` label (tab: `tab get`; agent: name; pane: its owning agent). `rename` is judged too (current and new name both `tc-`/`nw-`), so a label cannot be taken over. Unknown labels fail closed. Other sessions keep the `WS:t1` rule.
- **Relocate (Maestro follow-up).** `pane move` and `pane swap` parse argv against the real flag lists of herdr, refuse the `=` form, unknown flags, `--current`, `--new-workspace`, a second positional; every named pane and destination must be in the scope; in Castle every named pane must belong to a `tc-`/`nw-` agent.
- **Flag targets (ticket review).** For every verb outside `list`: any `--flag=value` is refused, `--current` is refused, and every `--pane/--tab/--workspace/--source-pane/--target-pane` value must be in the scope.
- **Audit log (T12).** A non-read act in `default` on a workspace other than `HERDR_WS` appends one JSON line per workspace named to `<depot>/drivers/<KEY>.log` (`_unmapped.log` when the agent name has no `dgs-<n>`): `{time (+07:00), who, own, target, agent, pane, workspace, verb}`. Without `HERDR_WS` every Floor act is logged with `own:"unknown"` in `_unmapped.log` (never silent). A write failure prints one stderr line and the call goes on. Start-ticket and the bootstrap (parts 4/5) set both `HERDR_SCOPE` and `HERDR_WS`.
- **Text payloads.** A text argument that looks like `--flag=value` is refused: send text (for example `pane run`) as ONE quoted argument (docstring line; the conductor runbook text is part 4's T16).

## Tests
`scripts/opencode-boot/herdr-ws.test.ts`: 59 hermetic tests with a fake `herdr` shell script (the real herdr is never called). `node scripts/opencode-boot/test-herdr-ws.mjs` (read-only against live herdr): ALL PASS. Command: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 scripts/opencode-boot/herdr-ws.test.ts`.

## Review
T10 r1 (4 findings) fixed in e7bdc94e, r2 clean. T11 r1 (rename bypass and 2 Minor) fixed in e9914eb7, r2 clean. Pane move/swap (Maestro observation) 32261a68. T12 r1 (2 Important) fixed in fab2cd9c, r2 clean. Ticket r1 (2 Important, 2 Minor; F4 accepted) fixed in 0fd4eaf2, r2 approved; N1 (text payload) cfb2fdb3. See findings-part2.md.

## Notes for the Maestro
- Accepted by decision: in Castle, `pane run`, `send-text`, `send-keys` and `agent prompt` to a sibling conductor in the same Castle workspace stay allowed (spec 7.1 item 4 limits close and rename only).
- The plan's example "`agent prompt dgs-2` writes `_unmapped.log`" disagrees with its own key rule (`DGS-2.log`); the rule was followed, plan not edited.
- The plan's line "unset `HERDR_WS` (factory) writes nothing" was replaced by the Maestro's decision (always log, `own:"unknown"`).
- No protected path touched. No install, no live Floor/Castle session touched, no ClickUp write.

## First use
Not run (order: no install, no first use). Needs a conductor after the install: `herdr-ws --session Castle agent list` with `HERDR_SCOPE=Castle:<w>,default:<w>`; a pane move and a cross-project `agent prompt` against a throwaway session. Unverified against a real session: how herdr itself resolves a duplicated flag (the wrapper refuses duplicates, so it does not depend on it).
