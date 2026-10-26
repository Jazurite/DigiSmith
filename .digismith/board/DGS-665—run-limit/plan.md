# DGS-665 Concurrent-Run Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refuse to start a run that would pass the limit of 2 builders, 1 reviewer and 1 role, counted from the Nightwatch run records.

**Architecture:** One pure module `packages/cli/src/run/limit.ts` counts slots from `listRuns` rows and the factory lock. The limits are read from the `nightwatch:` block of `.digismith/config.yml` by `readGuardrails`. Three callers use the module: `dg run start` (refuses), the autonomous scan (returns `busy`), and the displays (`dg run limit`, `dg autonomous status`, catch-up Health).

**Tech Stack:** TypeScript run with `node --experimental-strip-types`, yargs, vitest. Spec: `spec.md` beside this file (approved by Jack 2026-10-26 ~19:1x UTC+7).

## Global Constraints

- Limits: builder 2 (the factory ticket counts as one of them), reviewer 1, role 1. Defaults when the config has no block. `stale_after_minutes` default 120.
- Kinds: builder = role `builder`; reviewer = role `reviewer`; role = role `scout`, or role `other` with `role_from` `herdr` or `start`. `maestro` and `conductor` never count.
- A run is active only when it has no `ended` (after the last `started`) and no final `lost`, its last event is not `turn_end` or `blocked`, and its last event is newer than the stale window.
- The factory lock (`autonomous/lock.json`) adds one builder slot unless a counted builder run has the same ticket.
- No `--force` flag. The escape for a stuck slot is `dg run event <id> lost`.
- A bad limit value falls back to that kind's default and is a `limitProblems` item; it never stops the scan or the merge gate.
- No record is rewritten or deleted. The limit never pauses or kills a run.
- Tests: vitest with `--maxWorkers=2 --minWorkers=1`, only the changed files until the last run. Package manager: pnpm. Plain, short sentences in user-facing text.
- **Protected paths.** This ticket changes `packages/cli/src/autonomous/` and `.digismith/config.yml`, and may change `scripts/nexus-api/src/scheduler/` (Task 2, Step 6). All three are in `nightwatch.protected_paths`. **The merge needs the Maestro's approval; the conductor must not merge on its own.**
- No code for this ticket is written in refinement. Nobody commits to main outside the ticket's own branch and merge.

---

### Task 1: The counting module

**Files:**
- Create: `packages/cli/src/run/limit.ts`
- Test: `packages/cli/src/run/limit.test.ts`

**Interfaces:**
- Consumes: `RunRow`, `RunRecord` from `./read.ts` and `./record.ts`.
- Produces (later tasks rely on these exact names):
  - `type Kind = "builder" | "reviewer" | "role"`
  - `type Limits = Record<Kind, number>`; `const DEFAULT_LIMITS: Limits = { builder: 2, reviewer: 1, role: 1 }`; `const DEFAULT_STALE_MINUTES = 120`
  - `type SlotState = "busy" | "idle" | "stale" | "closed"`
  - `type Slot = { kind: Kind; run: string; ticket: string | null; state: SlotState; ageMin: number; factory: boolean }`
  - `type Count = { limits: Limits; used: Record<Kind, Slot[]>; stale: Slot[] }`
  - `kindOf(r: RunRecord): Kind | null`
  - `countSlots(rows: RunRow[], lock: { ticket: string } | null, nowMs: number, limits: Limits, staleAfterMinutes: number): Count`
  - `refusal(c: Count, kind: Kind): string | null` (null = free slot)
  - `limitLine(c: Count): string` (`limits: builder 1/2, reviewer 0/1, role 1/1`)
  - `limitRows(c: Count): string[]` (one line per used slot, then `stale:` lines)

- [ ] **Step 1: Write the failing test** (`limit.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { countSlots, DEFAULT_LIMITS, kindOf, limitLine, refusal } from "./limit.ts";
import type { RunRow } from "./read.ts";
import type { RunRecord } from "./record.ts";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const min = (m: number): string => new Date(NOW - m * 60_000).toISOString();

function row(over: { run?: string; role?: RunRecord["role"]; role_from?: RunRecord["role_from"]; ticket?: string | null; last?: string; lastTs?: number; ended?: boolean }): RunRow {
  const record = { run: over.run ?? "r1", role: over.role ?? "builder", role_from: over.role_from ?? "start", ticket: over.ticket === undefined ? "DGS-1" : over.ticket, created_at: min(300) } as RunRecord;
  return { record, summary: { events: 5, first_ts: min(300), last_ts: min(over.lastTs ?? 1), last_type: over.last ?? "tool", ended: over.ended ?? false } };
}
const count = (rows: RunRow[], lock: { ticket: string } | null = null) => countSlots(rows, lock, NOW, DEFAULT_LIMITS, 120);

describe("kindOf", () => {
  it("maps roles to kinds", () => {
    expect(kindOf(row({ role: "builder" }).record)).toBe("builder");
    expect(kindOf(row({ role: "reviewer" }).record)).toBe("reviewer");
    expect(kindOf(row({ role: "scout" }).record)).toBe("role");
    expect(kindOf(row({ role: "other", role_from: "herdr" }).record)).toBe("role");
    expect(kindOf(row({ role: "other", role_from: "start" }).record)).toBe("role");
  });
  it("never counts maestro, conductor or an unlabelled other", () => {
    expect(kindOf(row({ role: "maestro" }).record)).toBeNull();
    expect(kindOf(row({ role: "conductor" }).record)).toBeNull();
    expect(kindOf(row({ role: "other", role_from: "none" }).record)).toBeNull();
    expect(kindOf(row({ role: "other", role_from: "pending" }).record)).toBeNull();
  });
});

describe("countSlots", () => {
  it("counts a busy run and skips ended, lost, idle and stale runs", () => {
    const c = count([
      row({ run: "busy" }),
      row({ run: "ended", ended: true, last: "ended" }),
      row({ run: "lost", last: "lost" }),
      row({ run: "wait-turn", last: "turn_end" }),
      row({ run: "wait-perm", last: "blocked" }),
      row({ run: "old", lastTs: 121 }),
    ]);
    expect(c.used.builder.map((s) => s.run)).toEqual(["busy"]);
    expect(c.stale.map((s) => s.run)).toEqual(["old"]);
  });
  it("counts a /clear run (ended then started) as busy through summary.ended false", () => {
    expect(count([row({ run: "cleared", last: "started" })]).used.builder).toHaveLength(1);
  });
  it("adds the factory lock as one builder and does not count its ticket twice", () => {
    expect(count([], { ticket: "DGS-9" }).used.builder.map((s) => s.factory)).toEqual([true]);
    const c = count([row({ ticket: "DGS-9" })], { ticket: "DGS-9" });
    expect(c.used.builder).toHaveLength(1);
  });
  it("counts an unreadable lock (ticket ?) as one builder", () => {
    expect(count([], { ticket: "?" }).used.builder).toHaveLength(1);
  });
});

describe("refusal and lines", () => {
  it("allows a second builder beside the factory and refuses a third", () => {
    const one = count([row({ run: "hand" })], { ticket: "DGS-9" });
    expect(refusal(one, "builder")).toMatch(/builder 2 of 2 in use/);
    const free = count([], { ticket: "DGS-9" });
    expect(refusal(free, "builder")).toBeNull();
  });
  it("names the open run and its age", () => {
    const c = count([row({ run: "b-1", ticket: "DGS-557" }), row({ run: "b-2", ticket: "DGS-2" })]);
    expect(refusal(c, "builder")).toBe("limit: builder 2 of 2 in use: b-1 (DGS-557, last event 1 min ago), b-2 (DGS-2, last event 1 min ago). Wait for one to finish.");
  });
  it("refuses when the limit is 0", () => {
    const c = countSlots([], null, NOW, { builder: 0, reviewer: 1, role: 1 }, 120);
    expect(refusal(c, "builder")).toMatch(/builder 0 of 0/);
  });
  it("prints the status line", () => {
    expect(limitLine(count([row({}), row({ run: "s", role: "scout", last: "turn_end" })]))).toBe("limits: builder 1/2, reviewer 0/1, role 0/1");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run packages/cli/src/run/limit.test.ts --maxWorkers=2 --minWorkers=1`
Expected: FAIL, `./limit.ts` cannot be resolved.

- [ ] **Step 3: Write `limit.ts`**

```ts
// packages/cli/src/run/limit.ts
// DGS-665: THE count of concurrent runs. Pure: no fs, no yargs. Callers read the rows (listRuns) and the lock.
import type { RunRow } from "./read.ts";
import type { RunRecord } from "./record.ts";

export type Kind = "builder" | "reviewer" | "role";
export type Limits = Record<Kind, number>;
export const KINDS: readonly Kind[] = ["builder", "reviewer", "role"];
export const DEFAULT_LIMITS: Limits = { builder: 2, reviewer: 1, role: 1 };
export const DEFAULT_STALE_MINUTES = 120;

export type SlotState = "busy" | "idle" | "stale" | "closed";
export type Slot = { kind: Kind; run: string; ticket: string | null; state: SlotState; ageMin: number; factory: boolean };
export type Count = { limits: Limits; used: Record<Kind, Slot[]>; stale: Slot[] };

// maestro and conductor are the control plane; an other that is not a herdr or started worker is a person's session.
export function kindOf(r: RunRecord): Kind | null {
  if (r.role === "builder") return "builder";
  if (r.role === "reviewer") return "reviewer";
  if (r.role === "scout") return "role";
  if (r.role === "other" && (r.role_from === "herdr" || r.role_from === "start")) return "role";
  return null;
}

function stateOf(row: RunRow, nowMs: number, staleMs: number): { state: SlotState; ageMin: number } {
  const ts = Date.parse(row.summary.last_ts ?? row.record.created_at);
  const age = Number.isFinite(ts) ? Math.max(0, nowMs - ts) : Number.POSITIVE_INFINITY;
  const ageMin = Number.isFinite(age) ? Math.floor(age / 60_000) : 0;
  const t = row.summary.last_type;
  if (row.summary.ended || t === "lost") return { state: "closed", ageMin };
  if (t === "turn_end" || t === "blocked") return { state: "idle", ageMin };
  if (age > staleMs) return { state: "stale", ageMin };
  return { state: "busy", ageMin };
}

export function countSlots(rows: RunRow[], lock: { ticket: string } | null, nowMs: number, limits: Limits, staleAfterMinutes: number): Count {
  const used: Record<Kind, Slot[]> = { builder: [], reviewer: [], role: [] };
  const stale: Slot[] = [];
  for (const row of rows) {
    const kind = kindOf(row.record);
    if (kind === null) continue;
    const { state, ageMin } = stateOf(row, nowMs, staleAfterMinutes * 60_000);
    const slot: Slot = { kind, run: row.record.run, ticket: row.record.ticket, state, ageMin, factory: false };
    if (state === "busy") used[kind].push(slot);
    else if (state === "stale") stale.push(slot);
  }
  if (lock !== null && !used.builder.some((s) => s.ticket === lock.ticket)) {
    used.builder.push({ kind: "builder", run: "factory lock", ticket: lock.ticket, state: "busy", ageMin: 0, factory: true });
  }
  return { limits, used, stale };
}

const label = (s: Slot): string => (s.factory ? `factory lock (${s.ticket})` : `${s.run} (${s.ticket ?? "-"}, last event ${s.ageMin} min ago)`);

export function refusal(c: Count, kind: Kind): string | null {
  const open = c.used[kind];
  if (open.length < c.limits[kind]) return null;
  return `limit: ${kind} ${open.length} of ${c.limits[kind]} in use${open.length ? `: ${open.map(label).join(", ")}` : ""}. Wait for ${open.length > 1 ? "one" : "it"} to finish.`;
}

export function limitLine(c: Count): string {
  return `limits: ${KINDS.map((k) => `${k} ${c.used[k].length}/${c.limits[k]}`).join(", ")}`;
}

export function limitRows(c: Count): string[] {
  const rows = KINDS.flatMap((k) => c.used[k].map((s) => `${k}  ${label(s)}`));
  for (const s of c.stale) rows.push(`stale  ${s.kind}  ${s.run} (${s.ticket ?? "-"}, ${s.ageMin} min): clear with dg run event ${s.run} lost`);
  return rows;
}
```

Note for the implementer: the "0 of 0" test line uses the same message; the `open.length ? ...` branch avoids a dangling colon.

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm vitest run packages/cli/src/run/limit.test.ts --maxWorkers=2 --minWorkers=1`
Expected: PASS. If the exact-string test differs by a space, fix `limit.ts`, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run/limit.ts packages/cli/src/run/limit.test.ts
git commit -m "feat(dgs-665): count concurrent runs by kind"
```

---

### Task 2: The config: limits and stale window

**Files:**
- Modify: `packages/cli/src/autonomous/guardrails.ts` (the `Guardrails` interface, `readGuardrails`, a new `readLimitsFile`) (protected path)
- Modify: `.digismith/config.yml` (add the block) (protected path)
- Test: `packages/cli/src/autonomous/guardrails.test.ts`
- Check, maybe modify: `scripts/nexus-api/src/scheduler/` (protected path)

**Interfaces:**
- Consumes: `Limits`, `DEFAULT_LIMITS`, `DEFAULT_STALE_MINUTES` from `../run/limit.ts` (type and constants only).
- Produces:
  - `Guardrails` gains `limits: Limits; staleAfterMinutes: number; limitProblems: string[]`.
  - `readLimitsFile(cwd: string): { limits: Limits; staleAfterMinutes: number; problems: string[] }`: no file or no key gives defaults and no problem; an unreadable file gives defaults and one problem.

- [ ] **Step 1: Write the failing tests** (add to `guardrails.test.ts`; use its existing helper style, the file already builds config text strings)

```ts
describe("limits (DGS-665)", () => {
  const base = "nightwatch:\n  scan_every_minutes: 15\n";
  it("defaults to 2, 1, 1 and 120 with no keys", () => {
    const g = readGuardrails(base);
    expect(g.limits).toEqual({ builder: 2, reviewer: 1, role: 1 });
    expect(g.staleAfterMinutes).toBe(120);
    expect(g.limitProblems).toEqual([]);
    expect(g.problems).toEqual([]);
  });
  it("reads a limits block and the stale window", () => {
    const g = readGuardrails(`${base}  limits:\n    builder: 3\n    reviewer: 0\n    role: 2\n  stale_after_minutes: 60\n`);
    expect(g.limits).toEqual({ builder: 3, reviewer: 0, role: 2 });
    expect(g.staleAfterMinutes).toBe(60);
    expect(g.problems).toEqual([]);
  });
  it("falls back per kind on a bad value, as a limit problem and not a guardrail problem", () => {
    const g = readGuardrails(`${base}  limits:\n    builder: many\n    reviewer: 10\n    role: 2\n  stale_after_minutes: 0\n`);
    expect(g.limits).toEqual({ builder: 2, reviewer: 1, role: 2 });
    expect(g.staleAfterMinutes).toBe(120);
    expect(g.limitProblems).toHaveLength(3);
    expect(g.problems).toEqual([]);
  });
  it("reports an unknown kind and a duplicate key as limit problems", () => {
    const g = readGuardrails(`${base}  limits:\n    builders: 2\n    role: 1\n    role: 2\n`);
    expect(g.limitProblems.join(" ")).toMatch(/builders/);
    expect(g.limitProblems.join(" ")).toMatch(/more than once/);
    expect(g.problems).toEqual([]);
  });
  it("still fails an unknown key under nightwatch", () => {
    expect(readGuardrails(`${base}  nonsense: 1\n`).problems[0]).toMatch(/unknown guardrail key "nonsense"/);
  });
  it("readLimitsFile gives defaults without a file", () => {
    expect(readLimitsFile("/nonexistent-dir-dgs665")).toEqual({ limits: { builder: 2, reviewer: 1, role: 1 }, staleAfterMinutes: 120, problems: [] });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run packages/cli/src/autonomous/guardrails.test.ts --maxWorkers=2 --minWorkers=1`
Expected: FAIL (`limits` undefined, `readLimitsFile` not exported).

- [ ] **Step 3: Implement in `guardrails.ts`**

Add `import { DEFAULT_LIMITS, DEFAULT_STALE_MINUTES, KINDS, type Limits } from "../run/limit.ts";`.
Extend the interface and the initial `out` value:

```ts
export interface Guardrails { protectedPaths: string[] | null; budgets: Partial<Record<Phase, number>>; problems: string[]; scanEveryMinutes: number; scanProblems: string[]; limits: Limits; staleAfterMinutes: number; limitProblems: string[] }
// in readGuardrails: out = { ..., limits: { ...DEFAULT_LIMITS }, staleAfterMinutes: DEFAULT_STALE_MINUTES, limitProblems: [] }
```

In the key loop, before the `seen.has(key)` guardrail check, handle the two new keys like `scan_every_minutes` (settings: problems go to `limitProblems`):

```ts
    if (key === "stale_after_minutes") {
      if (seen.has(key)) { out.limitProblems.push(`nightwatch.stale_after_minutes: is set more than once; ${DEFAULT_STALE_MINUTES} used`); out.staleAfterMinutes = DEFAULT_STALE_MINUTES; continue; }
      seen.add(key);
      if (kids.length > 0 || !/^[1-9]\d*$/.test(inline) || Number(inline) > 1440) out.limitProblems.push(`nightwatch.stale_after_minutes: "${inline}" is not a whole number from 1 to 1440; ${DEFAULT_STALE_MINUTES} used`);
      else out.staleAfterMinutes = Number(inline);
      continue;
    }
    if (key === "limits") {
      if (seen.has(key)) { out.limitProblems.push("nightwatch.limits: is set more than once; the first block is used"); continue; }
      seen.add(key);
      if (inline !== "" || kids.length === 0) { out.limitProblems.push("nightwatch.limits: must be a block of 'kind: number' lines; defaults used"); continue; }
      const lseen = new Set<string>();
      for (const kid of kids) {
        const m2 = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(kid);
        if (!m2) { out.limitProblems.push(`nightwatch.limits: line "${kid.trim()}" is not "kind: number"`); continue; }
        const [, kind, rawV] = m2;
        const raw = stripComment(rawV);
        if (!(KINDS as readonly string[]).includes(kind)) { out.limitProblems.push(`nightwatch.limits.${kind} is not a kind (builder, reviewer, role)`); continue; }
        if (lseen.has(kind)) { out.limitProblems.push(`nightwatch.limits.${kind} is set more than once; the first value is used`); continue; }
        lseen.add(kind);
        if (!/^[0-9]$/.test(raw)) { out.limitProblems.push(`nightwatch.limits.${kind}: "${raw}" is not a whole number from 0 to 9; ${DEFAULT_LIMITS[kind as keyof Limits]} used`); continue; }
        out.limits[kind as keyof Limits] = Number(raw);
      }
      continue;
    }
```

Add `readLimitsFile` beside `readScanIntervalFile`, same read-and-fall-back shape:

```ts
/** The limits in force for the config in `cwd` (the working file). No file or no keys: defaults, no problem; an unreadable file is a problem. */
export function readLimitsFile(cwd: string): { limits: Limits; staleAfterMinutes: number; problems: string[] } {
  let text: string;
  try { text = readFileSync(join(cwd, ".digismith", "config.yml"), "utf-8"); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { limits: { ...DEFAULT_LIMITS }, staleAfterMinutes: DEFAULT_STALE_MINUTES, problems: [] };
    return { limits: { ...DEFAULT_LIMITS }, staleAfterMinutes: DEFAULT_STALE_MINUTES, problems: ["nightwatch.limits: .digismith/config.yml cannot be read; defaults used"] };
  }
  const g = readGuardrails(text);
  return { limits: g.limits, staleAfterMinutes: g.staleAfterMinutes, problems: g.limitProblems };
}
```

Update the `unknown guardrail key` message list to `(protected_paths, budgets, scan_every_minutes, limits, stale_after_minutes)`; check that no test pins the old text (`grep -rn "unknown guardrail key" packages scripts`).

- [ ] **Step 4: Run to see it pass**

Run: `pnpm vitest run packages/cli/src/autonomous/guardrails.test.ts --maxWorkers=2 --minWorkers=1`
Expected: PASS.

- [ ] **Step 5: Add the block to `.digismith/config.yml`** under `nightwatch:` after `scan_every_minutes`:

```yaml
  # At most this many runs of each kind are busy at once (DGS-665). The factory ticket counts as one builder.
  # 0 blocks the kind. A bad value falls back to the default and shows in dg autonomous status.
  limits:
    builder: 2
    reviewer: 1
    role: 1
  # A run with no event for this long (minutes) stops counting. Clear it for good with: dg run event <run-id> lost
  stale_after_minutes: 120
```

- [ ] **Step 6: Check the scheduler's reader.** Run `grep -rn "scan_every_minutes\|nightwatch" scripts/nexus-api/src/scheduler/ | grep -v test`. If its reader ignores keys it does not know, change nothing. If it rejects an unknown key under `nightwatch:`, add `limits` and `stale_after_minutes` to its known keys with a test, and say so in the report. Run its test file: `pnpm vitest run scripts/nexus-api/src/scheduler --maxWorkers=2 --minWorkers=1`.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/autonomous/guardrails.ts packages/cli/src/autonomous/guardrails.test.ts .digismith/config.yml scripts/nexus-api/src/scheduler
git commit -m "feat(dgs-665): read run limits from the nightwatch config"
```

---

### Task 3: `dg run start` refuses, `dg run limit` shows

**Files:**
- Create: `packages/cli/src/run/limit-check.ts` (reads rows, lock and config; one function both commands and the scan use)
- Modify: `packages/cli/src/run/index.ts` (`startCommand` handler, new `limitCommand`, register it)
- Test: `packages/cli/src/run/limit-check.test.ts`, `packages/cli/src/run/index.test.ts`

**Interfaces:**
- Consumes: `countSlots`, `refusal`, `limitRows`, `kindOf` from `./limit.ts`; `listRuns` from `./read.ts`; `readLimitsFile` from `../autonomous/guardrails.ts`; `readLock`, `autonomousDir` from `../autonomous/state.ts`.
- Produces: `currentCount(env: NodeJS.ProcessEnv, cwd: string, nowMs?: number): { count: Count; problems: string[] }` (reads `listRuns(env, undefined, { days: 2, nowMs })`, the lock under `autonomousDir(env)`, the limits for `cwd`).
  The factory lock read: a missing lock is `null`; any `readLock` result is passed as `{ ticket }`.

- [ ] **Step 1: Write failing tests.**
  - `limit-check.test.ts`: build a temp depot (`DIGISMITH_DEPOT_DIR` and `AUTONOMOUS_DIR` pointing into `fs.mkdtempSync`), write two builder runs with `createRun` and append a `tool` event with `appendEvent` (from `./events.ts`), and assert `currentCount(...).count.used.builder` has 2 entries; write a `lock.json` and assert the factory slot. Follow the helper style already used in `read.test.ts` and `index.test.ts`.
  - `index.test.ts`: with two open builders, the `start` handler for `--role builder` sets `process.exitCode = 1`, prints a line that starts with `limit: builder 2 of 2 in use`, and writes no new run folder (count the folders before and after). A `--role reviewer` start with the same two builders open succeeds. A `--role maestro` start is never refused. (Mirror how the file's existing tests call the command handler.)

- [ ] **Step 2: Run to see them fail.** `pnpm vitest run packages/cli/src/run/limit-check.test.ts packages/cli/src/run/index.test.ts --maxWorkers=2 --minWorkers=1`. Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
// packages/cli/src/run/limit-check.ts
import { autonomousDir, readLock } from "../autonomous/state.ts";
import { readLimitsFile } from "../autonomous/guardrails.ts";
import { countSlots, type Count } from "./limit.ts";
import { listRuns } from "./read.ts";

export function currentCount(env: NodeJS.ProcessEnv, cwd: string, nowMs: number = Date.now()): { count: Count; problems: string[] } {
  const cfg = readLimitsFile(cwd);
  const lock = readLock(autonomousDir(env));
  const rows = listRuns(env, undefined, { days: 2, nowMs });
  return { count: countSlots(rows, lock === null ? null : { ticket: lock.ticket }, nowMs, cfg.limits, cfg.staleAfterMinutes), problems: cfg.problems };
}
```

In `startCommand`'s handler, before `createRun`:

```ts
      const kind = kindOf({ role: a.role, role_from: "start" } as RunRecord);
      if (kind !== null) {
        const why = refusal(currentCount(process.env, process.cwd()).count, kind);
        if (why !== null) return fail(why);
      }
```

(`a.role` of `scout` and `other` map to `role`; `maestro` and `conductor` give `null`. A role that is not in `ROLES` is still refused by `createRun` itself.)
Add `limitCommand` (`command: "limit"`, option `--json`): prints `limitLine`, then `limitRows` (or `--json` the `Count`), then each config problem as `problem: ...`; always exit 0. Register it in `runCommand`'s builder and in its `describe`. Add the command to `packages/cli/src/run/README.md` Commands list.

- [ ] **Step 4: Run to see them pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/cli/src/run
git commit -m "feat(dgs-665): dg run start refuses over the limit, dg run limit shows it"
```

---

### Task 4: The scan and the status

**Files:**
- Modify: `packages/cli/src/autonomous/scan.ts` (`ScanDeps`, `ScanResult.outcome`, step 2 area) (protected path)
- Modify: `packages/cli/src/autonomous/index.ts` (`defaultDeps` or scan wiring, `statusLines`) (protected path)
- Modify: `packages/cli/src/autonomous/types.ts` only if `EventKind` needs a value (the `busy` event kind exists; add a `reason` field, not a new kind)
- Test: `packages/cli/src/autonomous/scan.test.ts`, `packages/cli/src/autonomous/index.test.ts`

**Interfaces:**
- Consumes: `currentCount` from `../run/limit-check.ts`; `refusal`, `limitLine`, `limitRows` from `../run/limit.ts`.
- Produces: `ScanDeps.builderFull?: () => string | null` (null = a builder slot is free; a string = the refusal text). Optional so old tests keep passing; production always passes it.

- [ ] **Step 1: Write failing tests.**
  - `scan.test.ts` (use the file's fake tracker and fake deps): with `builderFull: () => "limit: builder 2 of 2 in use: ..."` the scan returns `outcome: "busy"`, claims nothing, calls no tracker method, and appends a `busy` event whose fields include `reason: "builder-limit"`. With `builderFull: () => null` it claims as before. A held lock still returns `busy` first (the lock check stays before the limit check).
  - `index.test.ts`: `dg autonomous status` output contains `limits: builder 0/2, reviewer 0/1, role 0/1` for an empty depot, and a `stale runs:` line when a stale builder record exists.

- [ ] **Step 2: Run to see them fail.** `pnpm vitest run packages/cli/src/autonomous/scan.test.ts packages/cli/src/autonomous/index.test.ts --maxWorkers=2 --minWorkers=1`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  In `runScan`, after step 2 (held lock) and before step 2b, add:

```ts
  // 2a. Every builder slot is busy with hand-started runs: wait. A normal wait, so no comment and no attention item.
  if (!d.dryRun && d.builderFull) {
    const why = d.builderFull();
    if (why !== null) {
      appendEvent(d.dir, now, "busy", { ticket: null, reason: "builder-limit", detail: why.slice(0, 300) });
      return { outcome: "busy", candidates: 0, skipped };
    }
  }
```

  In the scan wiring in `index.ts` pass `builderFull: () => refusal(currentCount(process.env, d.mainRepo ?? MAIN_CHECKOUT).count, "builder")`. The lock is not held at this point (step 2 already returned), so the count is hand-started builders only; the claim would be one more.
  In `statusLines`, after the `scan interval` line add `limitLine(count)`, one `problem:` line per config problem, and, when `count.stale` is not empty, `stale runs: <ids> (clear with dg run event <id> lost)`.
  A thrown error inside `builderFull` must not stop the scan: wrap the call, treat a throw as `null`, and append an `attention` note is NOT needed (the scan also runs without this guard when the run folder is missing).

- [ ] **Step 4: Run to see them pass.** Same command, then `pnpm vitest run packages/cli/src/autonomous --maxWorkers=2 --minWorkers=1` once (the whole folder) to catch a broken neighbour.

- [ ] **Step 5: Commit.**

```bash
git add packages/cli/src/autonomous
git commit -m "feat(dgs-665): the scan waits while hand builders fill the limit, status shows limits"
```

---

### Task 5: Catch-up Health line

**Files:**
- Modify: `scripts/catch-up.ts` (data shape and `health` render)
- Modify: the catch-up template file that `catch-up.ts` reads (`TEMPLATE_PATH`; no change if it only holds `<health>`)
- Modify: `scripts/conductor/state-block.ts` (computed-line regex in the Health case)
- Modify: `skills/catch-up/SKILL.md` (name the line)
- Test: `scripts/catch-up.test.ts`, `scripts/conductor/state-block.test.ts`, `scripts/conductor/consult.test.ts`

**Interfaces:**
- Consumes: the string from `limitLine` (computed by whoever builds the catch-up data).
- Produces: `CatchUp.health.limits?: string`. The render prints `- Limits: <value>` after `Open tabs`, and nothing when the field is absent (old data files keep rendering).

- [ ] **Step 1: Write failing tests.**
  `catch-up.test.ts`: a data file with `health.limits: "builder 1/2, reviewer 0/1, role 1/1"` renders a line `- Limits: builder 1/2, reviewer 0/1, role 1/1`; a data file without it renders no `Limits` line. `state-block.test.ts`: a Health section holding `- Limits: builder 1/2, reviewer 0/1, role 1/1` parses with no problem (like `Server` and `Open tabs`).

- [ ] **Step 2: Run to see them fail.** `pnpm vitest run scripts/catch-up.test.ts scripts/conductor/state-block.test.ts --maxWorkers=2 --minWorkers=1`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `catch-up.ts` add `limits?: string` to the health type and push `- Limits: ${health.limits}` only when it is a non-empty string. In `state-block.ts` change `/^(Server|Open tabs):/` to `/^(Server|Open tabs|Limits):/`. Find where `consult` builds the health object (`grep -n "tabs" scripts/conductor/*.ts | grep -v test`) and set `limits` from `limitLine(currentCount(process.env, repoRoot).count)` with the leading `limits: ` removed; a failure leaves the field out (Health must never break the catch-up). Add the `Limits` line to the Health description in `skills/catch-up/SKILL.md`.

- [ ] **Step 4: Run to see them pass.** Same command plus `scripts/conductor/consult.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts skills/catch-up/SKILL.md
git commit -m "feat(dgs-665): show the run limits in the catch-up Health"
```

---

### Task 6: Write the rule where sessions read it

**Files:**
- Modify (in the PR): the conductor and Maestro skill text that holds the worker rules. Find them with `grep -rln "The rule\|Start of a ticket\|dm-03" skills .claude-plugin 2>/dev/null`.
- Modify (by hand, **not in the PR**): `.digismith/sessions/workbox.md` ("The rule", "Start of a ticket" S3b). It is git-excluded on purpose, so the conductor edits it after the merge.
- Test: none (text). Check with `grep`.

- [ ] **Step 1: Write these four lines** into each skill text found and into the runbook:
  1. "At most 2 builders (the factory ticket counts as one), 1 reviewer and 1 role are busy at once. `dg run limit` shows the count."
  2. "`dg run start` refuses a start over the limit and names the open run. Queue the worker and retry at the next checkpoint. Never start the worker some other way."
  3. "An idle builder (waiting for a merge or a review) is not counted. Before you wake one that is not the factory's with a fix order, run `dg run limit` and wait if its kind is full."
  4. "A run that shows as `stale` is a dead pane. Clear it with `dg run event <run-id> lost`. Never pause or kill a running agent to make room."
  In the runbook also replace the dm-03 hand rule with "retired by DGS-665, see `dg run limit`" and in S3b add one sentence: "a refused `dg run start` is a queue signal, not an error to work around".

- [ ] **Step 2: Check.** `grep -rn "dg run limit" skills .digismith/sessions/workbox.md | wc -l` is at least 2. Run `git status` and confirm `.digismith/sessions/` shows no change (it is excluded).

- [ ] **Step 3: Commit** (skills only).

```bash
git add skills
git commit -m "docs(dgs-665): the run limit in the conductor and Maestro skills"
```

---

### Task 7: Whole-ticket check (the Reviewer's list)

- [ ] **Step 1:** Run only the touched test files once more together: `pnpm vitest run packages/cli/src/run packages/cli/src/autonomous/guardrails.test.ts packages/cli/src/autonomous/scan.test.ts packages/cli/src/autonomous/index.test.ts scripts/catch-up.test.ts scripts/conductor --maxWorkers=2 --minWorkers=1`. Expected: PASS.
- [ ] **Step 2: Live check on the Workbox** (read-only): `dg run limit` prints a plausible count against `dg run list`; `dg autonomous status` shows the `limits:` line.
- [ ] **Step 3:** Merge only after the Maestro approves (protected paths), with the post-finish hooks 01-03, then run first-use: `dg run limit` once.

---

## Spec coverage

| Spec | Task |
| --- | --- |
| D1 one module | 1 |
| D2 kinds, D3 active, D4 stale, D5 factory lock | 1 |
| D6 scan, `dg run start`, conductor step | 3, 4, 6 |
| D7 config | 2 |
| D8 display | 3 (`dg run limit`), 4 (status), 5 (Health) |
| D9 where written | 6 |
| Testing, protected paths | per task, Global Constraints |

## Definition of Ready

- **Spec:** `spec.md` in the draft folder, approved by Jack (Maestro, 2026-10-26 ~19:1x UTC+7), with builders 2, reviewers 1, roles 1. Attached to DGS-665.
- **Plan:** this file, attached to DGS-665. Seven tasks; the build is one builder, about a day of work, no parallel parts (Task 2 before 3 and 4, Task 1 first).
- **Milestone:** none is set on the ticket today. Proposed: Genesis (it is factory hardening that must hold before more builders run; it does not depend on another milestone). The Maestro confirms or corrects.
- **Blockers:** none. DGS-577 touches the catch-up and state block (Health text); if it is not merged when the build starts, Task 5 rebases on it.
- **Mode:** Autonomous. The ticket is fully specified and the factory may claim it. The merge stops at the Maestro's approval because of the protected paths (the factory's merge gate already enforces that).
- **Sign-off:** Auto confirmed. Reason: an internal tool with a fully defined contract; no taste, no public wording, no personal data, no cost, nothing irreversible. The numbers (2, 1, 1) are Jack's own.
- **Protected paths:** `packages/cli/src/autonomous/`, `.digismith/config.yml`, and maybe `scripts/nexus-api/src/scheduler/`. Merge needs the Maestro's approval.
