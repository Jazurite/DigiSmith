# DGS-387 plan: show each task type's icon in `dg clickup list-task-types`

## Change
Add an icon column as the LAST column of each output line: `<source> <value>` (e.g. `fas flag`), tab-separated from the description. A type with no avatar, or with null source and value, prints `-`. Order stays id, name, plural, description, icon, so nothing that reads the first four columns breaks.

Format rule (one helper `formatIcon(avatar)` in `list-task-types.ts`):
- avatar null, or both source and value empty/null -> `-`
- otherwise `[source, value].filter(Boolean).join(" ")` (a half-filled avatar shows what it has, no `null` text)

Plain `Task` (id 0, `PLAIN_TASK_TYPE`, avatar null) prints `-`. Also update the `describe` text to list the icon.

## Files
- `packages/cli/src/clickup/list-task-types.ts` (helper, line format, describe)
- `packages/cli/src/clickup/list-task-types.test.ts` (tests)
- No change to `packages/clickup-client/src/types.ts`: `ClickUpTaskType.avatar: { source, value } | null` already exists. No new call: `getTaskTypes()` already returns it.
- Not touched: `delete-task-type.ts`, `update-task-type.ts`, `create-task-type.ts`, `task-types.ts`.

## Tests (first, see them fail)
In the existing mocked-client test, with a mocked answer:
1. type with avatar `{source: "fas", value: "flag"}` -> line ends `\tfas flag`
2. type with `avatar: null` -> line ends `\t-`
3. type with avatar `{source: null, value: null}` -> `-`
4. plain Task line is `0\tTask\tTasks\t\t-`
Existing assertions for the first four columns are updated for the new trailing column.

## Process
Branch `dgs-387` in `.worktrees/dgs-387` from origin/main (after "go: build", which waits for DGS-382 to merge), rebase first so hook 03 is there. TDD, pnpm only. Claude whole-branch review, report.md + report.html with my own merge-range pins, `FORCE_COLOR=1 pnpm test`, CLI build, ff main, hooks 01-03, rebuild CLI in main, check `clickup --help`, push.

## First use (after merge and push)
`dg clickup list-task-types` (a read). Report the icon column exactly as shown for every type. The order expects Initiative `fas bullseye` and Epic `fas bolt`; the ticket says Initiative was restored to `flag`. Any difference is a finding for Jack: no icon change, no `update-task-type`. Then close the ticket: `dg clickup update-task --task 14zcebrvddg --status done --start-date 2026-10-11 --due-date 2026-10-11`, read back (both dates `1791666000000`).

## Left out
- No `--json` or header row: not in the ticket.
- No icon filter or lookup by icon.
