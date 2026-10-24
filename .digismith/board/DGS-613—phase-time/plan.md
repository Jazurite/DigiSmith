# Oculus phase and time in phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Runs table's Duration cell shows the current phase and its time (`0:31:07 · building 0:14`), and the run page's phase strip shows each step's duration and a counter on the current step.

**Architecture:** The CLI view (`dg oculus view`) derives two new fields from the events that exist today: `RunRow.phaseSince` (from the watchdog's `phaseOf().since`) and `PipelineStep.durationSec` (the gap to the next step). The shared zod schema gets both fields, so the Nexus API passes them through with no code change. The web counts the live parts (the current phase, the current step) from these start times and the page clock (`useNow`, 30 s); pure helpers in `oc-format.ts` hold every "-" rule.

**Tech Stack:** TypeScript under `node --experimental-strip-types` (CLI), zod 4 (shared schema), Nuxt 4 / Vue 3.5 (web), vitest, Storybook, Playwright (e2e, axe, visual), pnpm.

## Global Constraints

- Spec: `.digismith/board/DGS-613—phase-time/design.html` (approved by Jack 2026-10-24, Sign-off: Auto).
- **Every task needs DGS-599 merged.** DGS-599 renames every file this plan touches (`nightwatch` → `oculus`, `nw/` → `oc/`, `Nw*` → `Oc*`, `nw-format` → `oc-format`, `--nw-*` → `--oc-*`, `.nw-table` → `.oc-table`, pages at `/runs/` and `/run/`). This plan uses the names after that merge. Task 1 Step 1 rebases on main and checks the names. If a name on main differs from this plan, use main's name and say so in the task report; it is the same file.
- No new event type. No change to the Nexus API route code, Caddy, DNS, LaunchAgents or settings files. Never touch API 4300.
- Code in `packages/cli/src/` runs under `node --experimental-strip-types` (relative imports with `.ts`, no TS-only syntax such as enums or parameter properties).
- Times on screen are UTC+7. Durations are `h:mm` (`fmtMinutes`), except the run total, which stays `h:mm:ss` (`fmtDuration`).
- Runs table: no new column. Duration cell = `<duration> · <phase> h:mm` for a run in state healthy, blocked or stalled with a phase; the duration only otherwise (no "· -").
- Strip: the current step shows the time only, in the info color (`--oc-info`), no "now" word. Pushed shows no duration (blank when done, "-" otherwise). Screen reader text: "(done, 1 h 7 min)", "(current, 14 min so far)".
- Never a false number: a missing time, a lost run, or a negative gap shows "-". A time after the page clock shows `0:00` (never below zero).
- Tests use fakes only: no real ClickUp, no herdr call, no live API, no real depot (`DIGISMITH_DEPOT_DIR` in a temp folder via `makeDepot()`), fixed clocks.
- pnpm only. Commits: title-only conventional commits, no AI attribution, `git commit -- <paths>`.

---

### Task 1: Data contract: `phaseSince`, `durationSec`, and the budget number

Needs DGS-599 merged (rebase first).

**Files:**
- Modify: `packages/cli/src/oculus/types.ts` (`RunRowView`, `PipelineStep`)
- Modify: `packages/cli/src/oculus/derive.ts` (`runRowOf`, `pipelineOf`)
- Modify: `packages/cli/src/oculus/views.ts` (`runView`)
- Modify: `packages/cli/src/oculus/README.md` (one paragraph)
- Modify: `scripts/nexus-shared/oculus.ts` (`runRowSchema`, `pipelineStepSchema`)
- Test: `packages/cli/src/oculus/derive.test.ts`, `packages/cli/src/oculus/views.test.ts`, `scripts/nexus-shared/oculus.test.ts`
- Modify (row and step literals gain the new fields): `scripts/nexus-api/src/oculus-route.test.ts`, `scripts/nexus-web/app/composables/oculus-api.test.ts`, `scripts/nexus-web/tests/oculus-fixtures.ts`

**Interfaces:**
- Consumes: `phaseOf(run, events): { phase; since } | null` from `packages/cli/src/autonomous/watchdog.ts` (unchanged).
- Produces:
  - `RunRowView.phaseSince: string | null` and zod `runRowSchema.phaseSince: iso.nullable()` (placed right after `phase`).
  - `PipelineStep.durationSec: number | null` and zod `pipelineStepSchema.durationSec: count.nullable()` (after `state`).
  - `pipelineOf(run: RunRecord, events: EventLine[], claimAt: string | null, state: Health, endedAt: string | null): PipelineStep[]` (new fifth parameter).
  - `runView(...).budget.elapsedMin` = whole minutes from `row.phaseSince` (floor), or null.
  - Web fixtures (used by Tasks 3 to 5): `runFixture()` has `phaseSince: '2026-10-22T02:46:00.000Z'`; `runDetailFixture().pipeline` is the list in Step 12; `runDetailFixture().budget.elapsedMin` is 14.

- [ ] **Step 1: Rebase on main and check the names**

```bash
cd /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-613
git fetch -q . main:main 2>/dev/null || true
git rebase main
ls packages/cli/src/oculus/derive.ts packages/cli/src/oculus/views.ts packages/cli/src/oculus/types.ts \
   scripts/nexus-shared/oculus.ts scripts/nexus-web/app/utils/oc-format.ts \
   scripts/nexus-web/app/components/oc/RunsTable.vue scripts/nexus-web/app/components/oc/PipelineBar.vue \
   scripts/nexus-web/app/pages/oculus/run.vue scripts/nexus-web/tests/oculus-fixtures.ts
```

Expected: the rebase succeeds and every path exists. If DGS-599 is not on main, or a path is missing and no renamed file is evident, stop and tell the conductor (`STOP: blocked DGS-599 names`).

- [ ] **Step 2: Write the failing CLI tests (derive)**

Add to `packages/cli/src/oculus/derive.test.ts` (it already has `run()`, `ev()`, `T0` and the imports):

```ts
describe("phaseSince", () => {
  it("a builder's phase starts at its started event", () => {
    const r = runRowOf(run(), [ev(1, "started", "2026-10-22T01:00:00.000Z")], "manual", DEFAULT_BUDGETS, T0 + 60_000);
    expect(r).toMatchObject({ phase: "building", phaseSince: "2026-10-22T01:00:00.000Z" });
  });
  it("a phase event moves it; a fix wave restarts building at the first tool after review_ready", () => {
    const events = [
      ev(1, "started", "2026-10-22T01:00:00.000Z"),
      ev(2, "review_ready", "2026-10-22T01:30:00.000Z"),
      ev(3, "tool", "2026-10-22T01:50:00.000Z", { tool: "Edit", ok: true }),
    ];
    expect(runRowOf(run(), events, "manual", DEFAULT_BUDGETS, T0 + 55 * 60_000)).toMatchObject({ phase: "building", phaseSince: "2026-10-22T01:50:00.000Z" });
    const waiting = runRowOf(run(), events.slice(0, 2), "manual", DEFAULT_BUDGETS, T0 + 35 * 60_000);
    expect(waiting).toMatchObject({ phase: null, phaseSince: null });
  });
  it("an ended run has no phase and no phaseSince", () => {
    const events = [ev(1, "started", "2026-10-22T01:00:00.000Z"), ev(2, "ended", "2026-10-22T01:32:00.000Z")];
    expect(runRowOf(run(), events, "manual", DEFAULT_BUDGETS, T0 + 3600_000)).toMatchObject({ phase: null, phaseSince: null });
  });
  it("a reviewer counts review from its start", () => {
    const r = runRowOf(run({ role: "reviewer" }), [ev(1, "started", "2026-10-22T01:05:00.000Z")], "manual", DEFAULT_BUDGETS, T0 + 10 * 60_000);
    expect(r).toMatchObject({ phase: "review", phaseSince: "2026-10-22T01:05:00.000Z" });
  });
});

describe("pipelineOf durations", () => {
  const dur = (p: { step: string; durationSec: number | null }[]) => Object.fromEntries(p.map((s) => [s.step, s.durationSec]));
  it("a done step lasts until the next step with a time; current and waiting steps have none", () => {
    const events = [ev(1, "started", "2026-10-22T01:01:00.000Z"), ev(2, "review_ready", "2026-10-22T01:40:00.000Z")];
    const p = pipelineOf(run(), events, "2026-10-22T00:59:00.000Z", "healthy", null);
    expect(dur(p)).toEqual({ claimed: 60, "worktree-ready": 60, building: 39 * 60, review: null, merged: null, pushed: null });
  });
  it("an ended run: the last reached step runs to endedAt; Pushed has none", () => {
    const events = [
      ev(1, "started", "2026-10-22T01:00:00.000Z"), ev(2, "review_ready", "2026-10-22T02:07:00.000Z"),
      ev(3, "merged", "2026-10-22T03:04:00.000Z"), ev(4, "pushed", "2026-10-22T03:05:00.000Z"), ev(5, "ended", "2026-10-22T03:06:00.000Z"),
    ];
    const p = pipelineOf(run(), events, null, "ended", "2026-10-22T03:06:00.000Z");
    expect(dur(p)).toEqual({ claimed: null, "worktree-ready": 0, building: 67 * 60, review: 57 * 60, merged: 60, pushed: null });
    const noReview = pipelineOf(run(), [ev(1, "started", "2026-10-22T01:00:00.000Z"), ev(2, "ended", "2026-10-22T01:20:00.000Z")], null, "ended", "2026-10-22T01:20:00.000Z");
    expect(noReview.find((s) => s.step === "building")).toMatchObject({ state: "done", durationSec: 20 * 60 });
  });
  it("a lost step and a manual run's claim have none", () => {
    const p = pipelineOf(run(), [ev(1, "started", "2026-10-22T01:01:00.000Z")], null, "lost", null);
    expect(p.find((s) => s.step === "building")).toMatchObject({ state: "lost", durationSec: null });
    expect(p[0]).toMatchObject({ step: "claimed", durationSec: null });
  });
  it("times out of order give null, never a negative number", () => {
    const p = pipelineOf(run({ created_at: "2026-10-22T01:30:00.000Z" }), [ev(1, "started", "2026-10-22T01:00:00.000Z"), ev(2, "review_ready", "2026-10-22T01:40:00.000Z")], null, "healthy", null);
    expect(p.find((s) => s.step === "worktree-ready")?.durationSec).toBeNull();
    expect(p.find((s) => s.step === "building")?.durationSec).toBe(40 * 60);
  });
});
```

Change the existing `pipelineOf(...)` calls in this file to pass a fifth argument `null` (four calls in `describe("pipelineOf")` and `describe("pipelineOf more states")`).

- [ ] **Step 3: Write the failing CLI tests (views)**

Add to `packages/cli/src/oculus/views.test.ts`, inside `describe("run and events")`:

```ts
  it("the budget counts from the row's phaseSince, so a fix wave restarts it like the watchdog", () => {
    seedRun();
    d.writeEvents("DGS-590", "builder-1", [
      { type: "started", ts: "2026-10-22T02:00:00.000Z" },
      { type: "review_ready", ts: "2026-10-22T02:30:00.000Z" },
      { type: "tool", ts: "2026-10-22T02:50:00.000Z", data: { tool: "Edit", ok: true } },
    ]);
    const r = runView(d.env, NOW, { run: "builder-1" });
    expect(r?.row).toMatchObject({ phase: "building", phaseSince: "2026-10-22T02:50:00.000Z" });
    expect(r?.budget).toMatchObject({ phase: "building", elapsedMin: 10 });
    expect(r?.pipeline.find((s) => s.step === "building")?.durationSec).toBe(30 * 60);
    expect(runsView(d.env, NOW, {}).runs[0].phaseSince).toBe("2026-10-22T02:50:00.000Z");
  });
  it("an ended run's strip has durations up to its end", () => {
    seedRun();
    d.writeEvents("DGS-590", "builder-1", [
      { type: "started", ts: "2026-10-22T02:00:00.000Z" },
      { type: "ended", ts: "2026-10-22T02:25:00.000Z", data: { reason: "other" } },
    ]);
    const r = runView(d.env, NOW, { run: "builder-1" });
    expect(r?.row.phaseSince).toBeNull();
    expect(r?.budget.elapsedMin).toBeNull();
    expect(r?.pipeline.find((s) => s.step === "building")).toMatchObject({ state: "done", durationSec: 25 * 60 });
  });
```

- [ ] **Step 4: Run the CLI tests to see them fail**

Run: `pnpm --dir packages/cli exec vitest run src/oculus/derive.test.ts src/oculus/views.test.ts`
Expected: FAIL (no `phaseSince`, no `durationSec`, budget 30 not 10).

- [ ] **Step 5: Implement the CLI fields**

`packages/cli/src/oculus/types.ts`: add `phaseSince: string | null;` after `phase: RunPhase | null;` in `RunRowView`, and `durationSec: number | null` to `PipelineStep`:

```ts
export interface PipelineStep { step: "claimed" | "worktree-ready" | "building" | "review" | "merged" | "pushed"; at: string | null; state: "done" | "current" | "waiting" | "lost"; durationSec: number | null }
```

`packages/cli/src/oculus/derive.ts`, in `runRowOf` return object, after `phase: p?.phase ?? null,`:

```ts
    phaseSince: p?.since || null,
```

`pipelineOf` becomes:

```ts
export function pipelineOf(run: RunRecord, events: EventLine[], claimAt: string | null, state: Health, endedAt: string | null): PipelineStep[] {
  const first = (pred: (e: EventLine) => boolean): string | null => events.find(pred)?.ts ?? null;
  const at: Record<PipelineStep["step"], string | null> = {
    claimed: claimAt,
    "worktree-ready": run.created_at,
    building: first((e) => e.type === "started" || (e.type === "phase" && e.data.phase === "building")),
    review: first((e) => e.type === "review_ready" || (e.type === "phase" && e.data.phase === "review")),
    merged: first((e) => e.type === "merged"),
    pushed: first((e) => e.type === "pushed"),
  };
  const order: PipelineStep["step"][] = ["claimed", "worktree-ready", "building", "review", "merged", "pushed"];
  // The furthest step with a time is where the run stands. A manual run has no claim time, so "claimed" is skipped, not blocking.
  let reached = -1;
  order.forEach((s, i) => { if (at[s] !== null) reached = i; });
  const nextAt = (i: number): string | null => order.slice(i + 1).map((s) => at[s]).find((t) => t !== null) ?? null;
  return order.map((step, i) => {
    let s: PipelineStep["state"] = "waiting";
    if (i < reached) s = "done";
    else if (i === reached) s = state === "ended" ? "done" : state === "lost" ? "lost" : "current";
    if (step === "claimed" && at.claimed === null) s = "waiting";
    // A done step lasts until the next step with a time; the last one of an ended run until its end. Pushed is the end mark.
    let durationSec: number | null = null;
    const start = at[step];
    const end = s === "done" && step !== "pushed" && start !== null ? nextAt(i) ?? (state === "ended" ? endedAt : null) : null;
    if (start !== null && end !== null) {
      const sec = (ms(end) - ms(start)) / 1000;
      durationSec = sec >= 0 ? Math.round(sec) : null;   // times out of order: no number rather than a false one
    }
    return { step, at: start, state: s, durationSec };
  });
}
```

`packages/cli/src/oculus/views.ts`, in `runView`: delete the `const since = phase === null ? null : loaded.events.filter(...)...` line and change the pipeline and budget lines:

```ts
  const phase = row.phase;
  const since = row.phaseSince;   // the watchdog's clock (phaseOf), the same number the Runs table shows
  return {
    readAt: now.toISOString(),
    row,
    pipeline: pipelineOf(record, loaded.events, claim?.ts ?? null, row.state, row.endedAt),
    budget: {
      phase, limitMin: phase === null ? null : budgets[phase],
      elapsedMin: since === null ? null : Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / 60_000)),
      building: budgets.building ?? DEFAULT_BUDGETS.building, review: budgets.review, merge: budgets.merge,
    },
```

- [ ] **Step 6: Run the CLI tests to see them pass**

Run: `pnpm --dir packages/cli exec vitest run src/oculus/`
Expected: PASS, including the old "budget elapsedMin counts from the newest phase event" test (phaseOf also takes the newest phase event).

- [ ] **Step 7: Write the failing schema test**

In `scripts/nexus-shared/oculus.test.ts`, add `phaseSince: '2026-10-22T01:00:00.000Z'` to the `row` literal (after `phase`). Add:

```ts
describe('phase time fields', () => {
  it('a row needs phaseSince and a step needs durationSec', () => {
    const { phaseSince: _p, ...noSince } = row
    expect(runRowSchema.safeParse(noSince).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, phaseSince: null }).success).toBe(true)
    expect(pipelineStepSchema.safeParse({ step: 'building', at: null, state: 'waiting' }).success).toBe(false)
    expect(pipelineStepSchema.safeParse({ step: 'building', at: null, state: 'waiting', durationSec: null }).success).toBe(true)
    expect(pipelineStepSchema.safeParse({ step: 'building', at: null, state: 'done', durationSec: -1 }).success).toBe(false)
  })
})
```

Import `pipelineStepSchema` and `runRowSchema` if the file does not import them yet. Any `pipeline` step literal already in this file gains `durationSec: null`.

- [ ] **Step 8: Run it to see it fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run ../nexus-shared/oculus.test.ts` (or the command the file's own header names after DGS-599)
Expected: FAIL (the strict schema rejects `phaseSince`).

- [ ] **Step 9: Implement the schema**

`scripts/nexus-shared/oculus.ts`:

```ts
export const runRowSchema = z.strictObject({
  run: z.string(), ticket: z.string(), role: z.enum(ROLES),
  seat: z.string().nullable(), model: z.string().nullable(),
  trigger: z.enum(TRIGGERS), state: z.enum(HEALTH),
  phase: z.enum(RUN_PHASES).nullable(), phaseSince: iso.nullable(),
  startedAt: iso, endedAt: iso.nullable(), elapsedSec: count, events: count,
  merged: z.boolean(), pushed: z.boolean(),
})
```

Keep any fields DGS-599/DGS-598 added to this object (for example `project`); only add `phaseSince`.

```ts
export const pipelineStepSchema = z.strictObject({
  step: z.enum(['claimed', 'worktree-ready', 'building', 'review', 'merged', 'pushed']),
  at: iso.nullable(), state: z.enum(['done', 'current', 'waiting', 'lost']), durationSec: count.nullable(),
})
```

- [ ] **Step 10: Update the other row literals**

Add `phaseSince` after `phase` in the `row` literal of `scripts/nexus-api/src/oculus-route.test.ts` (`phaseSince: '2026-10-22T02:00:00.000Z'`) and `scripts/nexus-web/app/composables/oculus-api.test.ts` (`phaseSince: null`, its phase is null). Add `durationSec: null` to every pipeline step literal in those two files.

- [ ] **Step 11: Update the web fixtures**

`scripts/nexus-web/tests/oculus-fixtures.ts`: `runFixture()` default gains `phaseSince: '2026-10-22T02:46:00.000Z'` (after `phase: 'building'`). In `overviewFixture` and `runsFixture`, the reviewer row gains `phaseSince: '2026-10-22T01:30:00.000Z'`; the ended and lost rows gain `phaseSince: null`.

- [ ] **Step 12: Update the run detail fixture**

```ts
    pipeline: [
      { step: 'claimed', at: '2026-10-22T02:09:00.000Z', state: 'done', durationSec: 60 },
      { step: 'worktree-ready', at: '2026-10-22T02:10:00.000Z', state: 'done', durationSec: 0 },
      { step: 'building', at: '2026-10-22T02:10:00.000Z', state: 'current', durationSec: null },
      { step: 'review', at: null, state: 'waiting', durationSec: null },
      { step: 'merged', at: null, state: 'waiting', durationSec: null },
      { step: 'pushed', at: null, state: 'waiting', durationSec: null },
    ],
    budget: { phase: 'building', limitMin: 120, elapsedMin: 14, building: 41, review: 0, merge: 0 },
```

(The strip's Building counts from 02:10, the row's phase from 02:46: the strip shows milestones, the row the watchdog clock, as the spec's fix-wave case says.)

- [ ] **Step 13: README**

Add to `packages/cli/src/oculus/README.md`, under the run view:

```md
Phase times: each run row has `phaseSince`, the start of its current phase on the watchdog's clock (`phaseOf().since`; null when the run has no phase). Each pipeline step has `durationSec`: for a done step, the seconds to the next step with a time, or to the run's end for the last step of an ended run; null for current, waiting and lost steps, for Pushed, and when the times are out of order. The budget's `elapsedMin` counts from `phaseSince`. No new event type: these come from the events that exist.
```

- [ ] **Step 14: Run every touched suite**

Run:
```bash
pnpm --dir packages/cli exec vitest run src/oculus/ src/strip-types.smoke.test.ts
pnpm --dir scripts/nexus-api exec vitest run src/oculus-route.test.ts
pnpm --dir scripts/nexus-web exec vitest run ../nexus-shared app/composables app/components
pnpm --dir scripts/nexus-web typecheck
```
Expected: all PASS (Use the test commands main uses after DGS-599 if a `--dir` differs; the nexus-api package may run its tests from the repo root with `pnpm exec vitest run scripts/nexus-api/src/oculus-route.test.ts`.)

- [ ] **Step 15: Commit**

```bash
git add packages/cli/src/oculus scripts/nexus-shared/oculus.ts scripts/nexus-shared/oculus.test.ts scripts/nexus-api/src/oculus-route.test.ts scripts/nexus-web/app/composables/oculus-api.test.ts scripts/nexus-web/tests/oculus-fixtures.ts
git commit -m "feat(oculus): add phase start and step durations to the run view" -- packages/cli/src/oculus scripts/nexus-shared/oculus.ts scripts/nexus-shared/oculus.test.ts scripts/nexus-api/src/oculus-route.test.ts scripts/nexus-web/app/composables/oculus-api.test.ts scripts/nexus-web/tests/oculus-fixtures.ts
```

---

### Task 2: Format helpers: `phaseTime`, `stepTime` and the spoken words

Needs DGS-599 merged (file `oc-format.ts`) and Task 1 (types).

**Files:**
- Modify: `scripts/nexus-web/app/utils/oc-format.ts`
- Test: `scripts/nexus-web/app/utils/oc-format.test.ts`

**Interfaces:**
- Consumes: `RunRow`, `RunDetail` from `#oculus-schema` (with Task 1's fields).
- Produces:
  - `phaseTime(r: Pick<RunRow, 'state' | 'phase' | 'phaseSince'>, nowMs: number): { phase: string; min: number } | null`
  - `stepTime(s: RunDetail['pipeline'][number], nowMs: number): { min: number; live: boolean } | null`
  - `spokenSeconds(sec: number): string` ("31 min 7 s", "1 h 2 min 3 s", "0 s")
  - `spokenMinutes(min: number): string` ("14 min", "1 h 7 min", "0 min")

- [ ] **Step 1: Write the failing tests**

Append to `scripts/nexus-web/app/utils/oc-format.test.ts` (add the four names to its import from `./oc-format`):

```ts
describe('phase and step times', () => {
  const now = Date.parse('2026-10-22T03:00:00.000Z')
  const row = { state: 'healthy' as const, phase: 'building' as const, phaseSince: '2026-10-22T02:46:00.000Z' }
  it('phaseTime: a running run with a phase', () => {
    expect(phaseTime(row, now)).toEqual({ phase: 'building', min: 14 })
    expect(phaseTime({ ...row, state: 'blocked' }, now)).toEqual({ phase: 'building', min: 14 })
    expect(phaseTime({ ...row, state: 'stalled', phase: 'review' }, now)).toEqual({ phase: 'review', min: 14 })
  })
  it('phaseTime: none for ended, lost, no phase, no start, a bad time', () => {
    expect(phaseTime({ ...row, state: 'ended' }, now)).toBeNull()
    expect(phaseTime({ ...row, state: 'lost' }, now)).toBeNull()
    expect(phaseTime({ ...row, phase: null }, now)).toBeNull()
    expect(phaseTime({ ...row, phaseSince: null }, now)).toBeNull()
    expect(phaseTime({ ...row, phaseSince: 'nope' }, now)).toBeNull()
  })
  it('phaseTime: a start after the page clock is 0, never below', () => {
    expect(phaseTime({ ...row, phaseSince: '2026-10-22T03:05:00.000Z' }, now)).toEqual({ phase: 'building', min: 0 })
  })
  it('stepTime: done from durationSec, current from at, the rest none', () => {
    const s = { step: 'building' as const, at: '2026-10-22T02:10:00.000Z', state: 'current' as const, durationSec: null }
    expect(stepTime(s, now)).toEqual({ min: 50, live: true })
    expect(stepTime({ ...s, state: 'done', durationSec: 67 * 60 + 59 }, now)).toEqual({ min: 67, live: false })
    expect(stepTime({ ...s, state: 'done', durationSec: null }, now)).toBeNull()
    expect(stepTime({ ...s, state: 'lost' }, now)).toBeNull()
    expect(stepTime({ ...s, state: 'waiting', at: null }, now)).toBeNull()
    expect(stepTime({ ...s, at: '2026-10-22T03:05:00.000Z' }, now)).toEqual({ min: 0, live: true })
    expect(stepTime({ ...s, step: 'pushed', state: 'done', durationSec: null }, now)).toBeNull()
  })
  it('says durations in words', () => {
    expect(spokenSeconds(31 * 60 + 7)).toBe('31 min 7 s')
    expect(spokenSeconds(3723)).toBe('1 h 2 min 3 s')
    expect(spokenSeconds(3600)).toBe('1 h')
    expect(spokenSeconds(0)).toBe('0 s')
    expect(spokenMinutes(14)).toBe('14 min')
    expect(spokenMinutes(67)).toBe('1 h 7 min')
    expect(spokenMinutes(60)).toBe('1 h')
    expect(spokenMinutes(0)).toBe('0 min')
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/utils/oc-format.test.ts`
Expected: FAIL (`phaseTime` is not exported).

- [ ] **Step 3: Implement**

Append to `scripts/nexus-web/app/utils/oc-format.ts`:

```ts
import type { RunDetail, RunRow } from '#oculus-schema'

const RUNNING = new Set(['healthy', 'blocked', 'stalled'])
const minutesSince = (iso: string, nowMs: number): number | null => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / 60_000)) : null
}
// The current phase and its whole minutes, for a running run only: an ended or lost run, or one with no phase, gets none (never a false number).
export function phaseTime(r: Pick<RunRow, 'state' | 'phase' | 'phaseSince'>, nowMs: number): { phase: string; min: number } | null {
  if (!RUNNING.has(r.state) || r.phase === null || r.phaseSince === null) return null
  const min = minutesSince(r.phaseSince, nowMs)
  return min === null ? null : { phase: r.phase, min }
}
// A done step's minutes come from the CLI; the current step counts on the page clock. Lost, waiting and Pushed get none.
export function stepTime(s: RunDetail['pipeline'][number], nowMs: number): { min: number; live: boolean } | null {
  if (s.state === 'current' && s.at !== null) {
    const min = minutesSince(s.at, nowMs)
    return min === null ? null : { min, live: true }
  }
  if (s.state === 'done' && s.durationSec !== null) return { min: Math.floor(s.durationSec / 60), live: false }
  return null
}
const words = (parts: [number, string][], zero: string): string => parts.filter(([n]) => n > 0).map(([n, u]) => `${n} ${u}`).join(' ') || zero
// Durations for screen readers: "31 min 7 s", "1 h 7 min"; the "·" and h:mm are not read out.
export function spokenSeconds(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0
  return words([[Math.floor(s / 3600), 'h'], [Math.floor((s % 3600) / 60), 'min'], [s % 60, 's']], '0 s')
}
export function spokenMinutes(min: number): string {
  const m = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0
  return words([[Math.floor(m / 60), 'h'], [m % 60, 'min']], '0 min')
}
```

Put the `import type` line at the top of the file with the other imports (the file has none today; a type-only import at the top is fine).

- [ ] **Step 4: Run to see it pass**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/utils/oc-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(oculus): add phase and step time helpers" -- scripts/nexus-web/app/utils/oc-format.ts scripts/nexus-web/app/utils/oc-format.test.ts
```

---

### Task 3: Runs table: the phase inside the Duration cell

Needs DGS-599 merged (`oc/RunsTable.vue`), Tasks 1 and 2.

**Files:**
- Modify: `scripts/nexus-web/app/components/oc/RunsTable.vue`
- Modify: `scripts/nexus-web/app/components/oc/RunsTable.stories.ts`
- Test: `scripts/nexus-web/app/components/oc/runs.test.ts`

**Interfaces:**
- Consumes: `phaseTime`, `spokenSeconds`, `spokenMinutes`, `fmtMinutes`, `fmtDuration` from `oc-format.ts`; `runsFixture()` from Task 1.
- Produces: Duration cell markup: `<td data-label="Duration" class="num"><span aria-hidden="true">…</span><span class="sr">…</span></td>`; the phase part is `<span class="phase">building 0:14</span>`. Task 5's e2e and axe checks read these.

- [ ] **Step 1: Write the failing test**

In `scripts/nexus-web/app/components/oc/runs.test.ts`, inside `describe('OcRunsTable')` (the component name may be imported as `RunsTable`; keep the file's own name), with `NOW = Date.parse('2026-10-22T03:00:00.000Z')`:

```ts
  it('the Duration cell carries the phase for a running run and the duration only otherwise', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: runsFixture().runs, nowMs: NOW } })
    const cells = w.findAll('td[data-label="Duration"]')
    expect(cells[0].find('[aria-hidden="true"]').text()).toBe('0:50:00 · building 0:14')
    expect(cells[0].find('.sr').text()).toBe('50 min, building for 14 min')
    expect(cells[1].find('[aria-hidden="true"]').text()).toBe('1:30:00 · review 1:30')
    expect(cells[2].find('[aria-hidden="true"]').text()).toBe('2:05:00')   // ended
    expect(cells[2].text()).not.toContain('·')
    expect(cells[3].find('[aria-hidden="true"]').text()).toBe('0:55:00')   // lost
    expect(w.findAll('th').map((t) => t.text())).not.toContain('Phase')
  })
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/components/oc/runs.test.ts`
Expected: FAIL (no `aria-hidden` span in the Duration cell).

- [ ] **Step 3: Implement**

In `oc/RunsTable.vue` `<script setup>`, import `fmtMinutes`, `phaseTime`, `spokenMinutes`, `spokenSeconds` from `../../utils/oc-format` beside the existing imports, and add under `duration`:

```ts
const totalSec = (r: RunRow, nowMs: number): number => (r.endedAt ? r.elapsedSec : Math.max(0, (nowMs - Date.parse(r.startedAt)) / 1000))
// "0:31:07 · building 0:14" on screen; screen readers get words, not the "·" and h:mm
const spoken = (r: RunRow, nowMs: number): string => {
  const p = phaseTime(r, nowMs)
  return p ? `${spokenSeconds(totalSec(r, nowMs))}, ${p.phase} for ${spokenMinutes(p.min)}` : spokenSeconds(totalSec(r, nowMs))
}
```

and change `duration` to `fmtDuration(totalSec(r, nowMs))` so both use one total. Replace the Duration cell:

```vue
        <td data-label="Duration" class="num">
          <span aria-hidden="true">{{ duration(r, nowMs) }}<template v-if="phaseTime(r, nowMs)"> · <span class="phase">{{ phaseTime(r, nowMs)!.phase }} {{ fmtMinutes(phaseTime(r, nowMs)!.min) }}</span></template></span>
          <span class="sr">{{ spoken(r, nowMs) }}</span>
        </td>
```

Add a scoped style so the phase part never breaks inside itself (on a phone it may wrap as a whole):

```vue
<style scoped lang="scss">
.phase { white-space: nowrap; }
</style>
```

(If the component already has a `<style>` block, add the rule there. The `.sr` class comes from `OcTable`'s unscoped `.oc-table .sr`.)

- [ ] **Step 4: Stories**

`oc/RunsTable.stories.ts`: the `Default` story already shows running, stalled, ended and lost rows. Add a story for a run whose phase start is after the page clock and one with no phase:

```ts
export const PhaseEdges = { args: { runs: [
  runFixture({ run: 'builder-skew', phaseSince: '2026-10-22T03:05:00.000Z' }),
  runFixture({ run: 'scout-1', role: 'scout', phase: null, phaseSince: null }),
], nowMs: NOW } }
```

(import `runFixture` beside `runsFixture`).

- [ ] **Step 5: Run to see it pass**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/components/oc/ tests/unit/stories.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(oculus): show the phase and its time in the runs duration cell" -- scripts/nexus-web/app/components/oc/RunsTable.vue scripts/nexus-web/app/components/oc/RunsTable.stories.ts scripts/nexus-web/app/components/oc/runs.test.ts
```

---

### Task 4: Run page phase strip: durations and the current step's counter

Needs DGS-599 merged (`oc/PipelineBar.vue`, `pages/oculus/run.vue`), Tasks 1 and 2.

**Files:**
- Modify: `scripts/nexus-web/app/components/oc/PipelineBar.vue`
- Modify: `scripts/nexus-web/app/components/oc/PipelineBar.stories.ts`
- Modify: `scripts/nexus-web/app/pages/oculus/run.vue`
- Test: `scripts/nexus-web/app/components/oc/runs.test.ts`

**Interfaces:**
- Consumes: `stepTime`, `spokenMinutes`, `fmtMinutes`, `fmtUtc7` from `oc-format.ts`; `useNow` from `app/utils/use-now.ts`; `runDetailFixture()` from Task 1.
- Produces: `OcPipelineBar` props `{ steps: RunDetail['pipeline']; nowMs: number }`; each `li` has `<small class="dur" aria-hidden="true">` (class `live` on the current step) and hidden text `<span class="sr"> (current, 50 min so far)</span>`. Task 5 reads these.

- [ ] **Step 1: Write the failing test**

In `runs.test.ts`, replace the existing `PipelineBar` test's mount props with `{ steps, nowMs: NOW }` and add:

```ts
  it('shows each done step's duration, the current step's time only, and words for screen readers', async () => {
    const w = await mountSuspended(PipelineBar, { props: { steps: runDetailFixture().pipeline, nowMs: NOW } })
    const dur = w.findAll('li .dur').map((d) => d.text())
    expect(dur).toEqual(['0:01', '0:00', '0:50', '-', '-', '-'])
    expect(w.findAll('li')[2].find('.dur').classes()).toContain('live')
    expect(w.text()).not.toContain('now')
    expect(w.findAll('li')[0].find('.sr').text()).toBe('(done, 1 min)')
    expect(w.findAll('li')[2].find('.sr').text()).toBe('(current, 50 min so far)')
    expect(w.findAll('li')[3].find('.sr').text()).toBe('(waiting)')
  })
  it('an ended run: Pushed shows no duration; a lost step shows the word lost and a dash', async () => {
    const ended = runDetailFixture().pipeline.map((s) => ({ ...s, at: s.at ?? '2026-10-22T02:59:00.000Z', state: 'done' as const, durationSec: s.step === 'pushed' ? null : 600 }))
    const e = await mountSuspended(PipelineBar, { props: { steps: ended, nowMs: NOW } })
    expect(e.findAll('li .dur').map((d) => d.text())).toEqual(['0:10', '0:10', '0:10', '0:10', '0:10', ''])
    const lost = runDetailFixture().pipeline.map((s) => (s.state === 'current' ? { ...s, state: 'lost' as const } : s))
    const l = await mountSuspended(PipelineBar, { props: { steps: lost, nowMs: NOW } })
    expect(l.findAll('li')[2].text()).toContain('lost')
    expect(l.findAll('li')[2].find('.dur').text()).toBe('-')
  })
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/components/oc/runs.test.ts`
Expected: FAIL (no `.dur`).

- [ ] **Step 3: Implement the strip**

`oc/PipelineBar.vue`:

```vue
<script setup lang="ts">
import type { RunDetail } from '#oculus-schema'
import { fmtMinutes, fmtUtc7, spokenMinutes, stepTime } from '../../utils/oc-format'

type Step = RunDetail['pipeline'][number]
defineProps<{ steps: RunDetail['pipeline']; nowMs: number }>()
const LABEL = { claimed: 'Claimed', 'worktree-ready': 'Worktree ready', building: 'Building', review: 'Review', merged: 'Merged', pushed: 'Pushed' } as const
// Pushed is the end mark: blank once reached, a dash before
const durText = (s: Step, nowMs: number): string => {
  const t = stepTime(s, nowMs)
  if (t) return fmtMinutes(t.min)
  return s.step === 'pushed' && s.state === 'done' ? '' : '-'
}
const srText = (s: Step, nowMs: number): string => {
  const t = stepTime(s, nowMs)
  if (!t) return `(${s.state})`
  return t.live ? `(${s.state}, ${spokenMinutes(t.min)} so far)` : `(${s.state}, ${spokenMinutes(t.min)})`
}
</script>

<template>
  <ol class="pipe" aria-label="Run pipeline, times UTC+7">
    <li v-for="s in steps" :key="s.step" :class="s.state">
      <i class="dot" aria-hidden="true" />{{ LABEL[s.step] }}
      <span class="sr"> {{ srText(s, nowMs) }}</span>
      <small>{{ fmtUtc7(s.at) }}</small>
      <small class="dur" :class="{ live: stepTime(s, nowMs)?.live }" aria-hidden="true">{{ durText(s, nowMs) }}</small>
      <b v-if="s.state === 'lost'" class="word">lost</b>
    </li>
  </ol>
</template>
```

Keep the existing `<style>` block and add:

```scss
.dur { min-height: 1.4em; }
.dur.live { color: var(--oc-info); font-weight: 600; }
```

(`--oc-info` passes 4.5:1 on every ground in the contrast test.)

- [ ] **Step 4: Pass the page clock**

`scripts/nexus-web/app/pages/oculus/run.vue`: add `import { useNow } from '../../utils/use-now'`, `const nowMs = useNow()` under the other refs, and change the strip to `<OcPipelineBar :steps="run.pipeline" :now-ms="nowMs" />` (keep the tag name main uses).

- [ ] **Step 5: Stories**

`oc/PipelineBar.stories.ts`:

```ts
const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const steps = runDetailFixture().pipeline
export const Running = { args: { steps, nowMs: NOW } }
export const Lost = { args: { steps: steps.map((s) => (s.state === 'current' ? { ...s, state: 'lost' as const } : s)), nowMs: NOW } }
export const Merged = { args: { nowMs: NOW, steps: [
  { step: 'claimed', at: '2026-10-22T02:04:00.000Z', state: 'done', durationSec: 60 },
  { step: 'worktree-ready', at: '2026-10-22T02:05:00.000Z', state: 'done', durationSec: 0 },
  { step: 'building', at: '2026-10-22T02:05:00.000Z', state: 'done', durationSec: 4020 },
  { step: 'review', at: '2026-10-22T03:12:00.000Z', state: 'done', durationSec: 3420 },
  { step: 'merged', at: '2026-10-22T04:09:00.000Z', state: 'done', durationSec: 60 },
  { step: 'pushed', at: '2026-10-22T04:10:00.000Z', state: 'done', durationSec: null },
] } }
export const Manual = { args: { nowMs: NOW, steps: steps.map((s) => (s.step === 'claimed' ? { ...s, at: null, state: 'waiting' as const, durationSec: null } : s)) } }
```

- [ ] **Step 6: Run to see it pass**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/components/oc/ app/pages tests/unit/stories.test.ts && pnpm --dir scripts/nexus-web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(oculus): show phase durations and a live counter on the run page strip" -- scripts/nexus-web/app/components/oc/PipelineBar.vue scripts/nexus-web/app/components/oc/PipelineBar.stories.ts scripts/nexus-web/app/pages/oculus/run.vue scripts/nexus-web/app/components/oc/runs.test.ts
```

---

### Task 5: Browser checks: e2e text, axe names, visual baselines

Needs DGS-599 merged (Oculus e2e, a11y and visual specs at the new paths), Tasks 3 and 4.

**Files:**
- Modify: `scripts/nexus-web/tests/e2e/oculus.spec.ts`
- Modify: `scripts/nexus-web/tests/a11y/oculus-axe.spec.ts`
- Update baselines: `scripts/nexus-web/tests/visual/**/__screenshots__/` (the Oculus mobile Runs baseline and the `OcRunsTable` / `OcPipelineBar` story baselines)

**Interfaces:**
- Consumes: the stub server in mode `oc-ok` with clock `2026-10-22T03:00:00Z` (the spec's `beforeEach`), fixtures from Task 1, markup from Tasks 3 and 4.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing e2e checks**

In `tests/e2e/oculus.spec.ts`:

```ts
test('Runs: the Duration cell shows the running phase and its time', async ({ page }) => {
  await page.goto(`${stub.url}/runs/`)
  const first = page.locator('tbody tr').first().locator('td[data-label="Duration"]')
  await expect(first.locator('[aria-hidden="true"]')).toHaveText('0:50:00 · building 0:14')
  await expect(page.locator('thead th', { hasText: /^Phase$/ })).toHaveCount(0)
})

test('Run page: the strip shows durations and the current step in the info color', async ({ page }) => {
  await page.goto(`${stub.url}/run/?id=builder-20261022T021000-a1b2c3`)
  const steps = page.getByRole('list', { name: /pipeline/i }).locator('li')
  await expect(steps.nth(0).locator('.dur')).toHaveText('0:01')
  await expect(steps.nth(2).locator('.dur')).toHaveText('0:50')
  await expect(steps.nth(2).locator('.dur')).toHaveClass(/live/)
  await expect(page.getByRole('list', { name: /pipeline/i })).not.toContainText('now')
})
```

- [ ] **Step 2: Write the failing axe check**

In `tests/a11y/oculus-axe.spec.ts`:

```ts
test('the Duration cell and the strip read times in words', async ({ page }) => {
  await page.goto(`${stub.url}/runs/`)
  const cell = page.locator('tbody tr').first().getByRole('cell').filter({ has: page.locator('.sr') }).first()
  await expect(cell.locator('.sr')).toHaveText('50 min, building for 14 min')
  await page.goto(`${stub.url}/run/?id=builder-20261022T021000-a1b2c3`)
  const strip = page.getByRole('list', { name: /pipeline/i })
  await expect(strip.locator('li').nth(2).locator('.sr')).toHaveText('(current, 50 min so far)')
  await expect(strip.locator('li').nth(0).locator('.sr')).toHaveText('(done, 1 min)')
})
```

Use the spec's own stub start and clock setup (copy them from the top of the file; the clock must be `2026-10-22T03:00:00Z`). The existing axe scan of `/runs/` and `/run/?id=…` stays and must still report no violations.

- [ ] **Step 3: Run to see them fail, then pass**

Run: `pnpm --dir scripts/nexus-web e2e -g "Duration cell|strip shows durations"` and `pnpm --dir scripts/nexus-web a11y`
Expected after Tasks 3 and 4 are in: PASS. If they fail, fix the markup, not the expected text.

- [ ] **Step 4: Update the visual baselines**

Run: `pnpm --dir scripts/nexus-web exec nuxt generate && pnpm --dir scripts/nexus-web build-storybook && pnpm --dir scripts/nexus-web visual:update`
Then: `git status --short scripts/nexus-web/tests/visual` must list only the Oculus mobile Runs baseline, the `OcRunsTable` story baselines (Default, PhaseEdges, light and dark) and the `OcPipelineBar` story baselines (Running, Lost, Merged, Manual, light and dark). Open each changed image and check: the Duration cell reads `0:50:00 · building 0:14` (the phone card shows both parts in the Duration row), the strip shows a duration line under each time and the current step in the info color. Any other changed image: stop and find out why before you commit.

- [ ] **Step 5: Run the visual suite clean**

Run: `pnpm --dir scripts/nexus-web visual`
Expected: PASS with no diffs.

- [ ] **Step 6: Commit**

```bash
git add scripts/nexus-web/tests/visual
git commit -m "test(oculus): check the phase times in the browser and update the baselines" -- scripts/nexus-web/tests/e2e/oculus.spec.ts scripts/nexus-web/tests/a11y/oculus-axe.spec.ts scripts/nexus-web/tests/visual
```

---

## First use (after the merge, the conductor's step)

The usual Oculus publish: CLI build in the main checkout, a restart of the existing Nexus API LaunchAgent, `build-www.sh`. No Caddy, DNS or LaunchAgent change. Then, while a Builder runs: `oculus.pazurite.com/runs/` shows `<total> · building h:mm` in that Builder's Duration cell, equal to the budget bar on its run page; the run page's strip shows durations on done steps and the current step's time in the info color; an ended run's strip shows all its durations.
