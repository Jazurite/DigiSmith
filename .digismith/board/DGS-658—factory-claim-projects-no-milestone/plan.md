# Plan: factory claim without a milestone for Projects tickets (DGS-658)

Spec: `design.md` in this folder. Tests first, one commit per task. pnpm only.

1. **ready.ts** (test first in `ready.test.ts`): add `inProjects: boolean` to `LoTask` (`types.ts`) and to every `LoTask` fixture
   (`fake-tracker.test-util.ts`, `scan.test.ts`, `scan-guard.test.ts`, `rank.test.ts`, `ready.test.ts`, `tracker-clickup.test.ts`).
   Tests: Projects + no milestone -> `[]`; clan + no milestone -> `[REASON.milestone]`; Projects + no Sign-off -> `[REASON.signOff]`.
   Code: `if (t.milestone === null && !t.inProjects)`.
2. **tracker-clickup.ts** (test first in `tracker-clickup.test.ts`): `PROJECTS_FOLDER_ID` constant; `toLoTask` sets `inProjects`
   from `t.folder?.id`; skip the milestone lookup for a Projects ticket. Tests: Projects folder id -> true, no Imperium read;
   other or missing folder -> false.
3. Run `pnpm -r test` for the autonomous folder, typecheck, then the dry run.
