# Oculus overview 503: plan

Spec: `spec.md` in this folder. Work in the worktree for this ticket. Test first. pnpm only. `packages/cli/src` runs under `node --experimental-strip-types` (no parameter properties, enums, namespaces). `packages/cli/src/oculus` is not a protected path.

Setup (fresh worktree): `pnpm --filter @digismith/clickup-client build`.

### Task 1: ticketless sessions get a string source
Files: `packages/cli/src/oculus/views.ts`, `packages/cli/src/oculus/views.test.ts`; the API route test `scripts/nexus-api/src/oculus-route.test.ts`.
- [ ] Failing tests first, in `views.test.ts` (use the existing helpers that write a run and events into a temp depot, as in the runs-view test around line 265, with `source: "auto"` and `ticket: null`):
  - ticketless healthy worker with project `shoppable-video`: every `lastEvents` row of that worker has `source: "shoppable-video"`.
  - the same with `project: null`: `source` equals the run id.
  - a worker with a ticket still has `source: <ticket>` (keep the line-68 assertion).
  - the whole overview of that depot passes `overviewViewSchema.parse` (import it from `scripts/nexus-shared/oculus.ts` the way the other contract tests do).
- [ ] In `oculus-route.test.ts`: a route test with a fake reader answering an overview that contains a ticketless worker's events: the route answers 200 with that body (it answered 503 `internal_invalid` before the fix). If the existing route fixtures cannot hold a ticketless worker, add one.
- [ ] Run the tests: they fail. Then change `views.ts` line ~110: `source: w.ticket ?? w.project ?? w.run`. Run them again: they pass.
- [ ] Run `pnpm vitest run packages/cli/src/oculus scripts/nexus-api/src/oculus-route.test.ts` and `pnpm --filter @digismith/cli build` (tsc must pass).
- [ ] Commit: `fix(oculus): give a ticketless session's events a string source`

### Task 2: final check
- [ ] `pnpm --filter @digismith/clickup-client build`, then `pnpm vitest run packages/cli/src/oculus scripts/nexus-api/src`, then the web unit tests for `LastEvents` (`pnpm --dir scripts/nexus-web exec vitest run app/components/oc`). All green.
- [ ] No live write, no restart, no Caddy or settings change in any step. The first use (spec.md) is the conductor's, after the merge.
