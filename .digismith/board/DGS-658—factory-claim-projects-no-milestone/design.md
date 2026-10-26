# Design: factory claim without a milestone for Projects tickets (DGS-658)

## Problem
`checkReady` refuses every ticket with `milestone === null`. Projects-folder tickets (Emma, personal) never have a DigiSmith milestone.

## Change
1. `types.ts`: `LoTask` gets `inProjects: boolean`.
2. `tracker-clickup.ts`: new constant `PROJECTS_FOLDER_ID = "1301150000003307"` beside `IMPERIUM_LIST_ID`. `toLoTask` sets
   `inProjects = t.folder?.id === PROJECTS_FOLDER_ID`. The folder comes from the ticket (ClickUp returns `folder.id` on a task);
   no config key, no extra API call. A light read (non-Autonomous search hit) uses the same search hit, which carries `folder`.
3. `ready.ts`: `if (t.milestone === null && !t.inProjects) out.push(REASON.milestone)`. Every other check is unchanged;
   Sign-off stays required everywhere.
4. The milestone lookup is skipped for a Projects ticket (no Imperium read for it); `milestone` stays `null`.

## Tests first (vitest)
- `ready.test.ts`: Projects task, no milestone -> ready (`[]`); clan task, no milestone -> `[REASON.milestone]`; Projects task without Sign-off -> `[REASON.signOff]` only.
- `tracker-clickup.test.ts`: a task with `folder.id` = Projects folder id maps to `inProjects: true`; another folder id (or none) maps to `false`.
- Fixtures that build a `LoTask` (`fake-tracker.test-util.ts`, `scan*.test.ts`, `rank.test.ts`) get `inProjects: false`.

## Out of scope
The "Sign-off" field on the Projects lists (add it in the ClickUp UI; open item for Jack in the report). No new `dg` command.
