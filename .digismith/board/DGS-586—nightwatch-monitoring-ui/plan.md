# Nightwatch monitoring UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only Nightwatch dashboard (Operations, Attention, Runs, Run detail, Plan) in the Nexus web app, fed by new `/api/v1/nightwatch/` routes that run the built CLI.

**Architecture:** A new `dg nightwatch view <name> --json` command in `packages/cli` calls the existing Nightwatch readers and prints one JSON document. The Nexus API spawns the built CLI (`<main checkout>/packages/cli/dist/index.js`, like the job registry since DGS-587), caches the answer for 5 s and checks it with zod schemas from `scripts/nexus-shared/nightwatch.ts`. The Nuxt app gets static pages under `/nightwatch/` that poll every 10 s.

**Tech Stack:** Node 24 with `--experimental-strip-types`, TypeScript, yargs, Hono, zod 4.6.7, Nuxt 4.6.1, Vue 3.5, Storybook 10, Vitest 5, Playwright 1.64.1, axe, pnpm.

Spec: `.digismith/board/DGS-586—nightwatch-monitoring-ui/design.html`. Layout mock: `mock.html` beside it. Read both first.

## Global Constraints

- Read-only everywhere. No route, command or page writes, deletes or creates a file or folder. GET only; other methods answer 405 with `Allow: GET`.
- The API never imports from `packages/cli`. It spawns `process.execPath` with `[<MAIN_CHECKOUT>/packages/cli/dist/index.js, 'nightwatch', 'view', ...]` (argument array, no shell). `MAIN_CHECKOUT` is `join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith')`, the same constant as `scripts/nexus-api/src/scheduler/registry.ts`.
- Code in `packages/cli/src/` runs under `node --experimental-strip-types` (the DGS-587 smoke test strips every file): no parameter properties, no enums, no namespaces. Double quotes and semicolons in `packages/cli`. Single quotes and no semicolons in `scripts/nexus-api`, `scripts/nexus-shared` and `scripts/nexus-web`.
- `scripts/nexus-shared/nightwatch.ts` imports only `zod`. The CLI does not import it. A contract test in `scripts/nexus-api` checks that the CLI view output parses with the schemas.
- Run ids and ticket keys must match `^[A-Za-z0-9][A-Za-z0-9._-]*$` (`isSafe` in `packages/cli/src/run/paths.ts`) before they are used in a path or a command line. A bad value gives 400 `bad_request`; the answer never echoes the input.
- Errors carry codes only: `bad_request`, `not_found`, `method_not_allowed`, `reader_unavailable`, `internal_invalid`. Never an error message. Nothing prints a token, a key, or a `.env` value.
- Event rows show only `ts`, `seq`, `type` and these `data` keys when the value is a string, number, boolean or null: `tool`, `ok`, `kind`, `reason`, `source`, `phase`, `session_id` is NOT shown.
- Event cursor is a line count, not `seq` (the run record says `seq` can repeat). `since=N` returns lines whose 1-based line number is greater than N.
- Route paths: `/api/v1/nightwatch/overview`, `/attention`, `/runs`, `/runs/:id`, `/runs/:id/events`, `/plan/:ticket`.
- Caches: 5 s per view and argument set. One in-flight spawn per view and argument set. Spawn timeout 8 s. Browser poll 10 s, back off to 30 s after a failed fetch, pause while the tab is hidden.
- Watchdog budgets come from `readBudgets(cwd)` (`packages/cli/src/autonomous/budgets.ts`); pane state passed to `classify` is always `"unknown"` (the UI never touches herdr).
- Phase table window: 7 days. The table states "one claimed ticket at a time (scan lock)" and "window: 7 days" on screen. Seat windows, token burn and token columns are out of scope; slots show "-" with the title "not measured".
- No login in v1; tailnet-only like the Life Calendar. No Caddy change.
- Warren tokens go in `scripts/nexus-web/app/assets/nightwatch-tokens.scss` with the MIT notice (`Copyright (c) 2026 Jaymin West`, permission text, source URL). No Warren component code. No CDN fonts: stacks `system-ui` and `ui-monospace`.
- Times shown to the user are UTC+7, written "HH:MM" or "YYYY-MM-DD HH:MM". Files and JSON keep ISO UTC.
- Gates for the web app: Storybook story per component and state, visual baselines (light and dark), Playwright e2e, axe (both themes), Vitest unit tests, the built-page tests. Contrast tokens pass WCAG AA.
- Write only inside this worktree. No push, no merge, no ClickUp write, no real depot, no real API (4300), no herdr, no sudo, no launchctl. pnpm only; never `pnpm install` in the depot clone. Tests use temp folders and fakes.
- Commits are title-only, conventional, no AI attribution. Commit with a pathspec.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/nexus-shared/nightwatch.ts` (+ `.test.ts`) | zod schemas and types of every Nightwatch answer |
| `packages/cli/src/nightwatch/types.ts` | plain TS types of the view output (mirror of the schemas) |
| `packages/cli/src/nightwatch/derive.ts` (+ test) | pure helpers: trigger, health row, phase table, pipeline, event groups, plan parsing |
| `packages/cli/src/nightwatch/fixture.test-util.ts` | builds a fake depot in a temp folder |
| `packages/cli/src/nightwatch/views.ts` (+ test) | the six view builders over the real readers |
| `packages/cli/src/nightwatch/index.ts` (+ test) | yargs group `nightwatch view` |
| `scripts/nexus-api/src/nightwatch-reader.ts` (+ test) | spawn, single flight, cache, timeout |
| `scripts/nexus-api/src/nightwatch-route.ts` (+ test) | Hono routes, validation, Nexus health |
| `scripts/nexus-api/src/nightwatch-contract.test.ts` | CLI output parses with the shared schemas |
| `scripts/nexus-web/app/assets/nightwatch-tokens.scss` | Warren tokens (MIT) scoped to `.nw` |
| `scripts/nexus-web/app/composables/useNightwatchPoll.ts`, `nightwatch-api.ts` | polling and typed loaders |
| `scripts/nexus-web/app/components/nw/*` | shell, top bar, tables, panels, event stream, pipeline |
| `scripts/nexus-web/app/pages/*` | `index.vue` (Life Calendar, moved) and `nightwatch/*.vue` |

---

### Task 1: Shared schemas

**Files:**
- Create: `scripts/nexus-shared/nightwatch.ts`
- Test: `scripts/nexus-shared/nightwatch.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `scripts/nexus-shared/nightwatch.ts`):
  - consts `HEALTH`, `ROLES`, `TRIGGERS`, `TICKET_PHASES`, `EVENT_GROUPS`, `NIGHTWATCH_ERROR_CODES`
  - schemas `runRowSchema`, `eventRowSchema`, `overviewViewSchema`, `overviewSchema`, `attentionSchema`, `runsSchema`, `runDetailSchema`, `eventsSchema`, `planSchema`, `nightwatchErrorSchema`
  - types `RunRow`, `EventRow`, `Overview`, `Attention`, `Runs`, `RunDetail`, `Events`, `Plan`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/nexus-shared/nightwatch.test.ts
import { describe, expect, it } from 'vitest'
import { eventRowSchema, nightwatchErrorSchema, overviewSchema, planSchema, runRowSchema, runsSchema } from './nightwatch.ts'

const row = { run: 'builder-20261022T010000-a1b2c3', ticket: 'DGS-590', role: 'builder', seat: 'dev0', model: null, trigger: 'night-scan', state: 'healthy', phase: 'building', startedAt: '2026-10-22T01:00:00.000Z', endedAt: null, elapsedSec: 60, events: 3, merged: false, pushed: false }

describe('nightwatch schemas', () => {
  it('accepts a run row and refuses an unknown key', () => {
    expect(runRowSchema.safeParse(row).success).toBe(true)
    expect(runRowSchema.safeParse({ ...row, prompt: 'x' }).success).toBe(false)
  })
  it('refuses a bad state, role or trigger', () => {
    expect(runRowSchema.safeParse({ ...row, state: 'sleeping' }).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, role: 'boss' }).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, trigger: 'cron' }).success).toBe(false)
  })
  it('an event row only carries scalar data', () => {
    const ev = { n: 1, seq: 1, ts: '2026-10-22T01:00:00.000Z', type: 'tool', groups: ['agent'], data: { tool: 'Edit', ok: true } }
    expect(eventRowSchema.safeParse(ev).success).toBe(true)
    expect(eventRowSchema.safeParse({ ...ev, data: { tool: { nested: 1 } } }).success).toBe(false)
  })
  it('the overview adds the nexus block to the view', () => {
    const view = {
      readAt: '2026-10-22T01:00:00.000Z', workers: [row], attentionCount: 0,
      tickets: { windowDays: 7, lockTicket: null, rows: [{ phase: 'building', count: 1, oldestSince: '2026-10-22T01:00:00.000Z' }] },
      lastEvents: [{ ts: '2026-10-22T01:00:00.000Z', source: 'DGS-590', kind: 'tool', text: 'tool Edit ok' }],
      scan: { lastScanAt: null, candidates: null, away: false, nightWindow: false, breakerOpen: false, breakerStreak: 0 },
    }
    expect(overviewSchema.safeParse({ ...view, nexus: { status: 'healthy', reasons: [] } }).success).toBe(true)
    expect(overviewSchema.safeParse({ ...view, nexus: { status: 'unknown', reasons: ['x never ran'] } }).success).toBe(true)
    expect(overviewSchema.safeParse({ ...view, nexus: { status: 'bogus', reasons: [] } }).success).toBe(false)
    expect(overviewSchema.safeParse(view).success).toBe(false)
  })
  it('runs, plan and error shapes', () => {
    expect(runsSchema.safeParse({ readAt: '2026-10-22T01:00:00.000Z', total: 1, runs: [row] }).success).toBe(true)
    expect(planSchema.safeParse({ ticket: 'DGS-590', found: false, planFile: null, tasksTotal: 0, tasksDone: 0, tasks: [], verdicts: [], ledgerError: false }).success).toBe(true)
    expect(nightwatchErrorSchema.safeParse({ error: 'reader_unavailable' }).success).toBe(true)
    expect(nightwatchErrorSchema.safeParse({ error: 'boom' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/nexus-shared/nightwatch.test.ts`
Expected: FAIL, cannot find `./nightwatch.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/nexus-shared/nightwatch.ts
import { z } from 'zod'

const iso = z.string()
const count = z.number().int().min(0)

export const HEALTH = ['healthy', 'blocked', 'stalled', 'lost', 'ended'] as const
export const ROLES = ['builder', 'reviewer', 'scout', 'other'] as const
export const TRIGGERS = ['manual', 'night-scan', 'away', 'unknown'] as const
export const TICKET_PHASES = ['claimed', 'building', 'review', 'merge-ready', 'merged', 'released', 'lost'] as const
export const EVENT_GROUPS = ['all', 'agent', 'system', 'errors'] as const
export const NIGHTWATCH_ERROR_CODES = ['bad_request', 'not_found', 'method_not_allowed', 'reader_unavailable', 'internal_invalid'] as const

export const runRowSchema = z.strictObject({
  run: z.string(), ticket: z.string(), role: z.enum(ROLES),
  seat: z.string().nullable(), model: z.string().nullable(),
  trigger: z.enum(TRIGGERS), state: z.enum(HEALTH),
  phase: z.enum(['building', 'review', 'merge']).nullable(),
  startedAt: iso, endedAt: iso.nullable(), elapsedSec: count, events: count,
  merged: z.boolean(), pushed: z.boolean(),
})
export type RunRow = z.infer<typeof runRowSchema>

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const eventRowSchema = z.strictObject({
  n: count, seq: count, ts: iso, type: z.string(),
  groups: z.array(z.enum(['agent', 'system', 'errors'])),
  data: z.record(z.string(), scalar),
})
export type EventRow = z.infer<typeof eventRowSchema>

export const overviewViewSchema = z.strictObject({
  readAt: iso,
  workers: z.array(runRowSchema),
  attentionCount: count,
  tickets: z.strictObject({
    windowDays: z.number().int(),
    lockTicket: z.string().nullable(),
    rows: z.array(z.strictObject({ phase: z.enum(TICKET_PHASES), count, oldestSince: iso.nullable() })),
  }),
  lastEvents: z.array(z.strictObject({ ts: iso, source: z.string(), kind: z.string(), text: z.string() })),
  scan: z.strictObject({
    lastScanAt: iso.nullable(), candidates: count.nullable(), away: z.boolean(),
    nightWindow: z.boolean(), breakerOpen: z.boolean(), breakerStreak: count,
  }),
})
export const overviewSchema = overviewViewSchema.extend({
  nexus: z.strictObject({ status: z.enum(['healthy', 'degraded', 'unknown', 'breaker-open']), reasons: z.array(z.string()) }),
})
export type Overview = z.infer<typeof overviewSchema>

export const attentionItemSchema = z.strictObject({
  id: z.string(), ticket: z.string().nullable(), run: z.string(), kind: z.string(), cause: z.string(),
  since: iso, causeClass: z.enum(['transient', 'durable', 'unknown']).nullable(), retryEligible: z.boolean().nullable(),
})
export const attentionSchema = z.strictObject({
  readAt: iso,
  open: z.array(attentionItemSchema),
  resolved: z.array(z.strictObject({ id: z.string(), ticket: z.string().nullable(), kind: z.string(), by: z.string(), ts: iso, note: z.string() })),
})
export type Attention = z.infer<typeof attentionSchema>

export const runsSchema = z.strictObject({ readAt: iso, total: count, runs: z.array(runRowSchema) })
export type Runs = z.infer<typeof runsSchema>

export const pipelineStepSchema = z.strictObject({
  step: z.enum(['claimed', 'worktree-ready', 'building', 'review', 'merged', 'pushed']),
  at: iso.nullable(), state: z.enum(['done', 'current', 'waiting', 'lost']),
})
export const runDetailSchema = z.strictObject({
  readAt: iso,
  row: runRowSchema,
  pipeline: z.array(pipelineStepSchema),
  budget: z.strictObject({ phase: z.enum(['building', 'review', 'merge']).nullable(), limitMin: count.nullable(), elapsedMin: count.nullable(), building: count, review: count, merge: count }),
  record: z.record(z.string(), z.unknown()),
  order: z.strictObject({ available: z.boolean(), text: z.string() }),
})
export type RunDetail = z.infer<typeof runDetailSchema>

export const eventsSchema = z.strictObject({ run: z.string(), total: count, from: count, lines: z.array(eventRowSchema) })
export type Events = z.infer<typeof eventsSchema>

export const planSchema = z.strictObject({
  ticket: z.string(), found: z.boolean(), planFile: z.string().nullable(),
  tasksTotal: count, tasksDone: count,
  tasks: z.array(z.strictObject({ n: count, title: z.string(), state: z.enum(['done', 'fix-round', 'waiting']), round: count.nullable() })),
  verdicts: z.array(z.strictObject({ scope: z.string(), id: z.string(), round: count, finding: z.string(), verdict: z.enum(['fixed', 'fixing', 'parked', 'rejected']), reason: z.string() })),
  ledgerError: z.boolean(),
})
export type Plan = z.infer<typeof planSchema>

export const nightwatchErrorSchema = z.strictObject({ error: z.enum(NIGHTWATCH_ERROR_CODES), message: z.string().optional() })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/nexus-shared/nightwatch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/nexus-shared/nightwatch.ts scripts/nexus-shared/nightwatch.test.ts
git commit -m "feat(nightwatch): add the shared schemas of the monitoring UI" -- scripts/nexus-shared/nightwatch.ts scripts/nexus-shared/nightwatch.test.ts
```

---

### Task 2: Pure derivations and the fake depot

**Files:**
- Create: `packages/cli/src/nightwatch/types.ts`, `packages/cli/src/nightwatch/derive.ts`, `packages/cli/src/nightwatch/fixture.test-util.ts`
- Test: `packages/cli/src/nightwatch/derive.test.ts`

**Interfaces:**
- Consumes: `EventLine` (`../run/events.ts`), `RunRecord` (`../run/record.ts`), `Event` and `Away` (`../autonomous/types.ts`), `classify`, `phaseOf`, `Budgets` (`../autonomous/watchdog.ts`), `summarize` (`../run/read.ts`).
- Produces (`derive.ts`):
  - `triggerOf(run: RunRecord, claim: Event | null, away: Away | null): Trigger`
  - `groupsOf(e: { type: string; data: Record<string, unknown> }): EventGroup[]`
  - `scalarData(data: Record<string, unknown>): Record<string, string | number | boolean | null>`
  - `runRowOf(run: RunRecord, events: EventLine[], trigger: Trigger, budgets: Budgets, nowMs: number): RunRowView`
  - `pipelineOf(run: RunRecord, events: EventLine[], claimAt: string | null, state: Health): PipelineStep[]`
  - `parsePlanTasks(planText: string): { n: number; title: string }[]`
  - `ledgerTasks(ledger: string, tasks: { n: number; title: string }[]): PlanTask[]`
  - `phaseTable(args: { lock: Lock | null; releases: Event[]; lostOpen: { since: string }[]; nowMs: number }): PhaseRow[]`
  - `isAutonomousOrder(order: string | null): boolean`
- `fixture.test-util.ts` produces `makeDepot(): Depot` with `Depot = { dir: string; env: NodeJS.ProcessEnv; autonomous: string; writeRun(r: FakeRun): string; writeEvents(ticket: string, run: string, lines: FakeEvent[]): void; writeJournal(lines: object[]): void; writeAttention(lines: object[]): void; writeAutonomousEvent(day: string, ev: object): void; cleanup(): void }`. `FakeRun = { ticket: string; run: string; role: RunRecord["role"]; created_at: string; order?: string | null; seat?: string | null; model?: string | null; worktree?: string | null; branch?: string | null }`; `FakeEvent = { type: string; ts: string; data?: Record<string, unknown> }`.

- [ ] **Step 1: Write the types and the fake depot**

```ts
// packages/cli/src/nightwatch/types.ts
export type Health = "healthy" | "blocked" | "stalled" | "lost" | "ended";
export type Trigger = "manual" | "night-scan" | "away" | "unknown";
export type EventGroup = "agent" | "system" | "errors";
export type RunPhase = "building" | "review" | "merge";
export type TicketPhase = "claimed" | "building" | "review" | "merge-ready" | "merged" | "released" | "lost";
export type Scalar = string | number | boolean | null;

export interface RunRowView {
  run: string; ticket: string; role: "builder" | "reviewer" | "scout" | "other";
  seat: string | null; model: string | null; trigger: Trigger; state: Health; phase: RunPhase | null;
  startedAt: string; endedAt: string | null; elapsedSec: number; events: number; merged: boolean; pushed: boolean;
}
export interface EventRowView { n: number; seq: number; ts: string; type: string; groups: EventGroup[]; data: Record<string, Scalar> }
export interface PipelineStep { step: "claimed" | "worktree-ready" | "building" | "review" | "merged" | "pushed"; at: string | null; state: "done" | "current" | "waiting" | "lost" }
export interface PhaseRow { phase: TicketPhase; count: number; oldestSince: string | null }
export interface PlanTask { n: number; title: string; state: "done" | "fix-round" | "waiting"; round: number | null }
```

```ts
// packages/cli/src/nightwatch/fixture.test-util.ts
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "../run/record.ts";

export interface FakeRun { ticket: string; run: string; role: RunRecord["role"]; created_at: string; order?: string | null; seat?: string | null; model?: string | null; worktree?: string | null; branch?: string | null }
export interface FakeEvent { type: string; ts: string; data?: Record<string, unknown> }
export interface Depot {
  dir: string; env: NodeJS.ProcessEnv; autonomous: string;
  writeRun(r: FakeRun): string;
  writeEvents(ticket: string, run: string, lines: FakeEvent[]): void;
  writeJournal(lines: object[]): void;
  writeAttention(lines: object[]): void;
  writeAutonomousEvent(day: string, ev: object): void;
  cleanup(): void;
}

export function makeDepot(): Depot {
  const dir = mkdtempSync(join(tmpdir(), "nw-depot-"));
  const autonomous = join(dir, "autonomous");
  mkdirSync(autonomous, { recursive: true });
  const env = { DIGISMITH_DEPOT_DIR: dir, AUTONOMOUS_DIR: autonomous } as NodeJS.ProcessEnv;
  const jsonl = (file: string, lines: object[]): void => writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return {
    dir, env, autonomous,
    writeRun(r) {
      const d = join(dir, "runs", r.ticket, r.run);
      mkdirSync(d, { recursive: true });
      const rec: RunRecord = {
        schema: "nightwatch-run/v1", run: r.run, ticket: r.ticket, role: r.role, order: r.order ?? null, seat: r.seat ?? null,
        model: r.model ?? null, plugin_version: null, base_sha: null, branch: r.branch ?? null, worktree: r.worktree ?? null,
        herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: r.created_at,
      };
      writeFileSync(join(d, "run.json"), JSON.stringify(rec));
      return d;
    },
    writeEvents(ticket, run, lines) {
      const d = join(dir, "runs", ticket, run);
      jsonl(join(d, "events.jsonl"), lines.map((l, i) => ({ schema: "nightwatch-event/v1", seq: i + 1, ts: l.ts, run, type: l.type, data: l.data ?? {} })));
    },
    writeJournal: (lines) => jsonl(join(autonomous, "journal.jsonl"), lines),
    writeAttention: (lines) => jsonl(join(autonomous, "attention.jsonl"), lines),
    writeAutonomousEvent(day, ev) { appendFileSync(join(autonomous, `events-${day}.jsonl`), `${JSON.stringify(ev)}\n`); },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/cli/src/nightwatch/derive.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGETS } from "../autonomous/watchdog.ts";
import type { EventLine } from "../run/events.ts";
import type { RunRecord } from "../run/record.ts";
import { groupsOf, isAutonomousOrder, ledgerTasks, parsePlanTasks, phaseTable, pipelineOf, runRowOf, scalarData, triggerOf } from "./derive.ts";

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  schema: "nightwatch-run/v1", run: "builder-1", ticket: "DGS-590", role: "builder", order: null, seat: "dev0", model: "sonnet-5-5",
  plugin_version: null, base_sha: null, branch: "b", worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null,
  created_at: "2026-10-22T01:00:00.000Z", ...over,
});
const ev = (seq: number, type: string, ts: string, data: Record<string, unknown> = {}): EventLine => ({ schema: "nightwatch-event/v1", seq, ts, run: "builder-1", type, data });
const T0 = Date.parse("2026-10-22T01:00:00.000Z");

describe("triggerOf", () => {
  it("is manual for an order outside the autonomous folder", () => {
    expect(triggerOf(run({ order: "/x/order-nw-07.md" }), null, null)).toBe("manual");
  });
  it("is night-scan for an autonomous order", () => {
    expect(triggerOf(run({ order: "/d/orders/order-ao-2026-10-22-0310-DGS-590.md" }), null, null)).toBe("night-scan");
  });
  it("is away when away.json was on at the claim time", () => {
    const claim = { ts: "2026-10-22T01:00:00.000Z", tsUtc7: "", kind: "claim" as const, ticket: "DGS-590" };
    const away = { away: true, since: "2026-10-21T15:00:00.000Z", until: null, endedAt: null };
    expect(triggerOf(run({ order: "/d/orders/order-ao-x-DGS-590.md" }), claim, away)).toBe("away");
  });
  it("is unknown when the run has no order", () => {
    expect(triggerOf(run({ order: null }), null, null)).toBe("unknown");
  });
  it("isAutonomousOrder looks at the file name only", () => {
    expect(isAutonomousOrder("/a/order-ao-1.md")).toBe(true);
    expect(isAutonomousOrder("/order-ao-dir/order-nw-07.md")).toBe(false);
  });
});

describe("groupsOf and scalarData", () => {
  it("groups the event types", () => {
    expect(groupsOf({ type: "tool", data: { ok: true } })).toEqual(["agent"]);
    expect(groupsOf({ type: "tool", data: { ok: false } })).toEqual(["agent", "errors"]);
    expect(groupsOf({ type: "turn_end", data: {} })).toEqual(["agent"]);
    expect(groupsOf({ type: "blocked", data: {} })).toEqual(["errors"]);
    expect(groupsOf({ type: "lost", data: {} })).toEqual(["system", "errors"]);
    expect(groupsOf({ type: "phase", data: {} })).toEqual(["system"]);
  });
  it("keeps only the listed scalar keys", () => {
    expect(scalarData({ tool: "Edit", ok: true, session_id: "s", prompt: "secret", phase: { a: 1 } })).toEqual({ tool: "Edit", ok: true });
  });
});

describe("runRowOf", () => {
  it("a fresh builder is healthy and building", () => {
    const r = runRowOf(run(), [ev(1, "started", "2026-10-22T01:00:00.000Z")], "manual", DEFAULT_BUDGETS, T0 + 60_000);
    expect(r).toMatchObject({ state: "healthy", phase: "building", elapsedSec: 60, merged: false, pushed: false, endedAt: null });
  });
  it("a builder over its budget is stalled", () => {
    const r = runRowOf(run(), [ev(1, "started", "2026-10-22T01:00:00.000Z"), ev(2, "tool", "2026-10-22T01:50:00.000Z", { tool: "Edit", ok: true })], "manual", DEFAULT_BUDGETS, T0 + 51 * 60_000);
    expect(r.state).toBe("stalled");
  });
  it("an ended run has its end time, a merged flag and a frozen elapsed time", () => {
    const events = [ev(1, "started", "2026-10-22T01:00:00.000Z"), ev(2, "merged", "2026-10-22T01:30:00.000Z"), ev(3, "pushed", "2026-10-22T01:31:00.000Z"), ev(4, "ended", "2026-10-22T01:32:00.000Z")];
    const r = runRowOf(run(), events, "manual", DEFAULT_BUDGETS, T0 + 5 * 3600_000);
    expect(r).toMatchObject({ state: "ended", merged: true, pushed: true, endedAt: "2026-10-22T01:32:00.000Z", elapsedSec: 32 * 60 });
  });
});

describe("pipelineOf", () => {
  it("marks done steps, the current one and the waiting ones", () => {
    const events = [ev(1, "started", "2026-10-22T01:01:00.000Z"), ev(2, "phase", "2026-10-22T01:02:00.000Z", { phase: "building" })];
    const p = pipelineOf(run(), events, "2026-10-22T00:59:00.000Z", "healthy");
    expect(p.map((s) => [s.step, s.state])).toEqual([
      ["claimed", "done"], ["worktree-ready", "done"], ["building", "current"], ["review", "waiting"], ["merged", "waiting"], ["pushed", "waiting"],
    ]);
    expect(p[0].at).toBe("2026-10-22T00:59:00.000Z");
  });
  it("a lost run turns the current step lost; a manual run has no claim time", () => {
    const p = pipelineOf(run(), [ev(1, "started", "2026-10-22T01:01:00.000Z"), ev(2, "lost", "2026-10-22T01:20:00.000Z")], null, "lost");
    expect(p[0]).toMatchObject({ step: "claimed", at: null });
    expect(p.find((s) => s.state === "lost")?.step).toBe("building");
  });
});

describe("plan parsing", () => {
  const plan = "# P\n### Task 1: Schema\ntext\n### Task 2: Reader\n### Task 3: Route\n";
  it("reads the task headings", () => {
    expect(parsePlanTasks(plan)).toEqual([{ n: 1, title: "Schema" }, { n: 2, title: "Reader" }, { n: 3, title: "Route" }]);
  });
  it("reads the ledger: complete, fix round, waiting", () => {
    const ledger = "# SDD ledger — plan: x\nReview mode: hand\nTask 1: complete\nTask 2: fix round 1/5\nTask 2: fix round 2/5\n";
    expect(ledgerTasks(ledger, parsePlanTasks(plan))).toEqual([
      { n: 1, title: "Schema", state: "done", round: null },
      { n: 2, title: "Reader", state: "fix-round", round: 2 },
      { n: 3, title: "Route", state: "waiting", round: null },
    ]);
  });
});

describe("phaseTable", () => {
  it("counts the lock phase, the releases of the window and the open lost items", () => {
    const lock = { ticket: "DGS-590", taskId: "t", claimedAt: "2026-10-22T01:00:00.000Z", claimedAtUtc7: "", order: "", scanId: "", phase: "building", phaseStartedAt: "2026-10-22T01:05:00.000Z" };
    const releases = [
      { ts: "2026-10-21T01:00:00.000Z", tsUtc7: "", kind: "release" as const, ticket: "A-1", result: "merged" },
      { ts: "2026-10-21T02:00:00.000Z", tsUtc7: "", kind: "release" as const, ticket: "A-2", result: "failed" },
      { ts: "2026-10-21T03:00:00.000Z", tsUtc7: "", kind: "release" as const, ticket: "A-3", result: "stopped" },
    ];
    const rows = phaseTable({ lock, releases, lostOpen: [{ since: "2026-10-22T00:00:00.000Z" }], nowMs: T0 });
    const by = Object.fromEntries(rows.map((r) => [r.phase, r]));
    expect(rows.map((r) => r.phase)).toEqual(["claimed", "building", "review", "merge-ready", "merged", "released", "lost"]);
    expect(by.building).toEqual({ phase: "building", count: 1, oldestSince: "2026-10-22T01:05:00.000Z" });
    expect(by.merged.count).toBe(1);
    expect(by.released.count).toBe(3);
    expect(by.lost).toEqual({ phase: "lost", count: 1, oldestSince: "2026-10-22T00:00:00.000Z" });
    expect(by.claimed.count).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/nightwatch/derive.test.ts`
Expected: FAIL, cannot find `./derive.ts`.

- [ ] **Step 4: Write the implementation**

```ts
// packages/cli/src/nightwatch/derive.ts
import { basename } from "node:path";
import type { Away, Event, Lock } from "../autonomous/types.ts";
import { classify, phaseOf } from "../autonomous/watchdog.ts";
import type { Budgets } from "../autonomous/watchdog.ts";
import type { EventLine } from "../run/events.ts";
import type { RunRecord } from "../run/record.ts";
import { summarize } from "../run/read.ts";
import type { EventGroup, Health, PhaseRow, PipelineStep, PlanTask, RunRowView, Scalar, TicketPhase, Trigger } from "./types.ts";

const SHOWN_KEYS = ["tool", "ok", "kind", "reason", "source", "phase"];
const ms = (iso: string): number => Date.parse(iso);

/** A run started by the night scan has an order file named order-ao-*. The name decides; the folder does not. */
export function isAutonomousOrder(order: string | null): boolean {
  return order !== null && basename(order).startsWith("order-ao-");
}

export function triggerOf(run: RunRecord, claim: Event | null, away: Away | null): Trigger {
  if (run.order === null) return "unknown";
  if (!isAutonomousOrder(run.order)) return "manual";
  if (claim !== null && away !== null && away.away) {
    const at = ms(claim.ts);
    const since = away.since === "" ? Number.NEGATIVE_INFINITY : ms(away.since);
    const ended = away.endedAt === null ? Number.POSITIVE_INFINITY : ms(away.endedAt);
    if (at >= since && at < ended) return "away";
  }
  return "night-scan";
}

export function groupsOf(e: { type: string; data: Record<string, unknown> }): EventGroup[] {
  const out: EventGroup[] = [];
  if (e.type === "tool" || e.type === "turn_end") out.push("agent");
  if (["started", "ended", "phase", "review_ready", "merged", "pushed", "lost"].includes(e.type)) out.push("system");
  if (e.type === "blocked" || e.type === "lost" || (e.type === "tool" && e.data.ok === false)) out.push("errors");
  return out;
}

export function scalarData(data: Record<string, unknown>): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const k of SHOWN_KEYS) {
    const v = data[k];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

export function runRowOf(run: RunRecord, events: EventLine[], trigger: Trigger, budgets: Budgets, nowMs: number): RunRowView {
  const verdict = classify(run, events, "unknown", nowMs, budgets);
  const state: Health = verdict.state;
  const sum = summarize(events);
  const startedAt = events.find((e) => e.type === "started")?.ts ?? run.created_at;
  const endedAt = state === "ended" ? (sum.last_ts ?? null) : null;
  const stop = endedAt !== null ? ms(endedAt) : nowMs;
  const p = state === "ended" ? null : phaseOf(run, events);
  return {
    run: run.run, ticket: run.ticket, role: run.role, seat: run.seat, model: run.model, trigger, state,
    phase: p?.phase ?? null, startedAt, endedAt, elapsedSec: Math.max(0, Math.round((stop - ms(startedAt)) / 1000)),
    events: events.length, merged: events.some((e) => e.type === "merged"), pushed: events.some((e) => e.type === "pushed"),
  };
}

export function pipelineOf(run: RunRecord, events: EventLine[], claimAt: string | null, state: Health): PipelineStep[] {
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
  return order.map((step, i) => {
    let s: PipelineStep["state"] = "waiting";
    if (i < reached) s = "done";
    else if (i === reached) s = state === "ended" ? "done" : state === "lost" ? "lost" : "current";
    if (step === "claimed" && at.claimed === null) s = "waiting";
    return { step, at: at[step], state: s };
  });
}

export function parsePlanTasks(planText: string): { n: number; title: string }[] {
  const out: { n: number; title: string }[] = [];
  for (const m of planText.matchAll(/^### Task (\d+):[ \t]*(.+?)[ \t]*$/gm)) out.push({ n: Number(m[1]), title: m[2] });
  return out;
}

export function ledgerTasks(ledger: string, tasks: { n: number; title: string }[]): PlanTask[] {
  const done = new Set<number>();
  const rounds = new Map<number, number>();
  for (const line of ledger.split(/\r?\n/)) {
    const c = /^Task (\d+): complete\b/.exec(line.trim().replace(/^- /, ""));
    if (c) done.add(Number(c[1]));
    const f = /^Task (\d+): fix round (\d+)\/\d+/.exec(line.trim().replace(/^- /, ""));
    if (f) rounds.set(Number(f[1]), Math.max(rounds.get(Number(f[1])) ?? 0, Number(f[2])));
  }
  return tasks.map((t) => {
    if (done.has(t.n)) return { ...t, state: "done", round: null };
    const r = rounds.get(t.n);
    return r === undefined ? { ...t, state: "waiting", round: null } : { ...t, state: "fix-round", round: r };
  });
}

const WINDOW_MS = 7 * 24 * 3600_000;
const LOCK_PHASES: TicketPhase[] = ["claimed", "building", "review", "merge-ready"];

export function phaseTable(a: { lock: Lock | null; releases: Event[]; lostOpen: { since: string }[]; nowMs: number }): PhaseRow[] {
  const rows: PhaseRow[] = (["claimed", "building", "review", "merge-ready", "merged", "released", "lost"] as TicketPhase[]).map((phase) => ({ phase, count: 0, oldestSince: null }));
  const row = (p: TicketPhase): PhaseRow => rows.find((r) => r.phase === p) as PhaseRow;
  // The scan lock holds one ticket at a time, so these four phases hold at most one ticket.
  const lp = a.lock?.phase;
  if (a.lock !== null && lp !== undefined && (LOCK_PHASES as string[]).includes(lp)) {
    row(lp as TicketPhase).count = 1;
    row(lp as TicketPhase).oldestSince = a.lock.phaseStartedAt ?? a.lock.claimedAt;
  }
  const inWindow = a.releases.filter((e) => e.kind === "release" && a.nowMs - ms(e.ts) <= WINDOW_MS);
  row("released").count = inWindow.length;
  row("merged").count = inWindow.filter((e) => e.result === "merged").length;
  const oldestLost = a.lostOpen.map((l) => l.since).sort()[0];
  row("lost").count = a.lostOpen.length;
  row("lost").oldestSince = oldestLost ?? null;
  return rows;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/nightwatch/derive.test.ts`
Expected: PASS. If `pipelineOf` fails on the lost case, fix the code, not the test: the lost state marks the furthest reached step.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/nightwatch
git commit -m "feat(nightwatch): add the pure derivations and the fake depot" -- packages/cli/src/nightwatch
```

---

### Task 3: The six view builders

**Files:**
- Create: `packages/cli/src/nightwatch/views.ts`
- Test: `packages/cli/src/nightwatch/views.test.ts`

**Interfaces:**
- Consumes: Task 2 (`derive.ts`, `types.ts`, `makeDepot`); readers `listRuns`, `showRun` (`../run/read.ts`), `readEvents`, `EventLine` (`../run/events.ts`), `findRunDir`, `isSafe` (`../run/paths.ts`), `readOpen` (`../autonomous/attention.ts`), `readLock`, `readEvents as readScanEvents`, `newestEvent`, `autonomousDir` (`../autonomous/state.ts`), `readAway` (`../autonomous/away.ts`), `readBreaker` (`../autonomous/breaker.ts`), `readJournal` (`../autonomous/journal.ts`), `readBudgets` (`../autonomous/budgets.ts`), `inNightWindow` (`../autonomous/clock.ts`), `findWorkspace` (`../autonomous/observers-real.ts`), `parseVerdictEntries` (`../reviewer/verdicts.ts`).
- Produces (`views.ts`), every builder takes `(env: NodeJS.ProcessEnv, now: Date, args)` and returns a plain object matching the Task 1 schema:
  - `overviewView(env, now)`
  - `attentionView(env, now)`
  - `runsView(env, now, args: { state?: string; role?: string; ticket?: string; trigger?: string; limit?: number })`
  - `runView(env, now, args: { run: string; cwd?: string })` returns `null` when the run does not exist
  - `eventsView(env, args: { run: string; since?: number; before?: number; tail?: number; group?: string })` returns `null` when the run does not exist
  - `planView(env, args: { ticket: string })`
  - `VIEW_NAMES` = `["overview", "attention", "runs", "run", "events", "plan"]`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/nightwatch/views.test.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDepot, type Depot } from "./fixture.test-util.ts";
import { attentionView, eventsView, overviewView, planView, runsView, runView } from "./views.ts";

const NOW = new Date("2026-10-22T03:00:00.000Z");
let d: Depot;
beforeEach(() => { d = makeDepot(); });
afterEach(() => d.cleanup());

const seedRun = (run = "builder-1", ticket = "DGS-590", order = "/d/orders/order-ao-2026-10-22-0910-DGS-590.md"): void => {
  d.writeRun({ ticket, run, role: "builder", created_at: "2026-10-22T02:20:00.000Z", order, seat: "dev0", model: "sonnet-5-5" });
  d.writeEvents(ticket, run, [
    { type: "started", ts: "2026-10-22T02:20:00.000Z", data: { source: "startup", session_id: "S1" } },
    { type: "tool", ts: "2026-10-22T02:59:00.000Z", data: { tool: "Edit", ok: true, session_id: "S1" } },
  ]);
};

describe("an empty depot", () => {
  it("every view answers with empty data", () => {
    const o = overviewView(d.env, NOW);
    expect(o.workers).toEqual([]);
    expect(o.attentionCount).toBe(0);
    expect(o.tickets.rows).toHaveLength(7);
    expect(o.scan).toMatchObject({ lastScanAt: null, candidates: null, breakerOpen: false });
    expect(attentionView(d.env, NOW)).toMatchObject({ open: [], resolved: [] });
    expect(runsView(d.env, NOW, {})).toMatchObject({ total: 0, runs: [] });
    expect(runView(d.env, NOW, { run: "nope-1" })).toBeNull();
    expect(eventsView(d.env, { run: "nope-1" })).toBeNull();
    expect(planView(d.env, { ticket: "DGS-590" })).toMatchObject({ found: false, tasks: [] });
  });
});

describe("overview", () => {
  it("lists the open worker, the scan facts and the last events", () => {
    seedRun();
    d.writeAutonomousEvent("2026-10-22", { ts: "2026-10-22T02:10:00.000Z", tsUtc7: "", kind: "scan", candidates: 5, skipped: 0, claimed: "DGS-590" });
    d.writeAutonomousEvent("2026-10-22", { ts: "2026-10-22T02:10:01.000Z", tsUtc7: "", kind: "claim", ticket: "DGS-590", order: "/d/orders/order-ao-2026-10-22-0910-DGS-590.md" });
    const o = overviewView(d.env, NOW);
    expect(o.workers.map((w) => w.run)).toEqual(["builder-1"]);
    expect(o.workers[0]).toMatchObject({ state: "healthy", trigger: "night-scan", phase: "building" });
    expect(o.scan).toMatchObject({ lastScanAt: "2026-10-22T02:10:00.000Z", candidates: 5 });
    expect(o.lastEvents[0]).toMatchObject({ source: "DGS-590" });
    expect(o.lastEvents.length).toBeLessThanOrEqual(20);
  });
  it("counts open attention items and an open breaker", () => {
    d.writeAttention([{ schema: "nightwatch-attention/v1", id: "r.lost.1", ts: "2026-10-22T01:00:00.000Z", ticket: "DGS-588", run: "r", kind: "lost", cause: "silent-30-min", since: "2026-10-22T00:30:00.000Z" }]);
    writeFileSync(join(d.autonomous, "breaker.json"), JSON.stringify({ open: true, streak: 2, failed: ["A-1", "A-2"], openedAt: "2026-10-22T01:00:00.000Z" }));
    const o = overviewView(d.env, NOW);
    expect(o.attentionCount).toBe(1);
    expect(o.tickets.rows.find((r) => r.phase === "lost")?.count).toBe(1);
    expect(o.scan).toMatchObject({ breakerOpen: true, breakerStreak: 2 });
  });
  it("skips a run whose files are broken", () => {
    seedRun();
    mkdirSync(join(d.dir, "runs", "DGS-1", "broken"), { recursive: true });
    writeFileSync(join(d.dir, "runs", "DGS-1", "broken", "run.json"), "{ not json");
    expect(overviewView(d.env, NOW).workers).toHaveLength(1);
  });
});

describe("attention", () => {
  it("returns open items oldest first and the last resolved ones", () => {
    d.writeAttention([
      { schema: "nightwatch-attention/v1", id: "a", ts: "2026-10-22T01:00:00.000Z", ticket: "T-1", run: "r1", kind: "stalled", cause: "building-over-45-min", since: "2026-10-22T00:00:00.000Z", causeClass: "unknown" },
      { schema: "nightwatch-attention/v1", id: "b", ts: "2026-10-22T02:00:00.000Z", ticket: "T-2", run: "r2", kind: "lost", cause: "pane-gone", since: "2026-10-22T01:30:00.000Z", causeClass: "transient", retryEligible: true },
      { schema: "nightwatch-attention/v1", id: "c", ts: "2026-10-22T02:30:00.000Z", ticket: "T-3", run: "r3", kind: "blocked", cause: "waiting-for-answer", since: "2026-10-22T02:00:00.000Z" },
      { schema: "nightwatch-attention/v1", id: "c", ts: "2026-10-22T02:40:00.000Z", resolved: true, by: "watchdog", note: "tool seen" },
    ]);
    const a = attentionView(d.env, NOW);
    expect(a.open.map((i) => i.id)).toEqual(["a", "b"]);
    expect(a.open[1]).toMatchObject({ causeClass: "transient", retryEligible: true });
    expect(a.open[0]).toMatchObject({ retryEligible: null });
    expect(a.resolved).toEqual([{ id: "c", ticket: "T-3", kind: "blocked", by: "watchdog", ts: "2026-10-22T02:40:00.000Z", note: "tool seen" }]);
  });
});

describe("runs", () => {
  it("filters by state, role, ticket and trigger and caps the rows", () => {
    seedRun("builder-1", "DGS-590");
    d.writeRun({ ticket: "DGS-591", run: "reviewer-1", role: "reviewer", created_at: "2026-10-22T02:30:00.000Z", order: "/x/order-nw-1.md" });
    d.writeEvents("DGS-591", "reviewer-1", [{ type: "started", ts: "2026-10-22T02:30:00.000Z" }, { type: "ended", ts: "2026-10-22T02:40:00.000Z", data: { reason: "other" } }]);
    expect(runsView(d.env, NOW, {}).total).toBe(2);
    expect(runsView(d.env, NOW, { role: "reviewer" }).runs.map((r) => r.run)).toEqual(["reviewer-1"]);
    expect(runsView(d.env, NOW, { state: "ended" }).runs.map((r) => r.run)).toEqual(["reviewer-1"]);
    expect(runsView(d.env, NOW, { ticket: "DGS-590" }).runs.map((r) => r.run)).toEqual(["builder-1"]);
    expect(runsView(d.env, NOW, { trigger: "manual" }).runs.map((r) => r.run)).toEqual(["reviewer-1"]);
    const capped = runsView(d.env, NOW, { limit: 1 });
    expect(capped.runs).toHaveLength(1);
    expect(capped.total).toBe(2);
  });
});

describe("run and events", () => {
  it("the run view has the pipeline, the budget, the record and an order that is not available", () => {
    seedRun();
    const r = runView(d.env, NOW, { run: "builder-1", cwd: d.dir });
    expect(r?.row.run).toBe("builder-1");
    expect(r?.pipeline).toHaveLength(6);
    expect(r?.budget).toMatchObject({ phase: "building", limitMin: 45, building: 45, review: 60, merge: 20 });
    expect(r?.record.ticket).toBe("DGS-590");
    expect(r?.order).toEqual({ available: false, text: "" });
  });
  it("reads an order inside the sessions folder and refuses one outside", () => {
    const orders = join(d.dir, "sessions", "DigiSmith", "orders");
    mkdirSync(orders, { recursive: true });
    writeFileSync(join(orders, "o1.md"), "Build it.");
    d.writeRun({ ticket: "DGS-590", run: "builder-2", role: "builder", created_at: "2026-10-22T02:20:00.000Z", order: join(orders, "o1.md") });
    d.writeRun({ ticket: "DGS-590", run: "builder-3", role: "builder", created_at: "2026-10-22T02:21:00.000Z", order: "/etc/hosts" });
    expect(runView(d.env, NOW, { run: "builder-2" })?.order).toEqual({ available: true, text: "Build it." });
    expect(runView(d.env, NOW, { run: "builder-3" })?.order.available).toBe(false);
  });
  it("events: line-count cursor, tail, before and groups; a repeated seq is tolerated", () => {
    seedRun();
    const run = "builder-1";
    const lines = Array.from({ length: 10 }, (_, i) => ({ type: i === 5 ? "blocked" : "tool", ts: `2026-10-22T02:${String(30 + i).padStart(2, "0")}:00.000Z`, data: { tool: "Edit", ok: true } }));
    d.writeEvents("DGS-590", run, lines);
    const all = eventsView(d.env, { run });
    expect(all).toMatchObject({ total: 10, from: 0 });
    expect(all?.lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(eventsView(d.env, { run, since: 8 })?.lines.map((l) => l.n)).toEqual([9, 10]);
    expect(eventsView(d.env, { run, tail: 3 })?.lines.map((l) => l.n)).toEqual([8, 9, 10]);
    expect(eventsView(d.env, { run, tail: 3, before: 8 })?.lines.map((l) => l.n)).toEqual([5, 6, 7]);
    expect(eventsView(d.env, { run, group: "errors" })?.lines.map((l) => l.n)).toEqual([6]);
    expect(eventsView(d.env, { run, group: "agent" })?.lines).toHaveLength(9);
  });
  it("events show no prompt or session id", () => {
    seedRun();
    const e = eventsView(d.env, { run: "builder-1" });
    expect(JSON.stringify(e)).not.toMatch(/session_id|S1/);
  });
});

describe("plan", () => {
  it("reads the workspace of the ticket's builder worktree", () => {
    const wt = join(d.dir, "wt");
    const ws = join(wt, ".digismith", "board", "DGS-590—x", ".sdd-workspace");
    mkdirSync(ws, { recursive: true });
    const planFile = join(wt, ".digismith", "board", "DGS-590—x", "plan.md");
    writeFileSync(planFile, "### Task 1: Schema\n### Task 2: Reader\n");
    writeFileSync(join(ws, "progress.md"), `# SDD ledger — plan: ${planFile}\nReview mode: hand\nTask 1: complete\nReview task 1 r1: F1 -> fixed\nReview task 2 r1: F1 -> parked (later ticket)\n`);
    d.writeRun({ ticket: "DGS-590", run: "builder-1", role: "builder", created_at: "2026-10-22T02:20:00.000Z", worktree: wt });
    const p = planView(d.env, { ticket: "DGS-590" });
    expect(p).toMatchObject({ found: true, tasksTotal: 2, tasksDone: 1, ledgerError: false });
    expect(p.tasks.map((t) => t.state)).toEqual(["done", "waiting"]);
    expect(p.verdicts).toEqual([
      { scope: "task", id: "1", round: 1, finding: "F1", verdict: "fixed", reason: "" },
      { scope: "task", id: "2", round: 1, finding: "F1", verdict: "parked", reason: "later ticket" },
    ]);
  });
  it("a ledger line that does not parse sets ledgerError and keeps the tasks", () => {
    const wt = join(d.dir, "wt2");
    const ws = join(wt, ".digismith", "board", "DGS-591—x", ".sdd-workspace");
    mkdirSync(ws, { recursive: true });
    const planFile = join(wt, ".digismith", "board", "DGS-591—x", "plan.md");
    writeFileSync(planFile, "### Task 1: A\n");
    writeFileSync(join(ws, "progress.md"), `# SDD ledger — plan: ${planFile}\nTask 1: complete\nReview task 1 r1: garbage\n`);
    d.writeRun({ ticket: "DGS-591", run: "builder-9", role: "builder", created_at: "2026-10-22T02:20:00.000Z", worktree: wt });
    const p = planView(d.env, { ticket: "DGS-591" });
    expect(p).toMatchObject({ found: true, ledgerError: true, verdicts: [] });
    expect(p.tasks[0].state).toBe("done");
  });
  it("refuses a plan file outside the worktree", () => {
    const wt = join(d.dir, "wt3");
    const ws = join(wt, ".digismith", "board", "DGS-592—x", ".sdd-workspace");
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "progress.md"), "# SDD ledger — plan: /etc/hosts\n");
    d.writeRun({ ticket: "DGS-592", run: "builder-8", role: "builder", created_at: "2026-10-22T02:20:00.000Z", worktree: wt });
    expect(planView(d.env, { ticket: "DGS-592" })).toMatchObject({ found: true, planFile: null, tasks: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/nightwatch/views.test.ts`
Expected: FAIL, cannot find `./views.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/cli/src/nightwatch/views.ts
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readOpen } from "../autonomous/attention.ts";
import { readAway } from "../autonomous/away.ts";
import { readBreaker } from "../autonomous/breaker.ts";
import { readBudgets } from "../autonomous/budgets.ts";
import { inNightWindow } from "../autonomous/clock.ts";
import { readJournal } from "../autonomous/journal.ts";
import { findWorkspace } from "../autonomous/observers-real.ts";
import { autonomousDir, newestEvent, readEvents as readScanEvents, readLock } from "../autonomous/state.ts";
import type { Event } from "../autonomous/types.ts";
import { DEFAULT_BUDGETS } from "../autonomous/watchdog.ts";
import { parseVerdictEntries } from "../reviewer/verdicts.ts";
import { readEvents, type EventLine } from "../run/events.ts";
import { depotDir, findRunDir, isSafe } from "../run/paths.ts";
import { readRun, type RunRecord } from "../run/record.ts";
import { listRuns } from "../run/read.ts";
import { groupsOf, ledgerTasks, parsePlanTasks, phaseTable, pipelineOf, runRowOf, scalarData, triggerOf } from "./derive.ts";
import type { EventRowView, RunRowView } from "./types.ts";

export const VIEW_NAMES = ["overview", "attention", "runs", "run", "events", "plan"] as const;
const DAY_MS = 24 * 3600_000;
const ORDER_MAX = 64 * 1024;

interface Loaded { record: RunRecord; events: EventLine[] }

function loadAll(env: NodeJS.ProcessEnv, ticket?: string): Loaded[] {
  const out: Loaded[] = [];
  for (const row of listRuns(env, ticket)) {
    const dir = findRunDir(row.record.run, env);
    if (dir === null) continue;
    out.push({ record: row.record, events: readEvents(dir) });
  }
  return out;
}

function claimFor(adir: string, run: RunRecord): Event | null {
  const created = Date.parse(run.created_at);
  const found = readScanEvents(adir, created - 2 * DAY_MS, created + DAY_MS).filter((e) => e.kind === "claim" && e.ticket === run.ticket && (e.order === run.order || run.order === null));
  return found.length === 0 ? null : found[found.length - 1];
}

function rowsOf(env: NodeJS.ProcessEnv, now: Date, loaded: Loaded[]): RunRowView[] {
  const adir = autonomousDir(env);
  const away = readAway(adir);
  const budgets = readBudgets(depotCwd(env)).budgets;
  return loaded.map((l) => runRowOf(l.record, l.events, triggerOf(l.record, claimFor(adir, l.record), away), budgets, now.getTime()));
}

// config.yml is read from the main checkout's .digismith, like the watchdog; the depot is not a checkout, so a missing file means defaults.
const depotCwd = (env: NodeJS.ProcessEnv): string => env.NIGHTWATCH_CONFIG_CWD ?? depotDir(env);

export function overviewView(env: NodeJS.ProcessEnv, now: Date) {
  const adir = autonomousDir(env);
  const rows = rowsOf(env, now, loadAll(env));
  const workers = rows.filter((r) => r.state === "healthy" || r.state === "blocked" || r.state === "stalled");
  const open = readOpen(adir);
  const releases = readScanEvents(adir, now.getTime() - 8 * DAY_MS, now.getTime() + DAY_MS).filter((e) => e.kind === "release");
  const lock = readLock(adir);
  const lastScan = newestEvent(adir, ["scan"]);
  const away = readAway(adir);
  const breaker = readBreaker(adir);
  const scanFacts = readScanEvents(adir, now.getTime() - DAY_MS, now.getTime() + DAY_MS).filter((e) => e.kind === "claim" || e.kind === "release" || e.kind === "breaker").map((e) => ({ ts: e.ts, source: "scan", kind: e.kind, text: `${e.kind} ${String(e.ticket ?? "")}`.trim() }));
  const runFacts = workers.flatMap((w) => {
    const l = loadAll(env, w.ticket).find((x) => x.record.run === w.run);
    return (l?.events ?? []).slice(-20).map((e) => ({ ts: e.ts, source: w.ticket, kind: e.type, text: eventText(e) }));
  });
  const lastEvents = [...scanFacts, ...runFacts].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)).slice(0, 20);
  return {
    readAt: now.toISOString(),
    workers,
    attentionCount: open.length,
    tickets: { windowDays: 7, lockTicket: lock?.ticket ?? null, rows: phaseTable({ lock, releases, lostOpen: open.filter((i) => i.kind === "lost"), nowMs: now.getTime() }) },
    lastEvents,
    scan: {
      lastScanAt: lastScan?.ts ?? null,
      candidates: typeof lastScan?.candidates === "number" ? lastScan.candidates : null,
      away: away !== null && away.away,
      nightWindow: inNightWindow(now),
      breakerOpen: breaker.open,
      breakerStreak: breaker.streak,
    },
  };
}

function eventText(e: EventLine): string {
  const d = scalarData(e.data);
  const bits = Object.entries(d).map(([k, v]) => (k === "tool" ? `${String(v)}` : `${k}=${String(v)}`));
  return [e.type, ...bits].join(" ");
}

export function attentionView(env: NodeJS.ProcessEnv, now: Date) {
  const adir = autonomousDir(env);
  const open = readOpen(adir).map((i) => ({
    id: i.id, ticket: i.ticket, run: i.run, kind: i.kind, cause: i.cause, since: i.since,
    causeClass: i.causeClass ?? null, retryEligible: i.retryEligible ?? null,
  }));
  const raw = readAttentionLines(adir);
  const byId = new Map(raw.filter((l) => l.resolved !== true).map((l) => [String(l.id), l]));
  const resolved = raw.filter((l) => l.resolved === true).slice(-20).reverse().map((l) => {
    const first = byId.get(String(l.id));
    return { id: String(l.id), ticket: typeof first?.ticket === "string" ? first.ticket : null, kind: String(first?.kind ?? ""), by: String(l.by ?? ""), ts: String(l.ts ?? ""), note: String(l.note ?? "") };
  });
  return { readAt: now.toISOString(), open, resolved };
}

function readAttentionLines(adir: string): Record<string, unknown>[] {
  let text = "";
  try { text = readFileSync(join(adir, "attention.jsonl"), "utf-8"); } catch { return []; }
  const out: Record<string, unknown>[] = [];
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    try { const o = JSON.parse(l) as Record<string, unknown>; if (typeof o.id === "string") out.push(o); } catch { /* skip */ }
  }
  return out;
}

export function runsView(env: NodeJS.ProcessEnv, now: Date, a: { state?: string; role?: string; ticket?: string; trigger?: string; limit?: number }) {
  let rows = rowsOf(env, now, loadAll(env, a.ticket));
  if (a.state) rows = rows.filter((r) => r.state === a.state);
  if (a.role) rows = rows.filter((r) => r.role === a.role);
  if (a.trigger) rows = rows.filter((r) => r.trigger === a.trigger);
  const limit = Math.min(Math.max(a.limit ?? 100, 1), 500);
  return { readAt: now.toISOString(), total: rows.length, runs: rows.slice(0, limit) };
}

function readOrder(env: NodeJS.ProcessEnv, order: string | null): { available: boolean; text: string } {
  const none = { available: false, text: "" };
  if (order === null || !isAbsolute(order)) return none;
  try {
    const real = realpathSync(order);
    const roots = [join(depotDir(env), "sessions"), autonomousDir(env)].flatMap((r) => { try { return [realpathSync(r)]; } catch { return []; } });
    if (!roots.some((r) => real === r || real.startsWith(r + sep))) return none;
    if (!statSync(real).isFile() || statSync(real).size > ORDER_MAX) return none;
    return { available: true, text: readFileSync(real, "utf8") };
  } catch { return none; }
}

export function runView(env: NodeJS.ProcessEnv, now: Date, a: { run: string; cwd?: string }) {
  if (!isSafe(a.run)) return null;
  const dir = findRunDir(a.run, env);
  if (dir === null) return null;
  let record: RunRecord;
  try { record = readRun(dir); } catch { return null; }
  const loaded: Loaded = { record, events: readEvents(dir) };
  const row = rowsOf(env, now, [loaded])[0];
  const adir = autonomousDir(env);
  const claim = readJournal(adir).find((l) => l.status === "planned" && l.key === `${record.ticket}:claimed:1:claim`);
  const budgets = readBudgets(a.cwd ?? depotCwd(env)).budgets;
  const phase = row.phase;
  const since = phase === null ? null : loaded.events.filter((e) => e.type === "phase" && e.data.phase === phase).map((e) => e.ts).pop() ?? row.startedAt;
  return {
    readAt: now.toISOString(),
    row,
    pipeline: pipelineOf(record, loaded.events, claim?.ts ?? null, row.state),
    budget: {
      phase, limitMin: phase === null ? null : budgets[phase],
      elapsedMin: since === null ? null : Math.max(0, Math.round((now.getTime() - Date.parse(since)) / 60_000)),
      building: budgets.building ?? DEFAULT_BUDGETS.building, review: budgets.review, merge: budgets.merge,
    },
    record: record as unknown as Record<string, unknown>,
    order: readOrder(env, record.order),
  };
}

export function eventsView(env: NodeJS.ProcessEnv, a: { run: string; since?: number; before?: number; tail?: number; group?: string }) {
  if (!isSafe(a.run)) return null;
  const dir = findRunDir(a.run, env);
  if (dir === null) return null;
  const all = readEvents(dir);
  const group = a.group === "agent" || a.group === "system" || a.group === "errors" ? a.group : "all";
  let lines: EventRowView[] = all.map((e, i) => ({ n: i + 1, seq: e.seq, ts: e.ts, type: e.type, groups: groupsOf(e), data: scalarData(e.data) }));
  if (group !== "all") lines = lines.filter((l) => l.groups.includes(group));
  const since = a.since ?? 0;
  lines = lines.filter((l) => l.n > since && (a.before === undefined || l.n < a.before));
  if (a.tail !== undefined) lines = lines.slice(-a.tail);
  return { run: a.run, total: all.length, from: since, lines };
}

function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function planView(env: NodeJS.ProcessEnv, a: { ticket: string }) {
  const empty = { ticket: a.ticket, found: false, planFile: null as string | null, tasksTotal: 0, tasksDone: 0, tasks: [] as ReturnType<typeof ledgerTasks>, verdicts: [] as { scope: string; id: string; round: number; finding: string; verdict: "fixed" | "fixing" | "parked" | "rejected"; reason: string }[], ledgerError: false };
  if (!isSafe(a.ticket)) return empty;
  const builder = listRuns(env, a.ticket).find((r) => r.record.role === "builder" && r.record.worktree);
  const wt = builder?.record.worktree;
  if (!wt) return empty;
  const ws = findWorkspace(wt, a.ticket);
  if (ws === null) return empty;
  let ledger = "";
  try { ledger = readFileSync(join(ws, "progress.md"), "utf8"); } catch { return empty; }
  const out = { ...empty, found: true };
  const first = /^# SDD ledger — plan: (.+)$/m.exec(ledger);
  if (first) {
    const file = resolve(wt, first[1].trim());
    if (inside(resolve(wt), file) && existsSync(file)) {
      out.planFile = file;
      try { out.tasks = ledgerTasks(ledger, parsePlanTasks(readFileSync(file, "utf8"))); } catch { /* unreadable plan: no tasks */ }
    }
  }
  out.tasksTotal = out.tasks.length;
  out.tasksDone = out.tasks.filter((t) => t.state === "done").length;
  try {
    out.verdicts = parseVerdictEntries(ledger).map((v) => ({ scope: v.kind, id: v.id, round: v.round, finding: v.finding, verdict: v.verdict, reason: v.reason }));
  } catch { out.ledgerError = true; }
  void dirname;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/nightwatch/views.test.ts`
Expected: PASS. Fix the code, not the tests. Two known traps: the `readScanEvents` window must stay under 400 days; `DEFAULT_BUDGETS.building` is a number, so the `??` on `budgets.building` can be dropped if the type checker says it is never nullish. Remove the unused `dirname` import and the `void dirname;` line before committing.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/nightwatch/views.ts packages/cli/src/nightwatch/views.test.ts
git commit -m "feat(nightwatch): add the six read-only view builders" -- packages/cli/src/nightwatch/views.ts packages/cli/src/nightwatch/views.test.ts
```

---

### Task 4: The `dg nightwatch view` command

**Files:**
- Create: `packages/cli/src/nightwatch/index.ts`, `packages/cli/src/nightwatch/README.md`
- Modify: `packages/cli/src/index.ts` (import and register, next to `autonomousCommand` at line 16 and 42), `packages/cli/src/strip-types.smoke.test.ts` (one added case)
- Test: `packages/cli/src/nightwatch/index.test.ts`

**Interfaces:**
- Consumes: Task 3 builders and `VIEW_NAMES`.
- Produces: default export `nightwatchCommand: CommandModule` (`nightwatch view <name> [--run ID] [--ticket KEY] [--since N] [--before N] [--tail N] [--group G] [--state S] [--role R] [--trigger T] [--limit N] --json`). Prints one JSON line to stdout and exits 0. Exit 1 on an unknown view, an unsafe id, or an unknown run/ticket for `run` and `events`; the message goes to stderr, never stdout. `runView` and `eventsView` returning `null` exit 1 with stderr `not found`. Also exports `runNightwatch(argv: string[], env: NodeJS.ProcessEnv, now: Date): { code: number; out: string; err: string }` (argv is what follows `nightwatch`), which the test calls.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/nightwatch/index.test.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDepot, type Depot } from "./fixture.test-util.ts";
import { runNightwatch } from "./index.ts";

const exec = promisify(execFile);
const NOW = new Date("2026-10-22T03:00:00.000Z");
let d: Depot;
beforeEach(() => { d = makeDepot(); });
afterEach(() => d.cleanup());

describe("runNightwatch", () => {
  it("prints one JSON document for each view and exits 0", () => {
    for (const name of ["overview", "attention", "runs"]) {
      const r = runNightwatch(["view", name], d.env, NOW);
      expect(r.code).toBe(0);
      expect(r.err).toBe("");
      expect(() => JSON.parse(r.out)).not.toThrow();
      expect(r.out.trim().split("\n")).toHaveLength(1);
    }
    expect(runNightwatch(["view", "plan", "--ticket", "DGS-590"], d.env, NOW).code).toBe(0);
  });
  it("exits 1 for an unknown view, an unsafe id, a missing run, a missing ticket flag", () => {
    expect(runNightwatch(["view", "nope"], d.env, NOW)).toMatchObject({ code: 1, out: "" });
    expect(runNightwatch(["view", "run", "--run", "../x"], d.env, NOW)).toMatchObject({ code: 1, out: "" });
    expect(runNightwatch(["view", "run", "--run", "nope-1"], d.env, NOW)).toMatchObject({ code: 1, err: "not found\n" });
    expect(runNightwatch(["view", "events", "--run", "nope-1"], d.env, NOW).code).toBe(1);
    expect(runNightwatch(["view", "plan"], d.env, NOW).code).toBe(1);
  });
  it("passes the filters through", () => {
    d.writeRun({ ticket: "DGS-590", run: "builder-1", role: "builder", created_at: "2026-10-22T02:20:00.000Z", order: "/x/order-nw.md" });
    d.writeEvents("DGS-590", "builder-1", [{ type: "started", ts: "2026-10-22T02:20:00.000Z" }]);
    expect(JSON.parse(runNightwatch(["view", "runs", "--role", "reviewer"], d.env, NOW).out).total).toBe(0);
    expect(JSON.parse(runNightwatch(["view", "runs", "--role", "builder"], d.env, NOW).out).total).toBe(1);
  });
  it("creates nothing in an empty depot", () => {
    runNightwatch(["view", "overview"], d.env, NOW);
    expect(require("node:fs").readdirSync(d.dir).sort()).toEqual(["autonomous"]);
  });
});

describe("the real entry", () => {
  it("runs under --experimental-strip-types", async () => {
    const entry = new URL("../index.ts", import.meta.url).pathname;
    const { stdout } = await exec(process.execPath, ["--experimental-strip-types", entry, "nightwatch", "view", "overview"], { env: { ...process.env, ...d.env } });
    expect(JSON.parse(stdout).tickets.windowDays).toBe(7);
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/nightwatch/index.test.ts`
Expected: FAIL, cannot find `./index.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/cli/src/nightwatch/index.ts
import type { CommandModule } from "yargs";
import { isSafe } from "../run/paths.ts";
import { attentionView, eventsView, overviewView, planView, runsView, runView, VIEW_NAMES } from "./views.ts";

export interface Result { code: number; out: string; err: string }
const ok = (v: unknown): Result => ({ code: 0, out: `${JSON.stringify(v)}\n`, err: "" });
const fail = (err: string): Result => ({ code: 1, out: "", err: `${err}\n` });

function num(argv: string[], flag: string): number | undefined {
  const v = flag in flags(argv) ? flags(argv)[flag] : undefined;
  if (v === undefined) return undefined;
  return /^\d+$/.test(v) ? Number(v) : Number.NaN;
}
function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--") && i + 1 < argv.length) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

/** Pure entry for the tests: argv after "nightwatch". Reads only; never writes. */
export function runNightwatch(argv: string[], env: NodeJS.ProcessEnv, now: Date): Result {
  if (argv[0] !== "view") return fail("usage: nightwatch view <name>");
  const name = argv[1];
  const f = flags(argv.slice(2));
  if (!(VIEW_NAMES as readonly string[]).includes(name)) return fail(`unknown view (${VIEW_NAMES.join(", ")})`);
  for (const k of ["run", "ticket"]) if (f[k] !== undefined && !isSafe(f[k])) return fail("bad id");
  const since = num(argv.slice(2), "since"), before = num(argv.slice(2), "before"), tail = num(argv.slice(2), "tail"), limit = num(argv.slice(2), "limit");
  if ([since, before, tail, limit].some((n) => Number.isNaN(n))) return fail("bad number");
  switch (name) {
    case "overview": return ok(overviewView(env, now));
    case "attention": return ok(attentionView(env, now));
    case "runs": return ok(runsView(env, now, { state: f.state, role: f.role, ticket: f.ticket, trigger: f.trigger, limit }));
    case "run": { if (!f.run) return fail("--run is required"); const v = runView(env, now, { run: f.run }); return v === null ? fail("not found") : ok(v); }
    case "events": { if (!f.run) return fail("--run is required"); const v = eventsView(env, { run: f.run, since, before, tail, group: f.group }); return v === null ? fail("not found") : ok(v); }
    default: { if (!f.ticket) return fail("--ticket is required"); return ok(planView(env, { ticket: f.ticket })); }
  }
}

const nightwatchCommand: CommandModule = {
  command: "nightwatch",
  describe: "read-only views of the Nightwatch run record (for the Nexus API)",
  builder: (y) => y.command({
    command: "view <name>",
    describe: `print one JSON view: ${VIEW_NAMES.join(", ")}`,
    builder: (v) => v.positional("name", { type: "string", demandOption: true }).strict(false),
    handler: () => {
      const i = process.argv.indexOf("nightwatch");
      const r = runNightwatch(process.argv.slice(i + 1), process.env, new Date());
      if (r.out) process.stdout.write(r.out);
      if (r.err) process.stderr.write(r.err);
      process.exitCode = r.code;
    },
  }).demandCommand(1),
  handler: () => undefined,
};
export default nightwatchCommand;
```

Then register it in `packages/cli/src/index.ts`:

```ts
import nightwatchCommand from "./nightwatch/index.ts";
// ... next to .command(autonomousCommand):
    .command(nightwatchCommand)
```

Add to `packages/cli/src/strip-types.smoke.test.ts` inside the first `for` list: `["nightwatch", "--help"]` and change the `expect(stdout).toMatch(...)` pattern to `/autonomous|scan|report|nightwatch|view/i`.

Write `packages/cli/src/nightwatch/README.md` (short): what `dg nightwatch view` prints, the six names and flags, the read-only rule, and that the Nexus API calls it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/nightwatch src/strip-types.smoke.test.ts src/index.test.ts`
Expected: PASS. In the test replace `require("node:fs")` with an `import { readdirSync } from "node:fs"` at the top if the runner rejects `require`.

- [ ] **Step 5: Build the CLI and check the real binary**

Run: `pnpm --filter @digismith/cli build && DIGISMITH_DEPOT_DIR=$(mktemp -d) AUTONOMOUS_DIR=$(mktemp -d) node packages/cli/dist/index.js nightwatch view overview | head -c 300`
Expected: one JSON line starting `{"readAt":`. (`dist/` is git-ignored; do not commit it.)

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/nightwatch/index.ts packages/cli/src/nightwatch/index.test.ts packages/cli/src/nightwatch/README.md packages/cli/src/index.ts packages/cli/src/strip-types.smoke.test.ts
git commit -m "feat(nightwatch): add the read-only dg nightwatch view command" -- packages/cli/src/nightwatch packages/cli/src/index.ts packages/cli/src/strip-types.smoke.test.ts
```

---

### Task 5: The API reader (spawn, single flight, cache)

**Files:**
- Create: `scripts/nexus-api/src/nightwatch-reader.ts`
- Test: `scripts/nexus-api/src/nightwatch-reader.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks at build time (the CLI is a process).
- Produces (`nightwatch-reader.ts`):
  - `type ViewName = 'overview' | 'attention' | 'runs' | 'run' | 'events' | 'plan'`
  - `type ViewArgs = Record<string, string | number | undefined>`
  - `type Reader = (view: ViewName, args?: ViewArgs) => Promise<unknown>`
  - `class ReaderError extends Error { code: 'reader_unavailable' | 'not_found' }`
  - `createReader(opts?: { file?: string; entry?: string; ttlMs?: number; timeoutMs?: number; now?: () => number; env?: NodeJS.ProcessEnv }): Reader`
  - `DEFAULT_ENTRY` = `join(MAIN_CHECKOUT, 'packages', 'cli', 'dist', 'index.js')`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/nexus-api/src/nightwatch-reader.test.ts
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createReader, DEFAULT_ENTRY, ReaderError } from './nightwatch-reader.ts'

// A fake "CLI": a node script that records its argv in a counter file and prints JSON.
function fakeCli(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nw-reader-'))
  const file = join(dir, 'index.js')
  writeFileSync(file, body)
  chmodSync(file, 0o644)
  return file
}
const echo = `
const fs = require('node:fs')
const c = process.env.COUNT_FILE
if (c) fs.appendFileSync(c, 'x')
if (process.argv.includes('missing')) { process.stderr.write('not found\\n'); process.exit(1) }
process.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }) + '\\n')
`

describe('createReader', () => {
  it('runs the built CLI with an argument array and parses the JSON', async () => {
    const read = createReader({ entry: fakeCli(echo), ttlMs: 0 })
    expect(await read('runs', { role: 'builder', limit: 5 })).toEqual({ argv: ['nightwatch', 'view', 'runs', '--limit', '5', '--role', 'builder'] })
  })
  it('sorts the flags, skips undefined ones, and never lets a value become a flag or a shell word', async () => {
    const read = createReader({ entry: fakeCli(echo), ttlMs: 0 })
    const out = (await read('plan', { ticket: 'DGS-590; rm -rf /', group: undefined })) as { argv: string[] }
    expect(out.argv).toEqual(['nightwatch', 'view', 'plan', '--ticket', 'DGS-590; rm -rf /'])
  })
  it('one spawn serves concurrent calls and the cache serves the next 5 s', async () => {
    const countFile = join(mkdtempSync(join(tmpdir(), 'nw-count-')), 'n')
    let t = 1_000
    const read = createReader({ entry: fakeCli(echo), ttlMs: 5_000, now: () => t, env: { ...process.env, COUNT_FILE: countFile } })
    await Promise.all([read('overview'), read('overview'), read('overview')])
    t += 4_000
    await read('overview')
    expect(require('node:fs').readFileSync(countFile, 'utf8')).toBe('x')
    t += 2_000
    await read('overview')
    expect(require('node:fs').readFileSync(countFile, 'utf8')).toBe('xx')
  })
  it('a different argument set is a different cache entry', async () => {
    const countFile = join(mkdtempSync(join(tmpdir(), 'nw-count-')), 'n')
    const read = createReader({ entry: fakeCli(echo), ttlMs: 5_000, env: { ...process.env, COUNT_FILE: countFile } })
    await read('runs', { role: 'builder' })
    await read('runs', { role: 'reviewer' })
    expect(require('node:fs').readFileSync(countFile, 'utf8')).toBe('xx')
  })
  it('exit 1 with "not found" is not_found; other failures are reader_unavailable', async () => {
    const read = createReader({ entry: fakeCli(echo), ttlMs: 0 })
    await expect(read('run', { run: 'missing' })).rejects.toMatchObject({ code: 'not_found' })
    const bad = createReader({ entry: fakeCli('process.exit(3)'), ttlMs: 0 })
    await expect(bad('overview')).rejects.toMatchObject({ code: 'reader_unavailable' })
    const junk = createReader({ entry: fakeCli("process.stdout.write('not json')"), ttlMs: 0 })
    await expect(junk('overview')).rejects.toBeInstanceOf(ReaderError)
  })
  it('a missing build is reader_unavailable', async () => {
    const read = createReader({ entry: join(tmpdir(), 'nw-no-such-dir', 'index.js'), ttlMs: 0 })
    await expect(read('overview')).rejects.toMatchObject({ code: 'reader_unavailable' })
  })
  it('a hung CLI is killed at the timeout', async () => {
    const read = createReader({ entry: fakeCli('setInterval(() => {}, 1000)'), ttlMs: 0, timeoutMs: 300 })
    await expect(read('overview')).rejects.toMatchObject({ code: 'reader_unavailable' })
  })
  it('a failed call is not cached', async () => {
    const entry = fakeCli('process.exit(2)')
    const read = createReader({ entry, ttlMs: 60_000 })
    await expect(read('overview')).rejects.toBeInstanceOf(ReaderError)
    writeFileSync(entry, echo)
    await expect(read('overview')).resolves.toBeTruthy()
  })
  it('the default entry is the main checkout build, not the depot', () => {
    expect(DEFAULT_ENTRY).toMatch(/Workspace\/Jazurite\/DigiSmith\/packages\/cli\/dist\/index\.js$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/nexus-api/src/nightwatch-reader.test.ts`
Expected: FAIL, cannot find `./nightwatch-reader.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/nexus-api/src/nightwatch-reader.ts
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MAIN_CHECKOUT = join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith')
export const DEFAULT_ENTRY = join(MAIN_CHECKOUT, 'packages', 'cli', 'dist', 'index.js')

export type ViewName = 'overview' | 'attention' | 'runs' | 'run' | 'events' | 'plan'
export type ViewArgs = Record<string, string | number | undefined>
export type Reader = (view: ViewName, args?: ViewArgs) => Promise<unknown>

export class ReaderError extends Error {
  code: 'reader_unavailable' | 'not_found'
  constructor(code: 'reader_unavailable' | 'not_found') { super(code); this.code = code }
}

export interface ReaderOptions { file?: string; entry?: string; ttlMs?: number; timeoutMs?: number; now?: () => number; env?: NodeJS.ProcessEnv }

// The CLI is the only reader of the run files: no second parser here. Each call is one node process, so the cache
// and the single flight keep ten polling tabs at one spawn per view per 5 s.
export function createReader(opts: ReaderOptions = {}): Reader {
  const file = opts.file ?? process.execPath
  const entry = opts.entry ?? DEFAULT_ENTRY
  const ttl = opts.ttlMs ?? 5_000
  const timeout = opts.timeoutMs ?? 8_000
  const now = opts.now ?? Date.now
  const cache = new Map<string, { at: number; value: unknown }>()
  const inflight = new Map<string, Promise<unknown>>()

  const run = (view: ViewName, args: ViewArgs): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const argv = [entry, 'nightwatch', 'view', view]
      for (const k of Object.keys(args).sort()) {
        const v = args[k]
        if (v !== undefined) argv.push(`--${k}`, String(v))
      }
      execFile(file, argv, { timeout: timeout, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024, env: opts.env ?? process.env, shell: false }, (err, stdout, stderr) => {
        if (err) {
          const code = (err as { code?: unknown }).code
          return reject(new ReaderError(code === 1 && stderr.trim() === 'not found' ? 'not_found' : 'reader_unavailable'))
        }
        try { resolve(JSON.parse(stdout)) } catch { reject(new ReaderError('reader_unavailable')) }
      })
    })

  return (view, args = {}) => {
    const key = `${view}|${JSON.stringify(Object.entries(args).filter(([, v]) => v !== undefined).sort())}`
    const hit = cache.get(key)
    if (hit && now() - hit.at < ttl) return Promise.resolve(hit.value)
    const flying = inflight.get(key)
    if (flying) return flying
    const p = run(view, args).then(
      (value) => { cache.set(key, { at: now(), value }); inflight.delete(key); return value },
      (e) => { inflight.delete(key); throw e },
    )
    inflight.set(key, p)
    return p
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/nexus-api/src/nightwatch-reader.test.ts`
Expected: PASS. In the test file replace `require('node:fs')` with a top-level `import { readFileSync } from 'node:fs'` (ESM). The cache must be bounded: add a `if (cache.size > 200) cache.clear()` line before `cache.set`, and keep the test passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/nexus-api/src/nightwatch-reader.ts scripts/nexus-api/src/nightwatch-reader.test.ts
git commit -m "feat(nexus-api): add the Nightwatch reader that runs the built CLI" -- scripts/nexus-api/src/nightwatch-reader.ts scripts/nexus-api/src/nightwatch-reader.test.ts
```

---

### Task 6: The API routes, Nexus health and wiring

**Files:**
- Create: `scripts/nexus-api/src/nightwatch-route.ts`
- Modify: `scripts/nexus-api/src/app.ts` (add `nightwatch?: NightwatchDeps` to `AppDeps`; mount after the jobs routes), `scripts/nexus-api/src/server.ts` (`startNexus` builds `createReader()` and passes it with the engine), `scripts/nexus-api/install.sh` (verify only; see step 6)
- Test: `scripts/nexus-api/src/nightwatch-route.test.ts`, `scripts/nexus-api/src/nightwatch-contract.test.ts`

**Interfaces:**
- Consumes: Task 5 (`Reader`, `ReaderError`, `ViewName`); Task 1 schemas (from `../../nexus-shared/nightwatch.ts`); `sendJson`, `Env` from `./app.ts`; `API_VERSION` from `./version.ts`; `JobInfo` from `./scheduler/types.ts`.
- Produces (`nightwatch-route.ts`):
  - `NIGHTWATCH_PATH` = `/api/v1/nightwatch`
  - `interface NightwatchDeps { read: Reader; jobs?: () => JobInfo[]; now?: () => number }`
  - `createNightwatchRoutes(deps: NightwatchDeps): Hono<Env>`
  - `nexusStatus(jobs: JobInfo[] | null, breakerOpen: boolean, nowMs: number): { status: 'healthy' | 'degraded' | 'unknown' | 'breaker-open'; reasons: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/nexus-api/src/nightwatch-route.test.ts
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { JobInfo } from './scheduler/types.ts'
import { createNightwatchRoutes, nexusStatus } from './nightwatch-route.ts'
import { ReaderError, type Reader } from './nightwatch-reader.ts'
import type { Env } from './app.ts'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const row = { run: 'builder-1', ticket: 'DGS-590', role: 'builder', seat: null, model: null, trigger: 'manual', state: 'healthy', phase: 'building', startedAt: '2026-10-22T02:00:00.000Z', endedAt: null, elapsedSec: 3600, events: 2, merged: false, pushed: false }
const overviewView = {
  readAt: '2026-10-22T03:00:00.000Z', workers: [row], attentionCount: 0,
  tickets: { windowDays: 7, lockTicket: null, rows: [] },
  lastEvents: [],
  scan: { lastScanAt: null, candidates: null, away: false, nightWindow: false, breakerOpen: false, breakerStreak: 0 },
}
const job = (name: string, status: 'ok' | 'failed', endedAt: string): JobInfo => ({
  name, description: '', schedule: null, nextRunAt: null, nextRunAtUtc7: null, running: null, queued: null,
  lastRun: { id: '1', job: name, trigger: 'schedule', slot: null, status, startedAt: endedAt, startedAtUtc7: '', endedAt, durationMs: 1, exitCode: 0, detail: '' },
})

function app(read: Reader, jobs?: () => JobInfo[]) {
  const a = new Hono<Env>()
  a.route('/', createNightwatchRoutes({ read, jobs, now: () => NOW }))
  return a
}
const calls: { view: string; args: unknown }[] = []
const fake: Reader = async (view, args) => {
  calls.push({ view, args })
  if (view === 'overview') return overviewView
  if (view === 'runs') return { readAt: overviewView.readAt, total: 1, runs: [row] }
  if (view === 'attention') return { readAt: overviewView.readAt, open: [], resolved: [] }
  if (view === 'events') return { run: 'builder-1', total: 0, from: 0, lines: [] }
  if (view === 'plan') return { ticket: 'DGS-590', found: false, planFile: null, tasksTotal: 0, tasksDone: 0, tasks: [], verdicts: [], ledgerError: false }
  throw new ReaderError('not_found')
}

describe('nexusStatus', () => {
  it('is healthy when both jobs ended ok and the watchdog is recent', () => {
    expect(nexusStatus([job('autonomous-scan', 'ok', '2026-10-22T02:00:00.000Z'), job('nightwatch-watchdog', 'ok', '2026-10-22T02:55:00.000Z')], false, NOW)).toEqual({ status: 'healthy', reasons: [] })
  })
  it('degrades for a failed job, an old watchdog, or no scheduler', () => {
    expect(nexusStatus([job('autonomous-scan', 'failed', '2026-10-22T02:00:00.000Z'), job('nightwatch-watchdog', 'ok', '2026-10-22T02:55:00.000Z')], false, NOW).reasons).toEqual(['autonomous-scan failed'])
    expect(nexusStatus([job('autonomous-scan', 'ok', '2026-10-22T02:00:00.000Z'), job('nightwatch-watchdog', 'ok', '2026-10-22T02:30:00.000Z')], false, NOW).reasons).toEqual(['nightwatch-watchdog has not run for 15 min'])
    expect(nexusStatus(null, false, NOW)).toEqual({ status: 'degraded', reasons: ['scheduler off'] })
  })
  it('a missing job is degraded, a job that never ran is unknown', () => {
    const scan = job('autonomous-scan', 'ok', '2026-10-22T02:00:00.000Z')
    const wd = job('nightwatch-watchdog', 'ok', '2026-10-22T02:55:00.000Z')
    expect(nexusStatus([scan], false, NOW)).toEqual({ status: 'degraded', reasons: ['nightwatch-watchdog not registered'] })
    expect(nexusStatus([wd], false, NOW)).toEqual({ status: 'degraded', reasons: ['autonomous-scan not registered'] })
    expect(nexusStatus([scan, { ...wd, lastRun: null }], false, NOW)).toEqual({ status: 'unknown', reasons: ['nightwatch-watchdog never ran'] })
    expect(nexusStatus([{ ...scan, lastRun: null }, wd], false, NOW)).toEqual({ status: 'unknown', reasons: ['autonomous-scan never ran'] })
    expect(nexusStatus([{ ...scan, lastRun: null }], false, NOW).status).toBe('degraded')
  })
  it('an open breaker wins', () => {
    expect(nexusStatus([], true, NOW).status).toBe('breaker-open')
  })
})

describe('routes', () => {
  it('overview adds the nexus block and sets no-store', async () => {
    const res = await app(fake, () => [job('autonomous-scan', 'ok', '2026-10-22T02:00:00.000Z'), job('nightwatch-watchdog', 'ok', '2026-10-22T02:58:00.000Z')]).request('/api/v1/nightwatch/overview')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await res.json()).nexus).toEqual({ status: 'healthy', reasons: [] })
  })
  it('passes only known, validated query values to the reader', async () => {
    calls.length = 0
    const res = await app(fake).request('/api/v1/nightwatch/runs?state=stalled&role=builder&ticket=DGS-590&trigger=manual&limit=20')
    expect(res.status).toBe(200)
    expect(calls[0]).toEqual({ view: 'runs', args: { state: 'stalled', role: 'builder', ticket: 'DGS-590', trigger: 'manual', limit: 20 } })
  })
  it('refuses an unknown key, a bad value or a bad id without echoing it', async () => {
    for (const url of ['/api/v1/nightwatch/runs?evil=1', '/api/v1/nightwatch/runs?state=bogus', '/api/v1/nightwatch/runs?limit=9999', '/api/v1/nightwatch/runs/..%2Fx', '/api/v1/nightwatch/plan/a%20b', '/api/v1/nightwatch/runs/builder-1/events?group=bogus', '/api/v1/nightwatch/runs/builder-1/events?since=-1']) {
      const res = await app(fake).request(url)
      expect(res.status, url).toBe(400)
      const text = await res.text()
      expect(JSON.parse(text)).toEqual({ error: 'bad_request' })
    }
  })
  it('events pass the cursor, tail, before and group', async () => {
    calls.length = 0
    await app(fake).request('/api/v1/nightwatch/runs/builder-1/events?since=5&tail=200&group=errors&before=9')
    expect(calls[0]).toEqual({ view: 'events', args: { run: 'builder-1', since: 5, tail: 200, group: 'errors', before: 9 } })
  })
  it('maps reader errors: not_found 404, others 503, and a bad answer 503 internal_invalid', async () => {
    expect((await app(fake).request('/api/v1/nightwatch/runs/nope-1')).status).toBe(404)
    const down: Reader = async () => { throw new ReaderError('reader_unavailable') }
    const res = await app(down).request('/api/v1/nightwatch/attention')
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'reader_unavailable' })
    const junk: Reader = async () => ({ nonsense: true })
    const res2 = await app(junk).request('/api/v1/nightwatch/attention')
    expect(res2.status).toBe(503)
    expect(await res2.json()).toEqual({ error: 'internal_invalid' })
  })
  it('an unknown nightwatch path is 404 for every method, a known path with a wrong method is 405', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const res = await app(fake).request('/api/v1/nightwatch/nope', { method })
      expect(res.status, method).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
    expect((await app(fake).request('/api/v1/nightwatch/runs/builder-1/events', { method: 'POST' })).status).toBe(405)
    expect((await app(fake).request('/api/v1/nightwatch/plan/DGS-590', { method: 'POST' })).status).toBe(405)
  })
  it('only GET is allowed', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await app(fake).request('/api/v1/nightwatch/overview', { method })
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('GET')
    }
  })
})
```

```ts
// scripts/nexus-api/src/nightwatch-contract.test.ts
// The CLI builds plain objects; this test checks that they parse with the shared schemas (the two copies of the shape cannot drift).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeDepot, type Depot } from '../../../packages/cli/src/nightwatch/fixture.test-util.ts'
import { attentionView, eventsView, overviewView, planView, runsView, runView } from '../../../packages/cli/src/nightwatch/views.ts'
import { attentionSchema, eventsSchema, overviewViewSchema, planSchema, runDetailSchema, runsSchema } from '../../nexus-shared/nightwatch.ts'

const NOW = new Date('2026-10-22T03:00:00.000Z')
let d: Depot
beforeEach(() => { d = makeDepot() })
afterEach(() => d.cleanup())

describe('view output parses with the shared schemas', () => {
  it('empty depot', () => {
    expect(overviewViewSchema.parse(overviewView(d.env, NOW))).toBeTruthy()
    expect(attentionSchema.parse(attentionView(d.env, NOW))).toBeTruthy()
    expect(runsSchema.parse(runsView(d.env, NOW, {}))).toBeTruthy()
    expect(planSchema.parse(planView(d.env, { ticket: 'DGS-590' }))).toBeTruthy()
  })
  it('a depot with a run, events and an attention item', () => {
    d.writeRun({ ticket: 'DGS-590', run: 'builder-1', role: 'builder', created_at: '2026-10-22T02:20:00.000Z', order: '/d/order-ao-1.md', seat: 'dev0', model: 'sonnet-5-5' })
    d.writeEvents('DGS-590', 'builder-1', [{ type: 'started', ts: '2026-10-22T02:20:00.000Z', data: { source: 'startup' } }, { type: 'tool', ts: '2026-10-22T02:21:00.000Z', data: { tool: 'Edit', ok: false } }])
    d.writeAttention([{ schema: 'nightwatch-attention/v1', id: 'a', ts: '2026-10-22T02:30:00.000Z', ticket: 'DGS-590', run: 'builder-1', kind: 'blocked', cause: 'x', since: '2026-10-22T02:30:00.000Z' }])
    expect(overviewViewSchema.parse(overviewView(d.env, NOW)).workers).toHaveLength(1)
    expect(attentionSchema.parse(attentionView(d.env, NOW)).open).toHaveLength(1)
    expect(runDetailSchema.parse(runView(d.env, NOW, { run: 'builder-1' }))).toBeTruthy()
    expect(eventsSchema.parse(eventsView(d.env, { run: 'builder-1' })).lines).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/nexus-api/src/nightwatch-route.test.ts scripts/nexus-api/src/nightwatch-contract.test.ts`
Expected: FAIL, cannot find `./nightwatch-route.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/nexus-api/src/nightwatch-route.ts
import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { attentionSchema, eventsSchema, overviewViewSchema, planSchema, runDetailSchema, runsSchema, EVENT_GROUPS, HEALTH, ROLES, TRIGGERS } from '../../nexus-shared/nightwatch.ts'
import { sendJson, type Env } from './app.ts'
import { ReaderError, type Reader, type ViewArgs, type ViewName } from './nightwatch-reader.ts'
import type { JobInfo } from './scheduler/types.ts'
import { API_VERSION } from './version.ts'

export const NIGHTWATCH_PATH = `/api/${API_VERSION}/nightwatch` as const

export interface NightwatchDeps { read: Reader; jobs?: () => JobInfo[]; now?: () => number }

const WATCHDOG_STALE_MS = 15 * 60_000
const KNOWN_PATH = new RegExp(`^${NIGHTWATCH_PATH}/(overview|attention|runs|runs/[^/]+|runs/[^/]+/events|plan/[^/]+)$`)
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export type NexusState = 'healthy' | 'degraded' | 'unknown' | 'breaker-open'

export function nexusStatus(jobs: JobInfo[] | null, breakerOpen: boolean, nowMs: number): { status: NexusState; reasons: string[] } {
  if (breakerOpen) return { status: 'breaker-open', reasons: ['circuit breaker open'] }
  if (jobs === null) return { status: 'degraded', reasons: ['scheduler off'] }
  const reasons: string[] = []
  const unknown: string[] = []
  for (const name of ['autonomous-scan', 'nightwatch-watchdog']) {
    const job = jobs.find((j) => j.name === name)
    if (!job) { reasons.push(`${name} not registered`); continue }
    const last = job.lastRun
    if (!last) { unknown.push(`${name} never ran`); continue }
    if (last.status !== 'ok' && last.status !== 'skipped') reasons.push(`${name} ${last.status}`)
  }
  const wd = jobs.find((j) => j.name === 'nightwatch-watchdog')?.lastRun
  if (wd?.endedAt && nowMs - Date.parse(wd.endedAt) > WATCHDOG_STALE_MS) reasons.push('nightwatch-watchdog has not run for 15 min')
  if (reasons.length) return { status: 'degraded', reasons: [...reasons, ...unknown] }
  return unknown.length ? { status: 'unknown', reasons: unknown } : { status: 'healthy', reasons: [] }
}

const int = (max: number) => z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().max(max))
const id = z.string().regex(ID)
const runsQuery = z.strictObject({ state: z.enum(HEALTH).optional(), role: z.enum(ROLES).optional(), ticket: id.optional(), trigger: z.enum(TRIGGERS).optional(), limit: int(500).optional() })
const eventsQuery = z.strictObject({ since: int(1e9).optional(), before: int(1e9).optional(), tail: int(1000).optional(), group: z.enum(EVENT_GROUPS).optional() })
const none = z.strictObject({})

export function createNightwatchRoutes(deps: NightwatchDeps): Hono<Env> {
  const now = deps.now ?? Date.now
  const app = new Hono<Env>()

  const fail = (c: Context<Env>, status: 400 | 404 | 405 | 503, error: string, headers: Record<string, string> = {}) => sendJson(c, status, { error }, headers)
  const serve = async <T extends z.ZodType>(c: Context<Env>, view: ViewName, args: ViewArgs, schema: T, after?: (v: z.infer<T>) => unknown) => {
    try {
      const raw = await deps.read(view, args)
      const parsed = schema.safeParse(raw)
      if (!parsed.success) return fail(c, 503, 'internal_invalid')
      return sendJson(c, 200, after ? after(parsed.data) : parsed.data)
    } catch (e) {
      if (e instanceof ReaderError && e.code === 'not_found') return fail(c, 404, 'not_found')
      return fail(c, 503, 'reader_unavailable', { 'Retry-After': '5' })
    }
  }
  const query = (c: Context<Env>) => Object.fromEntries(Object.entries(c.req.query()))

  // 405 only for a known path; any other path under the prefix is 404 whatever the method.
  app.all(`${NIGHTWATCH_PATH}/*`, async (c, next) => {
    if (!KNOWN_PATH.test(c.req.path)) return fail(c, 404, 'not_found')
    if (c.req.method !== 'GET') return fail(c, 405, 'method_not_allowed', { Allow: 'GET' })
    await next()
  })

  app.get(`${NIGHTWATCH_PATH}/overview`, async (c) => {
    if (!none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'overview', {}, overviewViewSchema, (v) => ({ ...v, nexus: nexusStatus(deps.jobs ? deps.jobs() : null, v.scan.breakerOpen, now()) }))
  })
  app.get(`${NIGHTWATCH_PATH}/attention`, async (c) => {
    if (!none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'attention', {}, attentionSchema)
  })
  app.get(`${NIGHTWATCH_PATH}/runs`, async (c) => {
    const q = runsQuery.safeParse(query(c))
    if (!q.success) return fail(c, 400, 'bad_request')
    return serve(c, 'runs', q.data, runsSchema)
  })
  app.get(`${NIGHTWATCH_PATH}/runs/:id`, async (c) => {
    const run = id.safeParse(c.req.param('id'))
    if (!run.success || !none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'run', { run: run.data }, runDetailSchema)
  })
  app.get(`${NIGHTWATCH_PATH}/runs/:id/events`, async (c) => {
    const run = id.safeParse(c.req.param('id'))
    const q = eventsQuery.safeParse(query(c))
    if (!run.success || !q.success) return fail(c, 400, 'bad_request')
    return serve(c, 'events', { run: run.data, ...q.data }, eventsSchema)
  })
  app.get(`${NIGHTWATCH_PATH}/plan/:ticket`, async (c) => {
    const t = id.safeParse(c.req.param('ticket'))
    if (!t.success || !none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'plan', { ticket: t.data }, planSchema)
  })
  return app
}
```

Wire it. In `scripts/nexus-api/src/app.ts` add the import, extend `AppDeps` and mount after the jobs line:

```ts
import { createNightwatchRoutes, type NightwatchDeps } from './nightwatch-route.ts'
export interface AppDeps { logger?: Logger; loadProfile?: () => Promise<Profile>; now?: () => number; jobs?: JobsDeps; nightwatch?: NightwatchDeps }
// ...
  if (deps.jobs) app.route('/', createJobsRoutes(deps.jobs))
  if (deps.nightwatch) app.route('/', createNightwatchRoutes(deps.nightwatch))
```

(`nightwatch-route.ts` imports `sendJson` and `Env` from `app.ts` and `app.ts` imports the route factory: this is the same cycle the jobs routes already have; keep both imports as they are, and only use the imports inside functions.)

In `scripts/nexus-api/src/server.ts` `createApiServer(...)` call inside `startNexus`, add the reader. Import `createReader` from `./nightwatch-reader.ts` and build the deps once, with the engine's snapshot when the scheduler is up:

```ts
  const nightwatch = { read: createReader(), ...(engine ? { jobs: () => engine!.snapshot() } : {}) }
  const server = createApiServer(opts.getReading, { logger, ...(opts.loadProfile ? { loadProfile: opts.loadProfile } : {}), ...(jobs ? { jobs } : {}), nightwatch })
```

(Keep `const running = engine` after it. `engine!` is safe inside the closure only while `engine` stays assigned; capture `const eng = engine` before and use `eng.snapshot()` to avoid the non-null assertion.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/nexus-api`
Expected: PASS, including the existing `no-console.test.ts` and `no-secret-in-logs.test.ts` (the new files never call `console`). If `app.test.ts` snapshots the route list, update it for the six new routes.

- [ ] **Step 5: Check the depot install copies the new files**

Run: `sed -n 10,32p scripts/nexus-api/install.sh` and `bash -n scripts/nexus-api/install.sh`.
Expected: the `for f in "$SRC"/src/*.ts` loop (and the `nexus-shared/*.ts` loop) already copy every `.ts` file, so `nightwatch-route.ts`, `nightwatch-reader.ts` and `nexus-shared/nightwatch.ts` need no change. If a loop excludes `*.test.ts` by pattern, confirm the new tests are skipped. If the loops list files by name, add the three new files. Do NOT run `install.sh` (the conductor runs it after the merge).

- [ ] **Step 6: Commit**

```bash
git add scripts/nexus-api/src/nightwatch-route.ts scripts/nexus-api/src/nightwatch-route.test.ts scripts/nexus-api/src/nightwatch-contract.test.ts scripts/nexus-api/src/app.ts scripts/nexus-api/src/server.ts
git commit -m "feat(nexus-api): add the read-only Nightwatch routes and Nexus health" -- scripts/nexus-api/src scripts/nexus-api/install.sh
```

---

### Task 7: Web foundation (router, tokens, polling, typed loaders)

**Files:**
- Create: `scripts/nexus-web/app/assets/nightwatch-tokens.scss`, `scripts/nexus-web/app/composables/useNightwatchPoll.ts`, `scripts/nexus-web/app/composables/nightwatch-api.ts`, `scripts/nexus-web/app/pages/index.vue`, `scripts/nexus-web/app/utils/nw-format.ts`
- Modify: `scripts/nexus-web/app/app.vue` (becomes `<NuxtPage />`), `scripts/nexus-web/nuxt.config.ts` (alias `#nightwatch-schema`), `scripts/nexus-web/tests/unit/built-page.test.ts` (allow the new API prefix)
- Test: `scripts/nexus-web/app/composables/useNightwatchPoll.test.ts`, `scripts/nexus-web/app/composables/nightwatch-api.test.ts`, `scripts/nexus-web/app/utils/nw-format.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas via the alias `#nightwatch-schema`.
- Produces:
  - `useNightwatchPoll<T>(load: () => Promise<T>, opts?: { intervalMs?: number; backoffMs?: number; now?: () => number }): { data: Ref<T | null>; error: Ref<boolean>; loading: Ref<boolean>; updatedAt: Ref<number | null>; failedAt: Ref<number | null>; refresh(): Promise<void>; stop(): void }`
  - `nightwatch-api.ts`: `loadOverview(o?)`, `loadAttention(o?)`, `loadRuns(query?, o?)`, `loadRun(id, o?)`, `loadEvents(id, q?, o?)`, `loadPlan(ticket, o?)`, each `Promise<T>` that throws `NightwatchApiError` (`status: number; code: string`) on a non-200 or a body the schema refuses. `o = { base?: string; fetch?: typeof fetch }`.
  - `nw-format.ts`: `fmtUtc7(iso: string | null): string` (`"HH:MM"`, `"-"` for null), `fmtDay(iso)` (`"YYYY-MM-DD HH:MM"`), `fmtDuration(sec: number | null): string` (`"0:41:07"`), `ageOf(iso: string | null, nowMs: number): string` (`"2h10m"`, `"32m"`, `"-"`).

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/nexus-web/app/utils/nw-format.test.ts
import { describe, expect, it } from 'vitest'
import { ageOf, fmtDay, fmtDuration, fmtUtc7 } from './nw-format'

describe('nw-format', () => {
  it('shows UTC+7 times', () => {
    expect(fmtUtc7('2026-10-22T01:05:00.000Z')).toBe('08:05')
    expect(fmtDay('2026-10-22T20:30:00.000Z')).toBe('2026-10-23 03:30')
    expect(fmtUtc7(null)).toBe('-')
  })
  it('formats durations and ages', () => {
    expect(fmtDuration(2467)).toBe('0:41:07')
    expect(fmtDuration(null)).toBe('-')
    const now = Date.parse('2026-10-22T03:00:00.000Z')
    expect(ageOf('2026-10-22T00:50:00.000Z', now)).toBe('2h10m')
    expect(ageOf('2026-10-22T02:28:00.000Z', now)).toBe('32m')
    expect(ageOf(null, now)).toBe('-')
  })
})
```

```ts
// scripts/nexus-web/app/composables/useNightwatchPoll.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNightwatchPoll } from './useNightwatchPoll'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useNightwatchPoll', () => {
  it('loads at once, then every 10 s after the answer (no overlap)', async () => {
    const load = vi.fn().mockResolvedValue({ n: 1 })
    const p = useNightwatchPoll(load, { intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    expect(p.data.value).toEqual({ n: 1 })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(2)
    p.stop()
  })
  it('keeps the last data on a failure, backs off to 30 s, and returns to 10 s after a success', async () => {
    const load = vi.fn().mockResolvedValueOnce({ n: 1 }).mockRejectedValueOnce(new Error('x')).mockResolvedValue({ n: 3 })
    const p = useNightwatchPoll(load, { intervalMs: 10_000, backoffMs: 30_000 })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(p.error.value).toBe(true)
    expect(p.data.value).toEqual({ n: 1 })
    expect(p.failedAt.value).not.toBeNull()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(3)
    expect(p.error.value).toBe(false)
    expect(p.data.value).toEqual({ n: 3 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(load).toHaveBeenCalledTimes(4)
    p.stop()
  })
  it('pauses while the tab is hidden and loads at once when it shows again', async () => {
    const load = vi.fn().mockResolvedValue(1)
    const p = useNightwatchPoll(load, { intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
    p.stop()
  })
  it('stop() ends the polling', async () => {
    const load = vi.fn().mockResolvedValue(1)
    const p = useNightwatchPoll(load, { intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    p.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
```

```ts
// scripts/nexus-web/app/composables/nightwatch-api.test.ts
import { describe, expect, it } from 'vitest'
import { loadEvents, loadOverview, loadRuns, NightwatchApiError } from './nightwatch-api'

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const row = { run: 'b-1', ticket: 'DGS-1', role: 'builder', seat: null, model: null, trigger: 'manual', state: 'healthy', phase: null, startedAt: 'x', endedAt: null, elapsedSec: 0, events: 0, merged: false, pushed: false }

describe('nightwatch-api', () => {
  it('requests the right URL with the query and parses the answer', async () => {
    let url = ''
    const fetch = async (u: string | URL | Request) => { url = String(u); return json(200, { readAt: 'x', total: 1, runs: [row] })() }
    const out = await loadRuns({ role: 'builder', limit: 20 }, { base: 'http://h', fetch: fetch as typeof globalThis.fetch })
    expect(url).toBe('http://h/api/v1/nightwatch/runs?role=builder&limit=20')
    expect(out.total).toBe(1)
  })
  it('throws NightwatchApiError with the code on an error body', async () => {
    await expect(loadOverview({ base: 'http://h', fetch: json(503, { error: 'reader_unavailable' }) as typeof fetch })).rejects.toMatchObject({ status: 503, code: 'reader_unavailable' })
  })
  it('throws when the answer does not match the schema', async () => {
    await expect(loadOverview({ base: 'http://h', fetch: json(200, { nope: 1 }) as typeof fetch })).rejects.toBeInstanceOf(NightwatchApiError)
  })
  it('events send the cursor and the group', async () => {
    let url = ''
    const fetch = async (u: string | URL | Request) => { url = String(u); return json(200, { run: 'b-1', total: 0, from: 5, lines: [] })() }
    await loadEvents('b-1', { since: 5, group: 'errors', tail: 200 }, { base: 'http://h', fetch: fetch as typeof globalThis.fetch })
    expect(url).toBe('http://h/api/v1/nightwatch/runs/b-1/events?since=5&group=errors&tail=200')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/nexus-web && pnpm vitest run app/utils/nw-format.test.ts app/composables/useNightwatchPoll.test.ts app/composables/nightwatch-api.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write the implementation**

```ts
// scripts/nexus-web/app/utils/nw-format.ts
const OFFSET = 7 * 3600_000
const pad = (n: number): string => String(n).padStart(2, '0')
const local = (iso: string): Date => new Date(Date.parse(iso) + OFFSET)

export function fmtUtc7(iso: string | null): string {
  if (!iso) return '-'
  const d = local(iso)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
export function fmtDay(iso: string | null): string {
  if (!iso) return '-'
  const d = local(iso)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
export function fmtDuration(sec: number | null): string {
  if (sec === null) return '-'
  return `${Math.floor(sec / 3600)}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`
}
export function ageOf(iso: string | null, nowMs: number): string {
  if (!iso) return '-'
  const min = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000))
  return min >= 60 ? `${Math.floor(min / 60)}h${pad(min % 60)}m` : `${min}m`
}
```

```ts
// scripts/nexus-web/app/composables/useNightwatchPoll.ts
import { onScopeDispose, ref } from 'vue'

export interface PollOptions { intervalMs?: number; backoffMs?: number; now?: () => number }

// Waits 10 s after each answer (no overlap). A failed load keeps the last data and waits 30 s. A hidden tab pauses it.
export function useNightwatchPoll<T>(load: () => Promise<T>, opts: PollOptions = {}) {
  const interval = opts.intervalMs ?? 10_000
  const backoff = opts.backoffMs ?? 30_000
  const now = opts.now ?? Date.now
  const data = ref<T | null>(null)
  const error = ref(false)
  const loading = ref(true)
  const updatedAt = ref<number | null>(null)
  const failedAt = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let busy = false

  const hidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  const schedule = (ms: number): void => { if (timer) clearTimeout(timer); if (!stopped) timer = setTimeout(() => { void refresh() }, ms) }

  async function refresh(): Promise<void> {
    if (stopped || busy) return
    if (hidden()) return   // the visibilitychange handler loads again when the tab shows
    busy = true
    try {
      data.value = await load()
      error.value = false
      updatedAt.value = now()
      schedule(interval)
    } catch {
      error.value = true
      failedAt.value = now()
      schedule(backoff)
    } finally {
      loading.value = false
      busy = false
    }
  }
  function onVisible(): void {
    if (hidden()) { if (timer) clearTimeout(timer); return }
    void refresh()
  }
  function stop(): void {
    stopped = true
    if (timer) clearTimeout(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
  onScopeDispose(stop)
  void refresh()
  return { data, error, loading, updatedAt, failedAt, refresh, stop }
}
```

```ts
// scripts/nexus-web/app/composables/nightwatch-api.ts
import type { z } from 'zod'
import { attentionSchema, eventsSchema, nightwatchErrorSchema, overviewSchema, planSchema, runDetailSchema, runsSchema } from '#nightwatch-schema'

export class NightwatchApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code }
}
export interface ApiOptions { base?: string; fetch?: typeof fetch }

const BASE = '/api/v1/nightwatch'

async function get<T extends z.ZodType>(path: string, schema: T, o: ApiOptions): Promise<z.infer<T>> {
  const f = o.fetch ?? fetch
  const origin = o.base ?? (typeof location === 'undefined' ? '' : location.origin)
  let res: Response
  try { res = await f(`${origin}${BASE}${path}`, { headers: { accept: 'application/json' } }) } catch { throw new NightwatchApiError(0, 'unreachable') }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = nightwatchErrorSchema.safeParse(body)
    throw new NightwatchApiError(res.status, err.success ? err.data.error : 'unknown')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new NightwatchApiError(res.status, 'bad_answer')
  return parsed.data
}

const qs = (q: Record<string, string | number | undefined>): string => {
  const p = Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  return p.length ? `?${p.join('&')}` : ''
}

export const loadOverview = (o: ApiOptions = {}) => get('/overview', overviewSchema, o)
export const loadAttention = (o: ApiOptions = {}) => get('/attention', attentionSchema, o)
export const loadRuns = (q: { state?: string; role?: string; ticket?: string; trigger?: string; limit?: number } = {}, o: ApiOptions = {}) => get(`/runs${qs(q)}`, runsSchema, o)
export const loadRun = (id: string, o: ApiOptions = {}) => get(`/runs/${encodeURIComponent(id)}`, runDetailSchema, o)
export const loadEvents = (id: string, q: { since?: number; before?: number; tail?: number; group?: string } = {}, o: ApiOptions = {}) => get(`/runs/${encodeURIComponent(id)}/events${qs(q)}`, eventsSchema, o)
export const loadPlan = (ticket: string, o: ApiOptions = {}) => get(`/plan/${encodeURIComponent(ticket)}`, planSchema, o)
```

(`qs` keeps the key order of the object, so the test URLs match: `since, group, tail` is the order the test passes.)

Router and tokens:

1. `scripts/nexus-web/nuxt.config.ts`: add `'#nightwatch-schema': fileURLToPath(new URL('../nexus-shared/nightwatch.ts', import.meta.url)),` to `alias`, and change the comment at the top of the file from "No router" to "pages/ gives the router; every page is prerendered".
2. Move the Life Calendar markup out of `app/app.vue` into `app/pages/index.vue` unchanged (the skip link, `DashboardHeader`, `<main id="main" class="dashboard">`, `LifeCalendar`). `app/app.vue` becomes `<template><NuxtPage /></template>`.
3. `scripts/nexus-web/tests/unit/built-page.test.ts`: change the last test so the allowed set is `p.startsWith('/api/v1/life-calendar') || p.startsWith('/api/v1/nightwatch') || p === '/api/' || p === '/api'`, and its title to "the only API paths the app knows are the life calendar and Nightwatch".
4. `scripts/nexus-web/app/assets/nightwatch-tokens.scss`:

```scss
/*
 * Colour, radius and font tokens from Warren docs/ui-revamp/tokens.css
 * (https://github.com/jayminwest/warren/blob/main/docs/ui-revamp/tokens.css), MIT License.
 *
 * Copyright (c) 2026 Jaymin West
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of
 * the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
 * THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */
// Scope: .nw only. The Life Calendar keeps its own tokens. Dark is the default; light follows the system or data-theme.
.nw {
  --nw-bg: oklch(14% 0.008 264); --nw-sidebar: oklch(12.8% 0.008 264); --nw-surface: oklch(16.5% 0.010 264);
  --nw-raised: oklch(19% 0.011 264); --nw-hover: oklch(21% 0.012 264); --nw-thead: oklch(15.5% 0.009 264);
  --nw-text: oklch(96% 0.005 264); --nw-text-2: oklch(72% 0.012 264); --nw-text-3: oklch(60% 0.014 264);
  --nw-border: oklch(24% 0.012 264); --nw-strong: oklch(31% 0.013 264);
  --nw-primary: oklch(72% 0.110 152); --nw-ok: oklch(72% 0.130 150); --nw-warn: oklch(80% 0.150 75);
  --nw-bad: oklch(68% 0.210 27); --nw-info: oklch(72% 0.140 240); --nw-neutral: oklch(70% 0.020 264);
  --nw-radius-xs: 2px; --nw-radius-sm: 3px; --nw-radius-md: 4px;
  --nw-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --nw-mono: ui-monospace, 'SF Mono', Menlo, monospace;
}
@mixin nw-light {
  --nw-bg: oklch(96.8% 0.004 264); --nw-sidebar: oklch(98.6% 0.002 264); --nw-surface: oklch(100% 0 0);
  --nw-raised: oklch(97.6% 0.004 264); --nw-hover: oklch(95.2% 0.006 264); --nw-thead: oklch(98% 0.003 264);
  --nw-text: oklch(22% 0.015 264); --nw-text-2: oklch(45% 0.015 264); --nw-text-3: oklch(50% 0.014 264);
  --nw-border: oklch(90% 0.006 264); --nw-strong: oklch(82.5% 0.010 264);
  --nw-primary: oklch(54% 0.125 152); --nw-ok: oklch(54% 0.125 150); --nw-warn: oklch(52% 0.130 75);
  --nw-bad: oklch(54% 0.190 27); --nw-info: oklch(52% 0.125 240); --nw-neutral: oklch(48% 0.018 264);
}
@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) .nw { @include nw-light; } }
:root[data-theme='light'] .nw { @include nw-light; }
```

The light `--nw-warn`, `--nw-text-3` and `--nw-border` values are the plan's contrast-safe adjustments (the mock uses the same). Task 11 proves the pairs.

Import it in `nuxt.config.ts`: `css: ['~/assets/main.scss', '~/assets/nightwatch-tokens.scss']`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/nexus-web && pnpm vitest run`
Expected: PASS for the three new test files and all existing unit tests (the Life Calendar still mounts from `pages/index.vue`; `built-page.test.ts` is skipped without a build).

- [ ] **Step 5: Check the Life Calendar page did not change**

Run: `cd scripts/nexus-web && pnpm nuxt generate && pnpm vitest run tests/unit/built-page.test.ts && pnpm playwright test tests/e2e/dashboard.spec.ts`
Expected: PASS. If e2e needs a Playwright browser, run `pnpm e2e:install` once first. A failure here means the move changed the page: fix `pages/index.vue`, not the tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/nexus-web/app scripts/nexus-web/nuxt.config.ts scripts/nexus-web/tests/unit/built-page.test.ts
git commit -m "feat(nexus-web): add the router, Warren tokens, polling and typed loaders" -- scripts/nexus-web/app scripts/nexus-web/nuxt.config.ts scripts/nexus-web/tests/unit/built-page.test.ts
```

---

### Task 8: Shell, top bar and shared state components

**Files:**
- Create: `scripts/nexus-web/app/components/nw/NwShell.vue`, `NwTopBar.vue`, `NwNav.vue`, `NwPanel.vue` (empty / error / loading), `NwStatus.vue` (dot and word for a health or state), `NwTable.vue` (slot table with the shared look), plus a `*.stories.ts` for each; `scripts/nexus-web/app/layouts/nightwatch.vue`
- Test: `scripts/nexus-web/app/components/nw/shell.test.ts`

**Interfaces:**
- Consumes: Task 7 (`nw-format`, `Overview` type via `#nightwatch-schema`).
- Produces (props, exact):
  - `NwShell`: slots `default`; props `{ attention: number }`; renders `<nav class="nw-nav" aria-label="Nightwatch">` (`NwNav`), `NwTopBar` slot-fed by the layout, `<main id="main">`.
  - `NwTopBar`: props `{ overview: Overview | null; stale: boolean; updatedAt: number | null }`. Shows: Nexus health (`healthy` | `degraded` | `unknown` | `breaker-open` | `unreachable` when `overview` is null and `stale`), workers count, to do waiting (`scan.candidates` and `fmtUtc7(scan.lastScanAt)`), mode chip (`away` / `night` / `day`), `burn -/h` and `seat 5h / week - / -` slots each with `title="not measured"`, and `updated HH:MM:SS (UTC+7)`. Wrapped in `role="status"`.
  - `NwNav`: props `{ attention: number; current: string }`; links `/nightwatch/` (Operations), `/nightwatch/attention/` (Attention, badge when `attention > 0`), `/nightwatch/runs/` (Runs), `/nightwatch/plan/` (Plan); the current one has `aria-current="page"`.
  - `NwPanel`: props `{ kind: 'loading' | 'empty' | 'error'; title?: string; text?: string; retrying?: boolean }`, emits `retry`. `error` has `role="alert"` and a Retry button; `empty` has `role="status"`; `loading` shows three skeleton bars with `aria-busy="true"`.
  - `NwStatus`: props `{ state: 'healthy' | 'blocked' | 'stalled' | 'lost' | 'ended' | 'running' | 'ok' | 'warn' | 'bad' }`, renders the dot and the word. Colour never carries the meaning alone (the word is always there).

- [ ] **Step 1: Write the failing test**

```ts
// scripts/nexus-web/app/components/nw/shell.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import NwNav from './NwNav.vue'
import NwPanel from './NwPanel.vue'
import NwStatus from './NwStatus.vue'
import NwTopBar from './NwTopBar.vue'
import { overviewFixture } from '../../../tests/nightwatch-fixtures'

describe('NwTopBar', () => {
  it('shows health, workers, to do waiting, the mode and the two not-measured slots', async () => {
    const w = await mountSuspended(NwTopBar, { props: { overview: overviewFixture(), stale: false, updatedAt: Date.parse('2026-10-22T03:42:10Z') } })
    const t = w.text()
    expect(t).toContain('Nexus healthy')
    expect(t).toContain('Workers 2')
    expect(t).toContain('To do waiting 5')
    expect(t).toContain('away')
    expect(t).toContain('10:42:10 (UTC+7)')
    expect(w.findAll('[title="not measured"]')).toHaveLength(2)
    expect(w.find('[role="status"]').exists()).toBe(true)
  })
  it('says unreachable when there is no data and the last fetch failed', async () => {
    const w = await mountSuspended(NwTopBar, { props: { overview: null, stale: true, updatedAt: null } })
    expect(w.text()).toContain('Nexus unreachable')
  })
  it('shows a degraded and a breaker-open status in words', async () => {
    const o = overviewFixture()
    const d = await mountSuspended(NwTopBar, { props: { overview: { ...o, nexus: { status: 'degraded', reasons: ['scheduler off'] } }, stale: false, updatedAt: 1 } })
    expect(d.text()).toContain('Nexus degraded')
    const b = await mountSuspended(NwTopBar, { props: { overview: { ...o, nexus: { status: 'breaker-open', reasons: [] } }, stale: false, updatedAt: 1 } })
    expect(b.text()).toContain('Breaker open')
  })
})

describe('NwNav', () => {
  it('marks the current page and shows the attention badge only above zero', async () => {
    const w = await mountSuspended(NwNav, { props: { attention: 2, current: 'attention' } })
    expect(w.find('[aria-current="page"]').text()).toContain('Attention')
    expect(w.find('.badge').text()).toBe('2')
    const none = await mountSuspended(NwNav, { props: { attention: 0, current: 'runs' } })
    expect(none.find('.badge').exists()).toBe(false)
  })
})

describe('NwPanel', () => {
  it('error has role alert and a Retry that emits; busy blocks the click', async () => {
    const w = await mountSuspended(NwPanel, { props: { kind: 'error', title: 'The runs are not available.', retrying: false } })
    expect(w.find('[role="alert"]').exists()).toBe(true)
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
    await w.setProps({ retrying: true })
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })
  it('empty has role status and no button; loading is aria-busy', async () => {
    const e = await mountSuspended(NwPanel, { props: { kind: 'empty', title: 'Nothing waits for you.' } })
    expect(e.find('[role="status"]').exists()).toBe(true)
    expect(e.find('button').exists()).toBe(false)
    const l = await mountSuspended(NwPanel, { props: { kind: 'loading' } })
    expect(l.find('[aria-busy="true"]').exists()).toBe(true)
  })
  it('never shows an error code', async () => {
    const w = await mountSuspended(NwPanel, { props: { kind: 'error', title: 'Not available.' } })
    expect(w.text()).not.toMatch(/reader_unavailable|internal_invalid|\/api\//)
  })
})

describe('NwStatus', () => {
  it('always shows the word', async () => {
    for (const s of ['healthy', 'blocked', 'stalled', 'lost', 'ended', 'running'] as const) {
      expect((await mountSuspended(NwStatus, { props: { state: s } })).text()).toBe(s)
    }
  })
})
```

Also create the shared fixtures file `scripts/nexus-web/tests/nightwatch-fixtures.ts` (used by every later web test, story and the e2e stub): exports `runFixture(over?)`, `overviewFixture(over?)`, `attentionFixture()`, `runsFixture()`, `runDetailFixture()`, `eventsFixture(n?)`, `planFixture()`. All values are fake and fixed (times in `2026-10-22T0x:..Z`, tickets `DGS-590`/`DGS-588`, runs `builder-20261022T021000-a1b2c3`). `overviewFixture()` has 2 workers (one `healthy` builder, one `stalled` reviewer), `scan: { lastScanAt: '2026-10-22T02:10:00.000Z', candidates: 5, away: true, nightWindow: true, breakerOpen: false, breakerStreak: 0 }`, `nexus: { status: 'healthy', reasons: [] }`, `attentionCount: 2`, and a phase table with building 1, merged 4, released 5, lost 1. Type each as the `z.infer` type from `#nightwatch-schema` so a shape change breaks the build.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/nexus-web && pnpm vitest run app/components/nw/shell.test.ts`
Expected: FAIL (components missing).

- [ ] **Step 3: Write the implementation**

Write the six components as Vue SFCs with `<script setup lang="ts">`, explicit `import { computed } from 'vue'`, scoped SCSS that uses only `var(--nw-*)` tokens, base font 12px/16px, mono for ids and times, section labels 11px uppercase, minimum text size 11px, minimum 24px target for every link and button (44px for the Retry button on the phone project), and a visible `:focus-visible` outline (`2px solid var(--nw-primary)`). Follow the markup of `mock.html` (class names and structure may be kept). Required behaviour is listed under Interfaces above and is pinned by the test. Specific rules:

- `NwStatus` colour map: healthy/ok/running → `--nw-ok`; stalled/warn → `--nw-warn`; blocked/lost/bad → `--nw-bad`; ended → `--nw-text-3`. `running` uses `--nw-info`.
- `NwTopBar` uses `<time>` only for the updated stamp; `fmtUtc7` for the time; mode chip text is `away` when `scan.away`, else `night` when `scan.nightWindow`, else `day`.
- `layouts/nightwatch.vue` is `<div class="nw"><NwShell :attention="…"><slot /></NwShell></div>` with the `skip` link "Skip to the content". It fetches nothing; each page passes the overview to the top bar through a small provide/inject pair `nwOverview` (`provide('nwOverview', pollResult)` in the layout). To keep the polling in one place, the layout owns `useNightwatchPoll(loadOverview)` and provides `{ overview, stale, updatedAt, attention, refresh }`; the Operations page injects the same object instead of polling a second time.
- Stories (`NwPanel.stories.ts` etc.) use the fixtures only: `Loading`, `Empty`, `ErrorPanel`, `RetryingPanel` for `NwPanel`; `Healthy`, `Degraded`, `BreakerOpen`, `Unreachable` for `NwTopBar`; `AttentionBadge`, `NoBadge` for `NwNav`; one story per state for `NwStatus`; `NwShell` with a sample table. Story files must not call `fetch` and must import only the fixtures (the existing `stories.test.ts` rules).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/nexus-web && pnpm vitest run app/components/nw tests/unit/stories.test.ts`
Expected: PASS. Extend `tests/unit/stories.test.ts` with the list of new story files (a `for` over `NwShell NwTopBar NwNav NwPanel NwStatus NwTable`).

- [ ] **Step 5: Commit**

```bash
git add scripts/nexus-web/app scripts/nexus-web/tests/nightwatch-fixtures.ts scripts/nexus-web/tests/unit/stories.test.ts
git commit -m "feat(nexus-web): add the Nightwatch shell, top bar and state components" -- scripts/nexus-web/app scripts/nexus-web/tests
```

---

### Task 9: Operations and Attention pages

**Files:**
- Create: `scripts/nexus-web/app/pages/nightwatch/index.vue` (Operations), `scripts/nexus-web/app/pages/nightwatch/attention.vue`; components `scripts/nexus-web/app/components/nw/PhaseTable.vue`, `WorkersTable.vue`, `LastEvents.vue`, `ScanCard.vue`, `AttentionTable.vue`, each with a `*.stories.ts`
- Test: `scripts/nexus-web/app/components/nw/operations.test.ts`

**Interfaces:**
- Consumes: Task 7 (`useNightwatchPoll`, `loadOverview`, `loadAttention`, `nw-format`), Task 8 (`NwPanel`, `NwStatus`, `NwTable`, layout `nightwatch`, fixtures).
- Produces (props, exact):
  - `PhaseTable`: `{ rows: Overview['tickets']['rows']; lockTicket: string | null; windowDays: number; nowMs: number }`; footer text exactly `one claimed ticket at a time (scan lock) · window: 7 days` (the number comes from `windowDays`).
  - `WorkersTable`: `{ workers: RunRow[]; nowMs: number }`; columns Health, Key (link to `/nightwatch/run/?id=<run>`), Role, Seat, Phase, Elapsed, Tokens (`-`, `title="not measured"`); empty text `No worker is running.`
  - `LastEvents`: `{ events: Overview['lastEvents'] }`; time `fmtUtc7`; empty `No events yet.`
  - `ScanCard`: `{ scan: Overview['scan']; lockTicket: string | null }`.
  - `AttentionTable`: `{ open: Attention['open']; resolved: Attention['resolved']; nowMs: number }`; title `Waiting on Jack`; empty `Nothing waits for you.`; no buttons.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/nexus-web/app/components/nw/operations.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { attentionFixture, overviewFixture } from '../../../tests/nightwatch-fixtures'
import AttentionTable from './AttentionTable.vue'
import LastEvents from './LastEvents.vue'
import PhaseTable from './PhaseTable.vue'
import WorkersTable from './WorkersTable.vue'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')

describe('PhaseTable', () => {
  it('lists the seven phases and states the lock and the window on screen', async () => {
    const o = overviewFixture()
    const w = await mountSuspended(PhaseTable, { props: { rows: o.tickets.rows, lockTicket: 'DGS-590', windowDays: 7, nowMs: NOW } })
    for (const p of ['claimed', 'building', 'review', 'merge-ready', 'merged', 'released', 'lost']) expect(w.text()).toContain(p)
    expect(w.text()).toContain('one claimed ticket at a time (scan lock)')
    expect(w.text()).toContain('window: 7 days')
    expect(w.text()).toContain('DGS-590')
  })
})

describe('WorkersTable', () => {
  it('links each worker to its run and shows tokens as not measured', async () => {
    const w = await mountSuspended(WorkersTable, { props: { workers: overviewFixture().workers, nowMs: NOW } })
    const links = w.findAll('a').map((a) => a.attributes('href'))
    expect(links[0]).toMatch(/^\/nightwatch\/run\/\?id=/)
    expect(w.text()).toContain('stalled')
    expect(w.find('[title="not measured"]').exists()).toBe(true)
  })
  it('says so when no worker runs', async () => {
    const w = await mountSuspended(WorkersTable, { props: { workers: [], nowMs: NOW } })
    expect(w.text()).toContain('No worker is running.')
  })
})

describe('LastEvents', () => {
  it('shows UTC+7 times and an empty line', async () => {
    const w = await mountSuspended(LastEvents, { props: { events: overviewFixture().lastEvents } })
    expect(w.text()).toMatch(/\d\d:\d\d/)
    const e = await mountSuspended(LastEvents, { props: { events: [] } })
    expect(e.text()).toContain('No events yet.')
  })
})

describe('AttentionTable', () => {
  it('lists open items with age, kind and cause, and has no button', async () => {
    const a = attentionFixture()
    const w = await mountSuspended(AttentionTable, { props: { open: a.open, resolved: a.resolved, nowMs: NOW } })
    expect(w.text()).toContain('Waiting on Jack')
    expect(w.text()).toContain(a.open[0].cause)
    expect(w.find('button').exists()).toBe(false)
  })
  it('empty says nothing waits', async () => {
    const w = await mountSuspended(AttentionTable, { props: { open: [], resolved: [], nowMs: NOW } })
    expect(w.text()).toContain('Nothing waits for you.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/nexus-web && pnpm vitest run app/components/nw/operations.test.ts`
Expected: FAIL (components missing).

- [ ] **Step 3: Write the implementation**

Write the five components (tables use `NwTable` or plain `<table>` with `<caption class="sr-only">`, header cells `<th scope="col">`) and the two pages, following `mock.html` and the Interfaces above.

`pages/nightwatch/index.vue`:

```vue
<script setup lang="ts">
import { inject } from 'vue'
definePageMeta({ layout: 'nightwatch' })
useHead({ title: 'Operations · Nightwatch' })
const nw = inject<{ overview: Ref<Overview | null>; stale: Ref<boolean>; loading: Ref<boolean>; refresh: () => Promise<void> }>('nwOverview')!
const nowMs = useNow()   // a ref updated every 30 s, defined in utils/use-now.ts below
</script>
<template>
  <h1>Operations</h1>
  <p class="sub">Tickets per phase, active workers and the latest events.</p>
  <NwPanel v-if="nw.loading.value && !nw.overview.value" kind="loading" />
  <NwPanel v-else-if="!nw.overview.value" kind="error" title="The operations view is not available right now." @retry="nw.refresh()" />
  <template v-else>
    <p v-if="nw.stale.value" class="banner" role="status">The last update failed. Showing the last good data.</p>
    <PhaseTable :rows="nw.overview.value.tickets.rows" :lock-ticket="nw.overview.value.tickets.lockTicket" :window-days="nw.overview.value.tickets.windowDays" :now-ms="nowMs" />
    <ScanCard :scan="nw.overview.value.scan" :lock-ticket="nw.overview.value.tickets.lockTicket" />
    <WorkersTable :workers="nw.overview.value.workers" :now-ms="nowMs" />
    <LastEvents :events="nw.overview.value.lastEvents" />
  </template>
</template>
```

Add `app/utils/use-now.ts` (`export function useNow(everyMs = 30_000): Ref<number>`, a ref of `Date.now()` that updates on an interval and clears it with `onScopeDispose`; add a one-test file with fake timers). `pages/nightwatch/attention.vue` polls `loadAttention` with its own `useNightwatchPoll` and renders `AttentionTable`, with `NwPanel` for loading and error. The "empty" state for Operations workers is inside `WorkersTable`; the page-level empty text for a depot with no runs reads `No worker is running. The next scan starts at 00:00 (UTC+7).` (put it in `WorkersTable`'s empty slot; check the test string `No worker is running.` still matches as a substring).

Stories (fixtures only): `PhaseTable` (`Default`, `Empty` with all zero rows), `WorkersTable` (`Default`, `Empty`), `LastEvents` (`Default`, `Empty`), `ScanCard` (`Away`, `BreakerOpen`, `NoScanYet`), `AttentionTable` (`Default`, `Empty`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/nexus-web && pnpm vitest run && pnpm nuxt typecheck`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/nexus-web/app
git commit -m "feat(nexus-web): add the Operations and Attention pages" -- scripts/nexus-web/app
```

---

### Task 10: Runs, Run detail and Plan pages

**Files:**
- Create: pages `scripts/nexus-web/app/pages/nightwatch/runs.vue`, `run.vue`, `plan.vue`; components `RunsTable.vue`, `RunFilters.vue`, `PipelineBar.vue`, `EventStream.vue`, `BudgetCard.vue`, `RecordCard.vue`, `OrderCard.vue`, `PlanTasks.vue`, `VerdictTable.vue`, each with a `*.stories.ts`; composable `scripts/nexus-web/app/composables/useEventTail.ts`
- Test: `scripts/nexus-web/app/components/nw/runs.test.ts`, `scripts/nexus-web/app/composables/useEventTail.test.ts`

**Interfaces:**
- Consumes: Tasks 7 to 9.
- Produces (props, exact):
  - `RunsTable`: `{ runs: RunRow[]; nowMs: number }`; columns State, Key (link `/nightwatch/run/?id=…`), Role, Seat / model, Trigger, Started (`fmtDay`), Duration (`fmtDuration`), Tokens (`-`, not measured), Delivery (`merged · pushed`, else `-`); empty `No run yet.`
  - `RunFilters`: `{ modelValue: { state: string; role: string; trigger: string; ticket: string } }`, emits `update:modelValue`; four labelled controls (`State`, `Role`, `Trigger`, `Ticket`). The page keeps the value in the URL query (`?state=&role=&trigger=&ticket=`) and sends it to `loadRuns`; the empty text with a filter is `No run matches.`
  - `PipelineBar`: `{ steps: RunDetail['pipeline'] }`; six steps in order with `fmtUtc7` times; `lost` has the bad colour and the word `lost`.
  - `EventStream`: `{ lines: EventRow[]; total: number; group: 'all' | 'agent' | 'system' | 'errors'; tail: boolean; hasEarlier: boolean }`, emits `update:group`, `update:tail`, `earlier`. Segmented control with `aria-pressed`; `Tail: on` / `Tail: off`; badge `<total> events`; empty `No events yet.`
  - `useEventTail(run: string, opts?: { fetch?: typeof fetch; base?: string; intervalMs?: number })` returns `{ lines: Ref<EventRow[]>; total: Ref<number>; group: Ref<Group>; tail: Ref<boolean>; hasEarlier: Ref<boolean>; error: Ref<boolean>; loadEarlier(): Promise<void>; setGroup(g: Group): Promise<void> }`. First load `tail=200`; each poll sends `since=<last total>` (line count) and appends; `loadEarlier` sends `before=<smallest n>` and `tail=200`; changing the group reloads from `tail=200`; with `tail` off the polling does not append.
  - `BudgetCard`: `{ budget: RunDetail['budget'] }` (bar = `elapsedMin / limitMin`, capped at 100 %, text `building 0:41 of 45 min`, and the three limits). `RecordCard`: `{ record: Record<string, unknown> }` (key/value list and a collapsed raw JSON `<details>`). `OrderCard`: `{ order: RunDetail['order'] }` (`Order not available` when not available).
  - `PlanTasks`: `{ plan: Plan }` (heading `Task n of m`, task list with `done` / `fix round R` / `waiting`); `VerdictTable`: `{ verdicts: Plan['verdicts']; ledgerError: boolean }` (`ledger unreadable` when `ledgerError`).

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/nexus-web/app/composables/useEventTail.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventsFixture } from '../../tests/nightwatch-fixtures'
import { useEventTail } from './useEventTail'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function fakeApi(total: number) {
  const urls: string[] = []
  const state = { total }
  const fetch = async (u: string | URL | Request) => {
    const url = new URL(String(u))
    urls.push(url.search)
    const since = Number(url.searchParams.get('since') ?? 0)
    const before = url.searchParams.get('before')
    const tail = Number(url.searchParams.get('tail') ?? 1e9)
    let lines = eventsFixture(state.total).lines.filter((l) => l.n > since && (before === null || l.n < Number(before)))
    lines = lines.slice(-tail)
    return new Response(JSON.stringify({ run: 'b-1', total: state.total, from: since, lines }), { status: 200 })
  }
  return { fetch: fetch as typeof globalThis.fetch, urls, state }
}

describe('useEventTail', () => {
  it('loads the last 200 lines first, then asks only for lines after the line count', async () => {
    const api = fakeApi(300)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(api.urls[0]).toBe('?tail=200')
    expect(t.lines.value).toHaveLength(200)
    expect(t.total.value).toBe(300)
    expect(t.hasEarlier.value).toBe(true)
    api.state.total = 303
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.urls[1]).toBe('?since=300')
    expect(t.lines.value).toHaveLength(203)
    expect(t.lines.value.at(-1)?.n).toBe(303)
  })
  it('does not append while tail is off', async () => {
    const api = fakeApi(10)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    t.tail.value = false
    api.state.total = 15
    await vi.advanceTimersByTimeAsync(20_000)
    expect(t.lines.value).toHaveLength(10)
  })
  it('loadEarlier sends before=<smallest n> and prepends', async () => {
    const api = fakeApi(500)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    await t.loadEarlier()
    expect(api.urls.at(-1)).toBe('?before=301&tail=200')
    expect(t.lines.value[0].n).toBe(101)
    expect(t.lines.value).toHaveLength(400)
  })
  it('a group change reloads with the group and the tail', async () => {
    const api = fakeApi(50)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    await t.setGroup('errors')
    expect(api.urls.at(-1)).toBe('?group=errors&tail=200')
  })
})
```

```ts
// scripts/nexus-web/app/components/nw/runs.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { eventsFixture, planFixture, runDetailFixture, runsFixture } from '../../../tests/nightwatch-fixtures'
import BudgetCard from './BudgetCard.vue'
import EventStream from './EventStream.vue'
import OrderCard from './OrderCard.vue'
import PipelineBar from './PipelineBar.vue'
import PlanTasks from './PlanTasks.vue'
import RunsTable from './RunsTable.vue'
import VerdictTable from './VerdictTable.vue'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')

describe('RunsTable', () => {
  it('shows a row per run with a link and the delivery words', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: runsFixture().runs, nowMs: NOW } })
    expect(w.findAll('tbody tr').length).toBe(runsFixture().runs.length)
    expect(w.find('a').attributes('href')).toMatch(/^\/nightwatch\/run\/\?id=/)
    expect(w.text()).toContain('merged · pushed')
  })
  it('says no run yet', async () => {
    expect((await mountSuspended(RunsTable, { props: { runs: [], nowMs: NOW } })).text()).toContain('No run yet.')
  })
})

describe('PipelineBar', () => {
  it('has six steps in order, a time or a dash, and the word lost', async () => {
    const steps = runDetailFixture().pipeline
    const w = await mountSuspended(PipelineBar, { props: { steps } })
    expect(w.findAll('li')).toHaveLength(6)
    expect(w.text().indexOf('Claimed')).toBeLessThan(w.text().indexOf('Pushed'))
    const lost = steps.map((s, i) => (i === 2 ? { ...s, state: 'lost' as const } : s))
    expect((await mountSuspended(PipelineBar, { props: { steps: lost } })).text()).toContain('lost')
  })
})

describe('EventStream', () => {
  const base = { lines: eventsFixture(5).lines, total: 5, group: 'all' as const, tail: true, hasEarlier: true }
  it('marks the active group with aria-pressed and emits changes', async () => {
    const w = await mountSuspended(EventStream, { props: base })
    expect(w.find('button[aria-pressed="true"]').text()).toContain('All')
    await w.findAll('button').find((b) => b.text() === 'Errors')!.trigger('click')
    expect(w.emitted('update:group')![0]).toEqual(['errors'])
    await w.findAll('button').find((b) => b.text().startsWith('Tail'))!.trigger('click')
    expect(w.emitted('update:tail')![0]).toEqual([false])
  })
  it('shows the count, an earlier link and the empty line', async () => {
    const w = await mountSuspended(EventStream, { props: base })
    expect(w.text()).toContain('5 events')
    await w.find('[data-earlier]').trigger('click')
    expect(w.emitted('earlier')).toHaveLength(1)
    expect((await mountSuspended(EventStream, { props: { ...base, lines: [], total: 0, hasEarlier: false } })).text()).toContain('No events yet.')
  })
  it('shows no prompt text: only type and the listed data keys', async () => {
    const w = await mountSuspended(EventStream, { props: base })
    expect(w.text()).not.toMatch(/session_id|prompt/)
  })
})

describe('BudgetCard, OrderCard', () => {
  it('shows elapsed of limit and the three limits', async () => {
    const w = await mountSuspended(BudgetCard, { props: { budget: { phase: 'building', limitMin: 45, elapsedMin: 41, building: 45, review: 60, merge: 20 } } })
    expect(w.text()).toContain('41')
    expect(w.text()).toContain('45')
    expect(w.text()).toContain('60')
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('41')
  })
  it('an order that is not available is not an error', async () => {
    const w = await mountSuspended(OrderCard, { props: { order: { available: false, text: '' } } })
    expect(w.text()).toContain('Order not available')
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('Plan components', () => {
  it('shows task n of m and the task states', async () => {
    const w = await mountSuspended(PlanTasks, { props: { plan: planFixture() } })
    expect(w.text()).toContain('Task 3 of 7')
    expect(w.text()).toContain('fix round 1')
  })
  it('verdicts and the unreadable ledger notice', async () => {
    const w = await mountSuspended(VerdictTable, { props: { verdicts: planFixture().verdicts, ledgerError: false } })
    expect(w.text()).toContain('parked')
    expect((await mountSuspended(VerdictTable, { props: { verdicts: [], ledgerError: true } })).text()).toContain('ledger unreadable')
  })
})
```

`eventsFixture(n)` returns `{ run, total: n, from: 0, lines }` with `n` lines numbered 1..n of type `tool` (every 7th `blocked`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/nexus-web && pnpm vitest run app/composables/useEventTail.test.ts app/components/nw/runs.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write the implementation**

`app/composables/useEventTail.ts`:

```ts
import { onScopeDispose, ref } from 'vue'
import type { EventRow } from '#nightwatch-schema'
import { loadEvents, type ApiOptions } from './nightwatch-api'

export type Group = 'all' | 'agent' | 'system' | 'errors'
const PAGE = 200

export function useEventTail(run: string, opts: ApiOptions & { intervalMs?: number } = {}) {
  const api: ApiOptions = { base: opts.base, fetch: opts.fetch }
  const interval = opts.intervalMs ?? 10_000
  const lines = ref<EventRow[]>([])
  const total = ref(0)
  const group = ref<Group>('all')
  const tail = ref(true)
  const hasEarlier = ref(false)
  const error = ref(false)
  let seen = 0   // the line count of the last answer: the cursor
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const g = (): { group?: string } => (group.value === 'all' ? {} : { group: group.value })

  async function first(): Promise<void> {
    try {
      const r = await loadEvents(run, { ...g(), tail: PAGE }, api)
      lines.value = r.lines
      total.value = r.total
      seen = r.total
      hasEarlier.value = r.lines.length > 0 && r.lines[0].n > 1
      error.value = false
    } catch { error.value = true }
  }
  async function poll(): Promise<void> {
    if (stopped) return
    if (tail.value && !error.value) {
      try {
        const r = await loadEvents(run, { since: seen, ...g() }, api)
        if (r.lines.length) lines.value = [...lines.value, ...r.lines]
        total.value = r.total
        seen = r.total
      } catch { error.value = true }
    } else if (error.value) {
      await first()
    }
    if (!stopped) timer = setTimeout(() => { void poll() }, interval)
  }
  async function loadEarlier(): Promise<void> {
    const smallest = lines.value[0]?.n
    if (smallest === undefined) return
    try {
      const r = await loadEvents(run, { before: smallest, ...g(), tail: PAGE }, api)
      lines.value = [...r.lines, ...lines.value]
      hasEarlier.value = r.lines.length > 0 && r.lines[0].n > 1
    } catch { error.value = true }
  }
  async function setGroup(next: Group): Promise<void> { group.value = next; await first() }

  void first().then(() => { if (!stopped) timer = setTimeout(() => { void poll() }, interval) })
  onScopeDispose(() => { stopped = true; if (timer) clearTimeout(timer) })
  return { lines, total, group, tail, hasEarlier, error, loadEarlier, setGroup }
}
```

(The test calls `useEventTail` outside a component, so `onScopeDispose` must be guarded: wrap it as `if (getCurrentScope()) onScopeDispose(...)` and import `getCurrentScope` from `vue`. Do the same guard in `useNightwatchPoll` from Task 7 if its test warns.)

Write the components per the Interfaces and `mock.html`. Pages:

- `runs.vue`: reads `route.query`, polls `loadRuns(filters)` (a new poll when the filters change: stop the old one with `stop()`), writes filter changes with `navigateTo({ query }, { replace: true })`, shows `NwPanel` for loading, error and empty (`No run matches.` with a filter, `No run yet.` without).
- `run.vue`: `const id = useRoute().query.id`; no id or a bad value shows the empty panel "This run does not exist."; polls `loadRun(id)`; a 404 (`NightwatchApiError.status === 404`) shows the same panel and stops polling; uses `useEventTail(id)` for the stream; header with `NwStatus`, then `PipelineBar`, then the two columns (`EventStream` on the left; `BudgetCard`, `RecordCard`, `OrderCard` on the right).
- `plan.vue`: `const ticket = useRoute().query.ticket`. With no `ticket` it picks the ticket of the first worker in the overview (inject `nwOverview`) and, with none, shows a ticket picker (a `<select>` built from `loadRuns` rows, unique `ticket`s) and the empty text `Pick a ticket.`; polls `loadPlan(ticket)`; `found: false` shows `No plan yet for this ticket.`.
- Stories (fixtures only): `RunsTable` (`Default`, `Empty`), `RunFilters` (`Default`), `PipelineBar` (`Running`, `Lost`, `Merged`), `EventStream` (`Default`, `Errors`, `Empty`), `BudgetCard` (`Default`, `Over`), `RecordCard`, `OrderCard` (`Available`, `NotAvailable`), `PlanTasks`, `VerdictTable` (`Default`, `LedgerUnreadable`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/nexus-web && pnpm vitest run && pnpm nuxt typecheck`
Expected: PASS and no type errors. Extend `tests/unit/stories.test.ts` with the new story file names.

- [ ] **Step 5: Commit**

```bash
git add scripts/nexus-web/app scripts/nexus-web/tests/unit/stories.test.ts
git commit -m "feat(nexus-web): add the Runs, Run detail and Plan pages" -- scripts/nexus-web/app scripts/nexus-web/tests
```

---

### Task 11: Gates (stub API, e2e, a11y, contrast, visual baselines, built pages)

**Files:**
- Create: `scripts/nexus-web/tests/e2e/nightwatch.spec.ts`, `scripts/nexus-web/tests/a11y/nightwatch-axe.spec.ts`, `scripts/nexus-web/tests/unit/nightwatch-contrast.test.ts`, `scripts/nexus-web/tests/unit/built-nightwatch.test.ts`
- Modify: `scripts/nexus-web/tests/e2e/stub-server.ts` (serve the Nightwatch routes from fixtures through a fake reader), `scripts/nexus-web/tests/a11y/EXCEPTIONS.md` (only if a documented exception is truly needed), `scripts/nexus-web/tests/visual/__screenshots__/` (new baselines)
- Test: the files above

**Interfaces:**
- Consumes: everything above. The stub server builds the real `buildApp` with `deps.nightwatch = { read, jobs }` where `read` is a fake `Reader` returning the Task 8 fixtures by view name, with a mode switch like the existing `/__stub/<mode>` (`nw-ok`, `nw-empty`, `nw-down`, `nw-slow-events`).
- Produces: runnable gates `pnpm e2e`, `pnpm a11y`, `pnpm visual`, `pnpm test:built`.

- [ ] **Step 1: Extend the stub server**

In `tests/e2e/stub-server.ts` add `NwMode = 'nw-ok' | 'nw-empty' | 'nw-down'` to `Mode`, a `nwRead: Reader` that returns `overviewFixture()` minus `nexus` (the route adds it), `attentionFixture()`, `runsFixture()`, `runDetailFixture()`, `eventsFixture(...)` honouring `since`, `before`, `tail`, `group`, `planFixture()`; `nw-empty` returns empty collections (and an overview with no workers); `nw-down` throws `new ReaderError('reader_unavailable')`. Pass `nightwatch: { read: (v, a) => nwRead(v, a), now: () => NOW }` to `buildApp`. The fixture times use `2026-10-22`; set `NOW` for the Nightwatch routes to `Date.parse('2026-10-22T03:00:00Z')`.

- [ ] **Step 2: Write the e2e spec**

```ts
// scripts/nexus-web/tests/e2e/nightwatch.spec.ts
import { expect, test } from '@playwright/test'
import { startStubForNightwatch } from './stub-server.ts'   // thin wrapper over startStub with the built output dir

let stub: Awaited<ReturnType<typeof startStubForNightwatch>>
test.beforeAll(async () => { stub = await startStubForNightwatch() })
test.afterAll(async () => { await stub.close() })
test.beforeEach(async ({ page }) => { await stub.setMode('nw-ok'); await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') }) })

test('Operations shows the top bar, the phase table with its limits and the workers', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/`)
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible()
  await expect(page.getByRole('status', { name: /nexus status/i })).toContainText('Nexus healthy')
  await expect(page.getByText('one claimed ticket at a time (scan lock)')).toBeVisible()
  await expect(page.getByText('window: 7 days')).toBeVisible()
  await expect(page.getByRole('link', { name: /DGS-590/ }).first()).toBeVisible()
})

test('the nav reaches every page and marks the current one', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/`)
  for (const [name, heading] of [['Attention', 'Attention'], ['Runs', 'Runs'], ['Plan', 'Plan']] as const) {
    await page.getByRole('navigation', { name: 'Nightwatch' }).getByRole('link', { name: new RegExp(name) }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Nightwatch' }).locator('[aria-current="page"]')).toContainText(name)
  }
})

test('Runs filters go in the URL and narrow the rows', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/runs/`)
  const rows = page.locator('tbody tr')
  const before = await rows.count()
  await page.getByLabel('Role').selectOption('reviewer')
  await expect(page).toHaveURL(/role=reviewer/)
  expect(await rows.count()).toBeLessThan(before)
})

test('Run detail: pipeline, event filters, tail and earlier lines', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/run/?id=builder-20261022T021000-a1b2c3`)
  await expect(page.getByRole('list', { name: /pipeline/i }).locator('li')).toHaveCount(6)
  await page.getByRole('button', { name: 'Errors' }).click()
  await expect(page.getByRole('button', { name: 'Errors' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Tail: on/ }).click()
  await expect(page.getByRole('button', { name: /Tail: off/ })).toBeVisible()
  await expect(page.getByText('Order not available').or(page.getByText(/Build it/))).toBeVisible()
})

test('an unknown run says so', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/run/?id=nope-1`)
  await expect(page.getByText('This run does not exist.')).toBeVisible()
})

test('Plan shows task n of m and the verdicts', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/plan/?ticket=DGS-590`)
  await expect(page.getByText(/Task \d+ of \d+/)).toBeVisible()
})

test('empty depot: every page shows its empty state and no error', async ({ page }) => {
  await stub.setMode('nw-empty')
  for (const [path, text] of [['/nightwatch/', 'No worker is running.'], ['/nightwatch/attention/', 'Nothing waits for you.'], ['/nightwatch/runs/', 'No run yet.']] as const) {
    await page.goto(`${stub.url}${path}`)
    await expect(page.getByText(text)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
})

test('a down reader shows the error panel with Retry and no code', async ({ page }) => {
  await stub.setMode('nw-down')
  await page.goto(`${stub.url}/nightwatch/runs/`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(await page.content()).not.toMatch(/reader_unavailable/)
})

test('polling: a new attention item appears after 10 s and is announced politely', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/attention/`)
  const before = await page.locator('tbody tr').count()
  await stub.setMode('nw-more-attention')
  await page.clock.fastForward(10_500)
  await expect(page.locator('tbody tr')).toHaveCount(before + 1)
  await expect(page.locator('[aria-live="polite"]')).toContainText(/new/i)
})

test('the page makes only GET requests to /api/v1/nightwatch', async ({ page }) => {
  const seen: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/')) seen.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await page.goto(`${stub.url}/nightwatch/`)
  await page.waitForLoadState('networkidle')
  expect(seen.length).toBeGreaterThan(0)
  for (const s of seen) expect(s).toMatch(/^GET \/api\/v1\/nightwatch\//)
})
```

Add `'nw-more-attention'` to the stub modes (the attention read returns one extra open item). The attention page needs the `aria-live="polite"` region: it announces `1 new attention item` when the open list grows between polls (add that to `attention.vue` if Task 9 did not; the e2e test pins it). Give the pipeline list `aria-label="Run pipeline"`.

- [ ] **Step 3: Write the a11y spec, contrast test and built tests**

```ts
// scripts/nexus-web/tests/a11y/nightwatch-axe.spec.ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { startStubForNightwatch } from '../e2e/stub-server.ts'

let stub: Awaited<ReturnType<typeof startStubForNightwatch>>
test.beforeAll(async () => { stub = await startStubForNightwatch() })
test.afterAll(async () => { await stub.close() })

const PAGES = ['/nightwatch/', '/nightwatch/attention/', '/nightwatch/runs/', '/nightwatch/run/?id=builder-20261022T021000-a1b2c3', '/nightwatch/plan/?ticket=DGS-590']
for (const scheme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`axe: ${path} ${scheme}`, async ({ page }) => {
      await stub.setMode('nw-ok')
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(`${stub.url}${path}`)
      await page.locator('main h1').waitFor()
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })
  }
}
```

```ts
// scripts/nexus-web/tests/unit/nightwatch-contrast.test.ts
// Every text/background pair of the Nightwatch tokens, light and dark. Read the colours from the SCSS, convert oklch to sRGB, check WCAG AA.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scss = readFileSync(join(__dirname, '../../app/assets/nightwatch-tokens.scss'), 'utf8')
function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b, m_ = l - 0.1055613458 * a - 0.0638541728 * b, s_ = l - 0.0894841775 * a - 1.291485548 * b
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3]
  const lin = [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S]
  return lin.map((x) => Math.min(1, Math.max(0, x))) as [number, number, number]   // linear sRGB, which is what luminance needs
}
const lum = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const ratio = (a: [number, number, number], b: [number, number, number]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
function tokens(block: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {}
  for (const m of block.matchAll(/--nw-([a-z0-9-]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)) out[m[1]] = oklchToRgb(Number(m[2]) / 100, Number(m[3]), Number(m[4]))
  return out
}
const dark = tokens(scss.slice(scss.indexOf('.nw {'), scss.indexOf('@mixin')))
const light = tokens(scss.slice(scss.indexOf('@mixin'), scss.indexOf('@media')))
const TEXT = ['text', 'text-2', 'text-3', 'primary', 'ok', 'warn', 'bad', 'info']
const GROUNDS = ['bg', 'surface', 'raised']

describe.each([['dark', { ...dark }], ['light', { ...dark, ...light }]] as const)('%s tokens', (_name, t) => {
  it.each(TEXT.flatMap((f) => GROUNDS.map((g) => [f, g] as const)))('%s on %s is at least 4.5:1', (f, g) => {
    expect(ratio(t[f], t[g])).toBeGreaterThanOrEqual(4.5)
  })
  it('borders against the surface are at least 1.3:1 and strong borders 3:1 is not required for decoration', () => {
    expect(ratio(t.strong, t.surface)).toBeGreaterThanOrEqual(1.3)
  })
})
```

If a pair fails in this test, change the token value in `nightwatch-tokens.scss` (and in `mock.html` if it differs), never the threshold. The `--nw-primary` value on `--nw-raised` in light mode is the one most likely to need a darker L.

`tests/unit/built-nightwatch.test.ts` (skipped without `.output/public`, like `built-page.test.ts`): `nightwatch/index.html`, `nightwatch/attention/index.html`, `nightwatch/runs/index.html`, `nightwatch/run/index.html`, `nightwatch/plan/index.html` exist; each holds its `<h1>` and no fixture value (`DGS-590`, `builder-2026`); no built file contains `https://`-hosted font or script URLs other than the page's own; every `/api/` path found in the JS starts with `/api/v1/nightwatch` or `/api/v1/life-calendar`; the Warren notice `Copyright (c) 2026 Jaymin West` is present in a built CSS file (so the notice ships). Add the five pages to `perf`/lhci only if their config lists pages (check `lighthouserc.*.cjs`; if it lists URLs, add `/nightwatch/`).

- [ ] **Step 4: Run the whole web gate and make the baselines**

```bash
cd scripts/nexus-web
pnpm vitest run
pnpm nuxt typecheck
pnpm build-storybook
pnpm e2e
pnpm a11y
pnpm visual:update      # first run only: writes the new baselines for the new stories
pnpm visual             # must pass without --update-snapshots
pnpm test:built
```

Expected: all PASS. `visual:update` must only add files for the new Nightwatch stories (`git status` shows new PNGs under `tests/visual/__screenshots__/` and no changed Life Calendar PNG; a changed Life Calendar baseline means the router move broke the old page: fix the code). Open at least one new baseline per screen type and compare it to `mock.html` by eye; note differences in the report, do not block on taste (Jack reviews).

- [ ] **Step 5: Commit**

```bash
git add scripts/nexus-web/tests
git commit -m "test(nexus-web): add the Nightwatch e2e, axe, contrast, built and visual gates" -- scripts/nexus-web/tests
```

---

### Task 12: Docs and the full check

**Files:**
- Modify: `packages/cli/src/run/README.md` (one line pointing to `dg nightwatch view`), `scripts/nexus-api/install.sh` only if Task 6 step 5 found a file list
- Create: `.digismith/board/DGS-586—nightwatch-monitoring-ui/runbook-text.md` (the lines the conductor adds to the runbook: what the dashboard is, the URL `https://pazurite.com/nightwatch/`, the post-merge steps from design section 10, and the rule that the API needs `packages/cli/dist` built)

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: nothing new.

- [ ] **Step 1: Write the docs**

Add to `packages/cli/src/run/README.md` under "Commands": `- \`dg nightwatch view <overview|attention|runs|run|events|plan> [flags]\` prints one read-only JSON view of the run record for the Nexus API. See \`../nightwatch/README.md\`.` Write `runbook-text.md` with: purpose (2 lines), URL, "after a merge: `pnpm --filter @digismith/cli build`, then `scripts/nexus-api/install.sh`, then `scripts/nexus-web/build-www.sh`; the Builder runs none of them", "a 503 `reader_unavailable` means `packages/cli/dist/index.js` is missing", "out of scope in v1: tokens, token burn, seat windows (a follow-up ticket); no login (DGS-458)".

- [ ] **Step 2: Run the full check**

```bash
pnpm vitest run                                   # root: cli, nexus-api, nexus-shared, scripts
pnpm --filter @digismith/cli build
cd scripts/nexus-web && pnpm vitest run && pnpm nuxt typecheck && pnpm build-storybook && pnpm e2e && pnpm a11y && pnpm visual && pnpm test:built
```

Expected: all PASS. Then confirm the read-only and scope rules by command, and paste the output in the report:

```bash
git grep -nE "writeFile|appendFile|mkdir|rmSync|unlink|rename" -- packages/cli/src/nightwatch scripts/nexus-api/src/nightwatch-reader.ts scripts/nexus-api/src/nightwatch-route.ts | grep -v "test"
git grep -nE "packages/cli/src" -- scripts/nexus-api/src ':!*.test.ts'
git grep -nE "console\." -- scripts/nexus-api/src/nightwatch-reader.ts scripts/nexus-api/src/nightwatch-route.ts
git status --short | grep -v "^??.*\.digismith/board" | head
```

Expected: the first three print nothing (no write call in the Nightwatch code; the API never imports the CLI source; no `console`). The last shows only intended files.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/run/README.md .digismith/board/DGS-586—nightwatch-monitoring-ui/runbook-text.md
git commit -m "docs(nightwatch): document the monitoring UI and its post-merge steps" -- packages/cli/src/run/README.md ".digismith/board/DGS-586—nightwatch-monitoring-ui/runbook-text.md"
```

---

## Self-Review

**Spec coverage** (spec section → task):
- 2 read path, spawn of the built CLI, single flight, 5 s cache, timeout, `reader_unavailable`, shared schema, strip-types rule → Tasks 1, 4, 5, 6.
- 3 routes and query rules, line-count cursor, event row content, event groups, trigger derivation → Tasks 2, 3, 6.
- 4 listen and login: no login, no Caddy change, query-string pages on a static host → Tasks 6 (no change to Caddy), 7 (router), 10 (query ids). The spec text already says no login.
- 5 screens: top bar (Task 8), Operations (Tasks 3, 9), Attention (Tasks 3, 9), Runs (Tasks 3, 10), Run detail (Tasks 3, 10), Plan (Tasks 3, 10). Empty, error and loading states in Tasks 8 to 10 and the e2e spec.
- 6 polling: Task 7 (`useNightwatchPoll`), Task 10 (`useEventTail`), Task 11 (e2e polling and aria-live).
- 7 tokens and seat windows out of scope: "not measured" slots in Tasks 8 to 10; the schema has no token fields.
- 8 visual design and gates: Tasks 7 (tokens and MIT notice), 8 to 10 (stories), 11 (visual, e2e, axe, contrast, built-page).
- 9 tests without Jack: Tasks 2 to 6 (fake depot, fake reader, fake CLI script), 7 to 10 (fake fetch, fake timers), 11 (stub API server with fixtures). No test uses a real depot, ClickUp, herdr or port 4300.
- 10 first use and the conductor's steps: Task 12 `runbook-text.md`.
- 12 checkpoint decisions: phase-table limits on screen (Task 9 test), no login, out of scope tokens, only `mock.html` committed (done before this plan).

**Placeholder scan:** the only deliberately open items are named as "write per the mock and the Interfaces": the Vue templates and SCSS of the components in Tasks 8 to 10, and the fixture builders of `tests/nightwatch-fixtures.ts`. Their required text, props, roles, links and states are fixed by the Interfaces blocks and pinned by the tests in the same task. Everything with logic (schemas, derivations, views, command, reader, routes, polling, tail, formatters, contrast, e2e) has full code.

**Type consistency:** `RunRowView` (CLI `types.ts`) has the same keys as `runRowSchema` (Task 1); the contract test in Task 6 fails if they drift. `ViewName` values equal `VIEW_NAMES`. The CLI flag names (`--run`, `--ticket`, `--since`, `--before`, `--tail`, `--group`, `--state`, `--role`, `--trigger`, `--limit`) are the keys the API reader sends (`run`, `ticket`, `since`, `before`, `tail`, `group`, `state`, `role`, `trigger`, `limit`). `pipelineOf` step names equal `pipelineStepSchema`. The `Group` type in `useEventTail` equals `EVENT_GROUPS`.

**Known deviation from the spec text:** the spec says the schema file is "used by three" (CLI, API, web). The plan keeps the CLI free of the zod import (the CLI package has no `zod` dependency and its `dist` build must not reach into `scripts/`), and uses a contract test instead. Same safety, no cross-package build link.

**Risk the Builder must watch:** Task 7 moves the Life Calendar into `pages/index.vue` and turns on the router. The Life Calendar e2e, visual and built-page tests are the proof that `/` did not change; run them first (Task 7 step 5) and stop if any baseline changes.
