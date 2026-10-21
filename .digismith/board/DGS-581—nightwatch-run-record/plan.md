# Nightwatch run record and event log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every worker run gets a frozen `run.json` at dispatch and an append-only `events.jsonl` written by plugin hooks and `dg run event`, with `dg run list/show/tail` to read them.

**Architecture:** A small library `packages/cli/src/run/` (node:fs and node:path only in the hook path) holds paths, the run record, the locked event writer, the hook handler and the readers. `scripts/run-events/hook-cli.ts` is a thin script for the hooks. `dg run` (yargs) wraps the library. `hooks/hooks.json` gets five new commands that test `DIGISMITH_RUN_ID` in the shell before node starts.

**Tech Stack:** Node 24 with `--experimental-strip-types`, TypeScript, yargs, vitest, pnpm.

Spec: `.digismith/board/DGS-581—nightwatch-run-record/design.html`. Read it first.

## Global Constraints

- Depot root: `$DIGISMITH_DEPOT_DIR` when set and not empty, else `~/.digismith-depot`. Tests always set it to a temp dir.
- Run directory: `<root>/runs/<KEY>/<run-id>/` with `run.json`, `events.jsonl`, `seq` (counter), `lock/` (lock directory).
- Run id: `<role>-<UTC yyyymmddThhmmss>-<6 hex>`. New per attempt, never reused. Key and id match `^[A-Za-z0-9][A-Za-z0-9._-]*$` before they join a path.
- run.json: schema `nightwatch-run/v1`, written once with the `wx` flag, never edited. Unknown facts are `null`.
- Event line: `{schema:"nightwatch-event/v1", seq, ts, run, type, data}`. seq starts at 1, +1 each, append only.
- Event types: hooks `started`, `blocked`, `tool`, `turn_end`, `ended`; `dg run event` `review_ready`, `merged`, `pushed`, `lost`. The set is closed.
- Lock: `mkdir <run-dir>/lock`; a lock older than 1 s is stale and broken. The `PostToolUse` hook (`tool`) waits at most 150 ms and then drops its event and logs. Every other writer (the `started`, `blocked`, `turn_end`, `ended` hooks and `dg run event`) waits up to 2 s.
- Hooks: no `DIGISMITH_RUN_ID` writes nothing; exit 0 always; no stdout; never write message text, prompts, tool inputs or outputs; errors go to `<root>/runs/hook-errors.log` (message only, capped at 256 KB); target under 100 ms.
- Each new hooks.json command starts with `[ -z "$DIGISMITH_RUN_ID" ] || node ...`.
- The existing hooks keep their commands, and their tests stay green.
- No sudo, no launchctl, no new LaunchAgent or background service, no delete outside the worktree, no real ClickUp write in tests, no change to `.claude/settings*`.
- pnpm only. Commits are title-only, conventional, with no AI attribution.
- Out of scope: watchdog, state machine, Nexus API routes, UI.

---

### Task 1: Paths and the frozen run record

**Files:**
- Create: `packages/cli/src/run/paths.ts`
- Create: `packages/cli/src/run/record.ts`
- Test: `packages/cli/src/run/record.test.ts`

**Interfaces:**
- Produces (`paths.ts`):
  - `SAFE_RE: RegExp`
  - `depotDir(env?: NodeJS.ProcessEnv): string`
  - `runsDir(env?: NodeJS.ProcessEnv): string` (`<depot>/runs`)
  - `isSafe(name: string): boolean`
  - `findRunDir(runId: string, env?: NodeJS.ProcessEnv): string | null` (scans `runs/*/<runId>` for a `run.json`)
- Produces (`record.ts`):
  - `type Role = "builder" | "reviewer" | "scout" | "other"`
  - `type RunRecord = { schema: "nightwatch-run/v1"; run: string; ticket: string; role: Role; order: string | null; seat: string | null; model: string | null; plugin_version: string | null; base_sha: string | null; branch: string | null; worktree: string | null; herdr: { workspace: string | null; tab: string | null; pane: string | null }; budget: Record<string, unknown> | null; created_at: string }`
  - `type StartInput = { ticket: string; role: string; order?: string; seat?: string; model?: string; worktree?: string; branch?: string; baseSha?: string; workspace?: string; tab?: string; pane?: string; budget?: string }`
  - `createRun(input: StartInput, env?: NodeJS.ProcessEnv, now?: Date): RunRecord` (throws `Error` with a plain message on a bad key, role or budget)
  - `readRun(runDir: string): RunRecord`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/run/record.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRun, readRun } from "./record.ts";
import { findRunDir, runsDir } from "./paths.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-record-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("createRun", () => {
  it("writes run.json with every field and null for unknown ones", () => {
    const r = createRun({ ticket: "DGS-581", role: "builder", order: "/o/order.md", seat: "dev0" }, env, new Date("2026-10-21T13:30:05Z"));
    expect(r.run).toMatch(/^builder-20261021T133005-[0-9a-f]{6}$/);
    const dir = findRunDir(r.run, env)!;
    expect(dir).toBe(path.join(runsDir(env), "DGS-581", r.run));
    const onDisk = readRun(dir);
    expect(onDisk).toEqual(r);
    expect(onDisk.schema).toBe("nightwatch-run/v1");
    expect(onDisk.seat).toBe("dev0");
    expect(onDisk.model).toBeNull();
    expect(onDisk.herdr).toEqual({ workspace: null, tab: null, pane: null });
    expect(onDisk.budget).toBeNull();
    expect(onDisk.created_at).toBe("2026-10-21T13:30:05.000Z");
  });
  it("reads plugin_version from the plugin manifest", () => {
    const r = createRun({ ticket: "DGS-581", role: "scout" }, env);
    expect(r.plugin_version).toMatch(/^\d+\.\d+\.\d+/);
  });
  it("takes branch, base sha and worktree from git when a worktree is given", () => {
    const wt = path.resolve(import.meta.dirname, "..", "..", "..", "..");
    const r = createRun({ ticket: "DGS-581", role: "builder", worktree: wt }, env);
    expect(r.worktree).toBe(wt);
    expect(r.base_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof r.branch).toBe("string");
  });
  it("flags win over git, and budget must be a JSON object", () => {
    const r = createRun({ ticket: "DGS-581", role: "reviewer", branch: "b", baseSha: "abc", budget: '{"turns":50}', workspace: "w2", tab: "T", pane: "p1" }, env);
    expect(r.branch).toBe("b");
    expect(r.base_sha).toBe("abc");
    expect(r.budget).toEqual({ turns: 50 });
    expect(r.herdr).toEqual({ workspace: "w2", tab: "T", pane: "p1" });
    expect(() => createRun({ ticket: "DGS-581", role: "builder", budget: "[1]" }, env)).toThrow(/budget/);
  });
  it("gives a new id for every start, even in the same second", () => {
    const now = new Date("2026-10-21T13:30:05Z");
    const ids = new Set(Array.from({ length: 20 }, () => createRun({ ticket: "DGS-581", role: "builder" }, env, now).run));
    expect(ids.size).toBe(20);
  });
  it("refuses a bad key or role", () => {
    expect(() => createRun({ ticket: "../x", role: "builder" }, env)).toThrow(/ticket/);
    expect(() => createRun({ ticket: "DGS-1", role: "boss" }, env)).toThrow(/role/);
    expect(fs.existsSync(runsDir(env))).toBe(false);
  });
});

describe("findRunDir", () => {
  it("returns null for an unknown or unsafe id", () => {
    expect(findRunDir("builder-x-000000", env)).toBeNull();
    expect(findRunDir("../etc", env)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/run/record.test.ts`
Expected: FAIL, cannot find module `./record.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/run/paths.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isSafe(name: string): boolean {
  return SAFE_RE.test(name);
}

export function depotDir(env: NodeJS.ProcessEnv = process.env): string {
  const o = env.DIGISMITH_DEPOT_DIR;
  return o !== undefined && o !== "" ? o : path.join(os.homedir(), ".digismith-depot");
}

export function runsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(depotDir(env), "runs");
}

// The run directory of an id, found by scanning runs/*/<id>. Null when the id is unsafe or has no run.json.
export function findRunDir(runId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isSafe(runId)) return null;
  const root = runsDir(env);
  let keys: string[];
  try {
    keys = fs.readdirSync(root);
  } catch {
    return null;
  }
  for (const key of keys) {
    const dir = path.join(root, key, runId);
    if (fs.existsSync(path.join(dir, "run.json"))) return dir;
  }
  return null;
}
```

```ts
// packages/cli/src/run/record.ts
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { isSafe, runsDir } from "./paths.ts";

export const RUN_SCHEMA = "nightwatch-run/v1";
export const ROLES = ["builder", "reviewer", "scout", "other"] as const;
export type Role = (typeof ROLES)[number];

export type RunRecord = {
  schema: typeof RUN_SCHEMA;
  run: string;
  ticket: string;
  role: Role;
  order: string | null;
  seat: string | null;
  model: string | null;
  plugin_version: string | null;
  base_sha: string | null;
  branch: string | null;
  worktree: string | null;
  herdr: { workspace: string | null; tab: string | null; pane: string | null };
  budget: Record<string, unknown> | null;
  created_at: string;
};

export type StartInput = {
  ticket: string;
  role: string;
  order?: string;
  seat?: string;
  model?: string;
  worktree?: string;
  branch?: string;
  baseSha?: string;
  workspace?: string;
  tab?: string;
  pane?: string;
  budget?: string;
};

const MANIFEST = path.join(import.meta.dirname, "..", "..", "..", "..", ".claude-plugin", "plugin.json");

function pluginVersion(): string | null {
  try {
    const v = (JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as { version?: unknown }).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

function git(cwd: string, ...args: string[]): string | null {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

function parseBudget(raw: string | undefined): Record<string, unknown> | null {
  if (raw === undefined) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error("budget must be a JSON object");
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("budget must be a JSON object");
  return v as Record<string, unknown>;
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
}

// Writes run.json once and returns the record. The id is new for every call: the directory is made without
// recursive, so an id that exists is never taken again.
export function createRun(input: StartInput, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): RunRecord {
  if (!isSafe(input.ticket)) throw new Error(`ticket "${input.ticket}" is not a safe key`);
  if (!(ROLES as readonly string[]).includes(input.role)) throw new Error(`role must be one of ${ROLES.join(", ")}`);
  const budget = parseBudget(input.budget);
  const wt = input.worktree && fs.existsSync(input.worktree) ? input.worktree : null;
  const base = { schema: RUN_SCHEMA, ticket: input.ticket, role: input.role as Role };
  const rest = {
    order: input.order ?? null,
    seat: input.seat ?? null,
    model: input.model ?? null,
    plugin_version: pluginVersion(),
    base_sha: input.baseSha ?? (wt ? git(wt, "rev-parse", "HEAD") : null),
    branch: input.branch ?? (wt ? git(wt, "rev-parse", "--abbrev-ref", "HEAD") : null),
    worktree: input.worktree ?? null,
    herdr: { workspace: input.workspace ?? null, tab: input.tab ?? null, pane: input.pane ?? null },
    budget,
    created_at: now.toISOString(),
  };
  const ticketDir = path.join(runsDir(env), input.ticket);
  fs.mkdirSync(ticketDir, { recursive: true });
  for (let attempt = 0; attempt < 20; attempt++) {
    const run = `${input.role}-${stamp(now)}-${crypto.randomBytes(3).toString("hex")}`;
    const dir = path.join(ticketDir, run);
    try {
      fs.mkdirSync(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
    const record: RunRecord = { ...base, run, ...rest };
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    return record;
  }
  throw new Error("could not find a free run id");
}

export function readRun(runDir: string): RunRecord {
  return JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8")) as RunRecord;
}
```

Note: the "refuses a bad key or role" test expects no `runs` directory after a refusal. The checks above run before the `mkdirSync`, so that holds.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/run/record.test.ts`
Expected: PASS (6 tests plus the `findRunDir` test).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run/paths.ts packages/cli/src/run/record.ts packages/cli/src/run/record.test.ts
git commit -m "feat(run): add the frozen run record"
```

---

### Task 2: The locked event writer

**Files:**
- Create: `packages/cli/src/run/events.ts`
- Test: `packages/cli/src/run/events.test.ts`
- Test helper: `packages/cli/src/run/append-worker.ts` (a script the test starts as child processes)

**Interfaces:**
- Consumes (Task 1): `findRunDir`, `createRun`.
- Produces (`events.ts`):
  - `EVENT_SCHEMA = "nightwatch-event/v1"`
  - `HOOK_TYPES`, `CONDUCTOR_TYPES` (readonly tuples), `type EventType`
  - `type EventLine = { schema: string; seq: number; ts: string; run: string; type: string; data: Record<string, unknown> }`
  - `appendEvent(runDir: string, run: string, type: string, data: Record<string, unknown>, waitMs: number): EventLine` (throws `Error("lock timeout")` when the lock is not free in `waitMs`)
  - `readEvents(runDir: string): EventLine[]` (skips a line that does not parse)

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/run/events.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { appendEvent, readEvents } from "./events.ts";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nw-events-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("appendEvent", () => {
  it("numbers events 1..n and writes the documented line", () => {
    const a = appendEvent(dir, "r1", "started", { source: "startup" }, 2000);
    const b = appendEvent(dir, "r1", "tool", { tool: "Bash", ok: true }, 2000);
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect(Object.keys(a)).toEqual(["schema", "seq", "ts", "run", "type", "data"]);
    expect(a.schema).toBe("nightwatch-event/v1");
    const lines = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toMatchObject({ seq: 2, run: "r1", type: "tool", data: { tool: "Bash", ok: true } });
    expect(fs.existsSync(path.join(dir, "lock"))).toBe(false);
  });
  it("falls back to counting lines when the counter file is gone", () => {
    appendEvent(dir, "r1", "started", {}, 2000);
    appendEvent(dir, "r1", "tool", {}, 2000);
    fs.rmSync(path.join(dir, "seq"));
    expect(appendEvent(dir, "r1", "turn_end", {}, 2000).seq).toBe(3);
  });
  it("breaks a stale lock", () => {
    fs.mkdirSync(path.join(dir, "lock"));
    const old = new Date(Date.now() - 5000);
    fs.utimesSync(path.join(dir, "lock"), old, old);
    expect(appendEvent(dir, "r1", "started", {}, 2000).seq).toBe(1);
  });
  it("gives up after waitMs when the lock is held", () => {
    fs.mkdirSync(path.join(dir, "lock"));
    const t0 = Date.now();
    expect(() => appendEvent(dir, "r1", "tool", {}, 150)).toThrow(/lock timeout/);
    const took = Date.now() - t0;
    expect(took).toBeGreaterThanOrEqual(140);
    expect(took).toBeLessThan(900);
    expect(fs.existsSync(path.join(dir, "events.jsonl"))).toBe(false);
  });
  it("two parallel writers give seq 1..80 with no gap and no duplicate", async () => {
    const worker = path.join(import.meta.dirname, "append-worker.ts");
    const runWorker = (tag: string) =>
      new Promise<void>((resolve, reject) => {
        const p = spawn(process.execPath, ["--experimental-strip-types", worker, dir, tag, "40"], { stdio: "inherit" });
        p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`worker ${tag} exited ${c}`))));
      });
    await Promise.all([runWorker("a"), runWorker("b")]);
    const events = readEvents(dir);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
    const raw = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8").trim().split("\n");
    expect(raw).toHaveLength(80);
    raw.forEach((l) => expect(() => JSON.parse(l)).not.toThrow());
  }, 30_000);
});

describe("readEvents", () => {
  it("returns [] without a file and skips a line that does not parse", () => {
    expect(readEvents(dir)).toEqual([]);
    appendEvent(dir, "r1", "started", {}, 2000);
    fs.appendFileSync(path.join(dir, "events.jsonl"), "{broken\n");
    expect(readEvents(dir)).toHaveLength(1);
  });
});
```

```ts
// packages/cli/src/run/append-worker.ts
// Test helper: node append-worker.ts <run-dir> <tag> <count>. Appends <count> events as fast as it can.
import { appendEvent } from "./events.ts";

const [dir, tag, count] = process.argv.slice(2);
for (let i = 0; i < Number(count); i++) appendEvent(dir, "r1", "tool", { tag, i }, 2000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/run/events.test.ts`
Expected: FAIL, cannot find module `./events.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/run/events.ts
import * as fs from "node:fs";
import * as path from "node:path";

export const EVENT_SCHEMA = "nightwatch-event/v1";
export const HOOK_TYPES = ["started", "blocked", "tool", "turn_end", "ended"] as const;
export const CONDUCTOR_TYPES = ["review_ready", "merged", "pushed", "lost"] as const;
export type EventType = (typeof HOOK_TYPES)[number] | (typeof CONDUCTOR_TYPES)[number];

export type EventLine = { schema: string; seq: number; ts: string; run: string; type: string; data: Record<string, unknown> };

// A holder keeps the lock for a few milliseconds; a lock this old was left behind by a crash.
const STALE_MS = 1000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquire(lockDir: string, waitMs: number): boolean {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    try {
      if (Date.now() - fs.statSync(lockDir).mtimeMs > STALE_MS) {
        fs.rmdirSync(lockDir);
        continue;
      }
    } catch {
      /* the holder released it between the two calls: try again */
    }
    if (Date.now() >= deadline) return false;
    sleep(5);
  }
}

function lastSeq(runDir: string): number {
  try {
    const n = Number.parseInt(fs.readFileSync(path.join(runDir, "seq"), "utf8"), 10);
    if (Number.isInteger(n) && n >= 0) return n;
  } catch {
    /* fall through to counting lines */
  }
  try {
    return fs.readFileSync(path.join(runDir, "events.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "").length;
  } catch {
    return 0;
  }
}

// Appends one event under the run's lock and returns the line. Throws Error("lock timeout") when the lock stays taken.
export function appendEvent(runDir: string, run: string, type: string, data: Record<string, unknown>, waitMs: number): EventLine {
  const lockDir = path.join(runDir, "lock");
  if (!acquire(lockDir, waitMs)) throw new Error("lock timeout");
  try {
    const line: EventLine = { schema: EVENT_SCHEMA, seq: lastSeq(runDir) + 1, ts: new Date().toISOString(), run, type, data };
    fs.appendFileSync(path.join(runDir, "events.jsonl"), JSON.stringify(line) + "\n");
    fs.writeFileSync(path.join(runDir, "seq"), String(line.seq));
    return line;
  } finally {
    try {
      fs.rmdirSync(lockDir);
    } catch {
      /* already gone */
    }
  }
}

export function readEvents(runDir: string): EventLine[] {
  let text: string;
  try {
    text = fs.readFileSync(path.join(runDir, "events.jsonl"), "utf8");
  } catch {
    return [];
  }
  const out: EventLine[] = [];
  for (const l of text.split("\n")) {
    if (l.trim() === "") continue;
    try {
      out.push(JSON.parse(l) as EventLine);
    } catch {
      /* skip a line that does not parse */
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/run/events.test.ts`
Expected: PASS (all six tests). Run it three times; the parallel test must pass every time.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run/events.ts packages/cli/src/run/events.test.ts packages/cli/src/run/append-worker.ts
git commit -m "feat(run): add the locked event writer"
```

---

### Task 3: The hook handler and script

**Files:**
- Create: `packages/cli/src/run/hook.ts`
- Create: `scripts/run-events/hook-cli.ts`
- Test: `packages/cli/src/run/hook.test.ts`
- Test: `scripts/run-events/hook-cli.test.ts`

**Interfaces:**
- Consumes (Tasks 1 and 2): `findRunDir`, `isSafe`, `runsDir`, `appendEvent`.
- Produces (`hook.ts`):
  - `type HookKind = "started" | "blocked" | "tool" | "turn_end" | "ended"`
  - `buildData(kind: HookKind, payload: unknown): Record<string, unknown>`
  - `runHook(kind: string, stdin: string, env?: NodeJS.ProcessEnv): void` (never throws)
  - `waitFor(kind: HookKind): number` (150 for `tool`, 2000 for every other kind)
- Produces (`hook-cli.ts`): `node --experimental-strip-types scripts/run-events/hook-cli.ts <kind>` reads stdin, calls `runHook`, prints nothing, exits 0.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/cli/src/run/hook.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildData, runHook, waitFor } from "./hook.ts";
import { createRun } from "./record.ts";
import { findRunDir, runsDir } from "./paths.ts";
import { readEvents } from "./events.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
let run: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-hook-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
  run = createRun({ ticket: "DGS-581", role: "builder" }, env).run;
  env.DIGISMITH_RUN_ID = run;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const events = () => readEvents(findRunDir(run, env)!);

describe("buildData", () => {
  it("keeps only the listed fields", () => {
    expect(buildData("started", { source: "startup", session_id: "abc-123", prompt: "secret" })).toEqual({ source: "startup", session_id: "abc-123" });
    expect(buildData("blocked", { notification_type: "permission_prompt", message: "Claude needs your permission to run rm -rf" })).toEqual({ kind: "permission_prompt" });
    expect(buildData("tool", { tool_name: "Bash", tool_input: { command: "echo secret" }, tool_response: { stdout: "secret" } })).toEqual({ tool: "Bash", ok: true });
    expect(buildData("tool", { tool_name: "Edit", tool_response: { is_error: true } })).toEqual({ tool: "Edit", ok: false });
    expect(buildData("tool", { tool_name: "Read", tool_response: { error: "nope" } })).toEqual({ tool: "Read", ok: false });
    expect(buildData("turn_end", { last_assistant_message: "secret" })).toEqual({});
    expect(buildData("ended", { reason: "logout", transcript_path: "/x" })).toEqual({ reason: "logout" });
  });
  it("turns a value that is not a plain name into null", () => {
    expect(buildData("tool", { tool_name: "has a space and text", tool_response: {} })).toEqual({ tool: null, ok: true });
    expect(buildData("blocked", {})).toEqual({ kind: null });
    expect(buildData("ended", "not an object")).toEqual({ reason: null });
  });
});

describe("runHook", () => {
  it("writes the five kinds in seq order", () => {
    runHook("started", JSON.stringify({ source: "startup", session_id: "s1" }), env);
    runHook("tool", JSON.stringify({ tool_name: "Bash", tool_response: {} }), env);
    runHook("blocked", JSON.stringify({ notification_type: "permission_prompt" }), env);
    runHook("turn_end", "{}", env);
    runHook("ended", JSON.stringify({ reason: "other" }), env);
    expect(events().map((e) => [e.seq, e.type])).toEqual([[1, "started"], [2, "tool"], [3, "blocked"], [4, "turn_end"], [5, "ended"]]);
  });
  it("writes nothing without DIGISMITH_RUN_ID", () => {
    const before = fs.readdirSync(path.join(runsDir(env), "DGS-581", run));
    runHook("started", "{}", { DIGISMITH_DEPOT_DIR: tmp });
    runHook("started", "{}", { DIGISMITH_DEPOT_DIR: tmp, DIGISMITH_RUN_ID: "" });
    expect(fs.readdirSync(path.join(runsDir(env), "DGS-581", run))).toEqual(before);
    expect(fs.existsSync(path.join(runsDir(env), "hook-errors.log"))).toBe(false);
  });
  it("writes nothing for a run id that has no run.json, and creates no directory", () => {
    runHook("started", "{}", { ...env, DIGISMITH_RUN_ID: "builder-19990101T000000-ffffff" });
    runHook("started", "{}", { ...env, DIGISMITH_RUN_ID: "../../etc" });
    expect(fs.readdirSync(path.join(runsDir(env)))).toEqual(["DGS-581"]);
    expect(fs.readdirSync(path.join(runsDir(env), "DGS-581"))).toEqual([run]);
  });
  it("still writes the event when stdin is not JSON", () => {
    runHook("started", "not json", env);
    expect(events()).toHaveLength(1);
    expect(events()[0].data).toEqual({ source: null, session_id: null });
  });
  it("never throws and logs the message only when the lock is held", () => {
    const dir = findRunDir(run, env)!;
    fs.mkdirSync(path.join(dir, "lock"));
    expect(() => runHook("tool", JSON.stringify({ tool_name: "Bash", tool_input: { command: "SECRET-INPUT" } }), env)).not.toThrow();
    expect(events()).toHaveLength(0);
    const log = fs.readFileSync(path.join(runsDir(env), "hook-errors.log"), "utf8");
    expect(log).toMatch(/tool/);
    expect(log).toMatch(/lock timeout/);
    expect(log).not.toMatch(/SECRET-INPUT/);
  });
  it("lets blocked wait for a lock that frees within 2 s, while tool gives up near 150 ms", async () => {
    const dir = findRunDir(run, env)!;
    fs.mkdirSync(path.join(dir, "lock"));
    setTimeout(() => fs.rmdirSync(path.join(dir, "lock")), 400);
    // runHook is synchronous and would block the timer above, so run blocked in a child process.
    const { spawn } = await import("node:child_process");
    const script = path.join(import.meta.dirname, "..", "..", "..", "..", "scripts", "run-events", "hook-cli.ts");
    const code = await new Promise<number | null>((resolve) => {
      const p = spawn(process.execPath, ["--experimental-strip-types", script, "blocked"], { env: { ...process.env, ...env } });
      p.stdin.end(JSON.stringify({ notification_type: "permission_prompt" }));
      p.on("exit", resolve);
    });
    expect(code).toBe(0);
    expect(events().map((e) => e.type)).toEqual(["blocked"]);
  });
  it("waits 150 ms for tool and 2000 ms for every other kind", () => {
    expect(waitFor("tool")).toBe(150);
    for (const k of ["started", "blocked", "turn_end", "ended"] as const) expect(waitFor(k)).toBe(2000);
  });
  it("ignores an unknown kind", () => {
    expect(() => runHook("bogus", "{}", env)).not.toThrow();
    expect(events()).toHaveLength(0);
  });
});
```

```ts
// scripts/run-events/hook-cli.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { createRun } from "../../packages/cli/src/run/record.ts";
import { findRunDir } from "../../packages/cli/src/run/paths.ts";
import { readEvents } from "../../packages/cli/src/run/events.ts";

const SCRIPT = path.join(import.meta.dirname, "hook-cli.ts");
let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-cli-"));
  env = { ...process.env, DIGISMITH_DEPOT_DIR: tmp };
  delete env.DIGISMITH_RUN_ID;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const call = (kind: string, input: string, e: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, ["--experimental-strip-types", SCRIPT, kind], { input, env: e, encoding: "utf8" });

describe("hook-cli", () => {
  it("writes one event, prints nothing and exits 0", () => {
    const run = createRun({ ticket: "DGS-581", role: "builder" }, env).run;
    const r = call("tool", JSON.stringify({ tool_name: "Bash", tool_input: { command: "SECRET" }, tool_response: { stdout: "SECRET" } }), { ...env, DIGISMITH_RUN_ID: run });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    const dir = findRunDir(run, env)!;
    expect(readEvents(dir)).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, "events.jsonl"), "utf8")).not.toMatch(/SECRET/);
  });
  it("exits 0 and writes nothing without DIGISMITH_RUN_ID, and for a bad kind", () => {
    expect(call("started", "{}", env).status).toBe(0);
    expect(fs.existsSync(path.join(tmp, "runs"))).toBe(false);
    expect(call("bogus", "{}", env).status).toBe(0);
  });
  it("finishes fast (one call, recorded)", () => {
    const run = createRun({ ticket: "DGS-581", role: "builder" }, env).run;
    call("started", "{}", { ...env, DIGISMITH_RUN_ID: run }); // warm the file cache
    const t0 = performance.now();
    call("tool", "{}", { ...env, DIGISMITH_RUN_ID: run });
    const ms = performance.now() - t0;
    console.log(`run-events hook call: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1000); // target is 100 ms; the ceiling is loose so a slow machine does not fail
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/run/hook.test.ts scripts/run-events/hook-cli.test.ts`
Expected: FAIL, cannot find module `./hook.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/run/hook.ts
// The Nightwatch hook handler. Imports only node:fs and node:path (through ./paths.ts and ./events.ts) so a
// hook process starts fast. Never throws; never writes message text, prompts, tool inputs or outputs.
import * as fs from "node:fs";
import * as path from "node:path";
import { findRunDir, isSafe, runsDir } from "./paths.ts";
import { appendEvent, HOOK_TYPES } from "./events.ts";

export type HookKind = (typeof HOOK_TYPES)[number];

const LOG_CAP = 256 * 1024;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

export function waitFor(kind: HookKind): number {
  return kind === "tool" ? 150 : 2000;
}

// A name or id from the payload, or null. Anything with spaces or text in it is dropped.
function name(v: unknown): string | null {
  return typeof v === "string" && NAME_RE.test(v) ? v : null;
}

function toolOk(response: unknown): boolean {
  if (typeof response !== "object" || response === null) return true;
  const r = response as Record<string, unknown>;
  return !(r.is_error === true || r.success === false || (r.error !== undefined && r.error !== null && r.error !== false));
}

export function buildData(kind: HookKind, payload: unknown): Record<string, unknown> {
  const p = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  switch (kind) {
    case "started":
      return { source: name(p.source), session_id: name(p.session_id) };
    case "blocked":
      return { kind: name(p.notification_type) };
    case "tool":
      return { tool: name(p.tool_name), ok: toolOk(p.tool_response) };
    case "ended":
      return { reason: name(p.reason) };
    case "turn_end":
      return {};
  }
}

function logError(kind: string, message: string, env: NodeJS.ProcessEnv): void {
  try {
    const root = runsDir(env);
    if (!fs.existsSync(root)) return;
    const file = path.join(root, "hook-errors.log");
    if (fs.existsSync(file) && fs.statSync(file).size >= LOG_CAP) return;
    fs.appendFileSync(file, `${new Date().toISOString()} ${kind} ${message.replace(/\s+/g, " ").slice(0, 200)}\n`);
  } catch {
    /* the log must never hurt a session either */
  }
}

export function runHook(kind: string, stdin: string, env: NodeJS.ProcessEnv = process.env): void {
  try {
    const id = env.DIGISMITH_RUN_ID;
    if (!id || !isSafe(id)) return;
    if (!(HOOK_TYPES as readonly string[]).includes(kind)) return;
    const k = kind as HookKind;
    const dir = findRunDir(id, env);
    if (!dir) return;
    let payload: unknown = {};
    try {
      payload = JSON.parse(stdin || "{}");
    } catch {
      /* not JSON: the event is still written, with empty data */
    }
    try {
      appendEvent(dir, id, k, buildData(k, payload), waitFor(k));
    } catch (e) {
      logError(k, (e as Error).message, env);
    }
  } catch (e) {
    logError(kind, (e as Error).message, env);
  }
}
```

```ts
// scripts/run-events/hook-cli.ts
// Nightwatch hook entry: node hook-cli.ts <started|blocked|tool|turn_end|ended>. Reads the hook payload from stdin.
// Always exits 0 and prints nothing. The shell in hooks.json has already tested DIGISMITH_RUN_ID.
import * as fs from "node:fs";
import { runHook } from "../../packages/cli/src/run/hook.ts";

let stdin = "";
try {
  stdin = fs.readFileSync(0, "utf8");
} catch {
  /* no stdin */
}
runHook(process.argv[2] ?? "", stdin, process.env);
process.exitCode = 0;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/run/hook.test.ts scripts/run-events/hook-cli.test.ts`
Expected: PASS. The hook test prints the measured time of one call; note it for the report.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run/hook.ts packages/cli/src/run/hook.test.ts scripts/run-events
git commit -m "feat(run): add the nightwatch hook handler"
```

---

### Task 4: hooks.json commands and their test

**Files:**
- Modify: `hooks/hooks.json`
- Test: `scripts/run-events/hooks-json.test.ts`

**Interfaces:**
- Consumes (Task 3): `scripts/run-events/hook-cli.ts`.
- Produces: five new commands in `hooks/hooks.json`: SessionStart `started`, Notification `blocked`, PostToolUse `tool`, Stop `turn_end`, SessionEnd `ended`. Each is `[ -z "$DIGISMITH_RUN_ID" ] || node --experimental-strip-types "${CLAUDE_PLUGIN_ROOT}/scripts/run-events/hook-cli.ts" <kind>`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/run-events/hooks-json.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { createRun } from "../../packages/cli/src/run/record.ts";
import { findRunDir } from "../../packages/cli/src/run/paths.ts";
import { readEvents } from "../../packages/cli/src/run/events.ts";

const ROOT = path.join(import.meta.dirname, "..", "..");
const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8")).hooks as Record<string, { matcher?: string; hooks: { type: string; command: string }[] }[]>;

const EXPECTED: Record<string, string> = { SessionStart: "started", Notification: "blocked", PostToolUse: "tool", Stop: "turn_end", SessionEnd: "ended" };

function commandFor(event: string): string {
  const all = hooks[event].flatMap((g) => g.hooks.map((h) => h.command));
  const hit = all.filter((c) => c.includes("run-events/hook-cli.ts"));
  expect(hit).toHaveLength(1);
  return hit[0];
}

let tmp: string;
let bin: string;
let shimLog: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-hooksjson-"));
  bin = path.join(tmp, "bin");
  shimLog = path.join(tmp, "node-calls.log");
  fs.mkdirSync(bin);
  // a node shim first in PATH: it records each call, then runs the real node
  fs.writeFileSync(path.join(bin, "node"), `#!/bin/sh\necho called >> "${shimLog}"\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function sh(command: string, extra: NodeJS.ProcessEnv, input = "{}") {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_PLUGIN_ROOT: ROOT, DIGISMITH_DEPOT_DIR: path.join(tmp, "depot"), ...extra };
  delete env.DIGISMITH_RUN_ID;
  Object.assign(env, extra);
  return spawnSync("sh", ["-c", command], { input, env, encoding: "utf8" });
}

describe("hooks.json", () => {
  it("has the five nightwatch commands, each testing DIGISMITH_RUN_ID in the shell first", () => {
    for (const [event, kind] of Object.entries(EXPECTED)) {
      const c = commandFor(event);
      expect(c.startsWith('[ -z "$DIGISMITH_RUN_ID" ] || node ')).toBe(true);
      expect(c.endsWith(` ${kind}`)).toBe(true);
    }
  });
  it("keeps the existing session-cards and session-init commands", () => {
    const all = Object.values(hooks).flatMap((gs) => gs.flatMap((g) => g.hooks.map((h) => h.command)));
    for (const needle of ["session-cards/hook-cli.ts\" start", "session-init.ts", "session-cards/hook-cli.ts\" prompt", "session-cards/hook-cli.ts\" end"]) {
      expect(all.some((c) => c.includes(needle))).toBe(true);
    }
  });
  it("starts no node process when DIGISMITH_RUN_ID is unset or empty, and exits 0", () => {
    for (const event of Object.keys(EXPECTED)) {
      expect(sh(commandFor(event), {}).status).toBe(0);
      expect(sh(commandFor(event), { DIGISMITH_RUN_ID: "" }).status).toBe(0);
    }
    expect(fs.existsSync(shimLog)).toBe(false);
    expect(fs.existsSync(path.join(tmp, "depot"))).toBe(false);
  });
  it("writes the event for each command when the run id is set", () => {
    const env = { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") };
    const run = createRun({ ticket: "DGS-581", role: "builder" }, env).run;
    const payloads: Record<string, object> = {
      SessionStart: { source: "startup", session_id: "s1" },
      Notification: { notification_type: "permission_prompt" },
      PostToolUse: { tool_name: "Bash", tool_response: {} },
      Stop: {},
      SessionEnd: { reason: "other" },
    };
    for (const event of Object.keys(EXPECTED)) {
      const r = sh(commandFor(event), { ...env, DIGISMITH_RUN_ID: run }, JSON.stringify(payloads[event]));
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
    }
    expect(readEvents(findRunDir(run, env)!).map((e) => e.type)).toEqual(Object.values(EXPECTED));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/run-events/hooks-json.test.ts`
Expected: FAIL, `expected [] to have a length of 1` (no nightwatch command in hooks.json yet).

- [ ] **Step 3: Write minimal implementation**

Edit `hooks/hooks.json`. Add a third hook to `SessionStart`'s existing group, a second hook to `SessionEnd`'s existing group, and three new groups (`Notification`, `PostToolUse`, `Stop`). Do not change any existing command. The command text is exactly:

```
[ -z \"$DIGISMITH_RUN_ID\" ] || node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/run-events/hook-cli.ts\" <kind>
```

(in JSON the inner quotes are escaped, as in the existing commands). Resulting shape:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "...existing session-cards start..." },
          { "type": "command", "command": "...existing session-init..." },
          { "type": "command", "command": "[ -z \"$DIGISMITH_RUN_ID\" ] || node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/run-events/hook-cli.ts\" started" }
        ]
      }
    ],
    "UserPromptSubmit": [ ...unchanged... ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "[ -z \"$DIGISMITH_RUN_ID\" ] || node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/run-events/hook-cli.ts\" blocked" } ] }
    ],
    "PostToolUse": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "[ -z \"$DIGISMITH_RUN_ID\" ] || node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/run-events/hook-cli.ts\" tool" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "[ -z \"$DIGISMITH_RUN_ID\" ] || node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/run-events/hook-cli.ts\" turn_end" } ] }
    ],
    "SessionEnd": [
      {
        "hooks": [
          { "type": "command", "command": "...existing session-cards end..." },
          { "type": "command", "command": "[ -z \"$DIGISMITH_RUN_ID\" ] || node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/run-events/hook-cli.ts\" ended" }
        ]
      }
    ]
  }
}
```

Keep the file's existing indentation and key order for the unchanged parts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/run-events scripts/session-cards scripts/conductor` and `pnpm vitest run -t hooks`
Expected: PASS, including every existing hook test (session-cards, idle-check, session-init).

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json scripts/run-events/hooks-json.test.ts
git commit -m "feat(run): add the nightwatch hook commands"
```

---

### Task 5: Readers and the `dg run` commands

**Files:**
- Create: `packages/cli/src/run/read.ts`
- Create: `packages/cli/src/run/index.ts`
- Modify: `packages/cli/src/index.ts` (import `runCommand` from `./run/index.ts` and add `.command(runCommand)` after `.command(reviewerCommand)`)
- Test: `packages/cli/src/run/read.test.ts`
- Test: `packages/cli/src/run/index.test.ts`

**Interfaces:**
- Consumes (Tasks 1 and 2): `createRun`, `readRun`, `RunRecord`, `findRunDir`, `runsDir`, `appendEvent`, `readEvents`, `CONDUCTOR_TYPES`, `EventLine`.
- Produces (`read.ts`):
  - `type RunSummary = { events: number; first_ts: string | null; last_ts: string | null; last_type: string | null; ended: boolean }`
  - `summarize(events: EventLine[]): RunSummary`
  - `listRuns(env: NodeJS.ProcessEnv, ticket?: string): { record: RunRecord; summary: RunSummary }[]` (newest `created_at` first)
  - `showRun(runId: string, env: NodeJS.ProcessEnv): { record: RunRecord; summary: RunSummary } | null`
  - `tailEvents(runId: string, since: number, env: NodeJS.ProcessEnv): EventLine[] | null`
  - `formatList(rows): string` (plain text table), `formatShow(row): string`
- Produces (`index.ts`): `runCommand: CommandModule` with subcommands `start`, `event`, `list`, `show`, `tail` exactly as in the spec. Exit code 1 and a message on stderr for an unknown run, an unknown event type or a bad `--data`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/cli/src/run/read.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRun } from "./record.ts";
import { findRunDir } from "./paths.ts";
import { appendEvent } from "./events.ts";
import { listRuns, showRun, summarize, tailEvents } from "./read.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-read-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function add(run: string, ...types: string[]) {
  for (const t of types) appendEvent(findRunDir(run, env)!, run, t, {}, 2000);
}

describe("readers", () => {
  it("lists runs newest first, filtered by ticket", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder" }, env, new Date("2026-10-21T01:00:00Z"));
    const b = createRun({ ticket: "DGS-2", role: "reviewer" }, env, new Date("2026-10-21T02:00:00Z"));
    add(a.run, "started", "ended");
    expect(listRuns(env).map((r) => r.record.run)).toEqual([b.run, a.run]);
    expect(listRuns(env, "DGS-1").map((r) => r.record.run)).toEqual([a.run]);
    expect(listRuns(env, "DGS-9")).toEqual([]);
    expect(listRuns(env)[1].summary).toMatchObject({ events: 2, last_type: "ended", ended: true });
  });
  it("lists nothing when the depot has no runs, and skips a folder without run.json", () => {
    expect(listRuns(env)).toEqual([]);
    fs.mkdirSync(path.join(tmp, "runs", "DGS-1", "junk"), { recursive: true });
    expect(listRuns(env)).toEqual([]);
  });
  it("shows a run with its summary, and null for an unknown id", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder" }, env);
    add(a.run, "started", "tool");
    const s = showRun(a.run, env)!;
    expect(s.record.run).toBe(a.run);
    expect(s.summary.events).toBe(2);
    expect(s.summary.ended).toBe(false);
    expect(showRun("builder-x-000000", env)).toBeNull();
  });
  it("tails events after a seq", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder" }, env);
    add(a.run, "started", "tool", "turn_end");
    expect(tailEvents(a.run, 0, env)!.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(tailEvents(a.run, 2, env)!.map((e) => e.seq)).toEqual([3]);
    expect(tailEvents(a.run, 3, env)).toEqual([]);
    expect(tailEvents("builder-x-000000", 0, env)).toBeNull();
  });
  it("summarize of no events is empty", () => {
    expect(summarize([])).toEqual({ events: 0, first_ts: null, last_ts: null, last_type: null, ended: false });
  });
});
```

```ts
// packages/cli/src/run/index.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ENTRY = path.join(import.meta.dirname, "..", "index.ts");
let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-dg-"));
  env = { ...process.env, DIGISMITH_DEPOT_DIR: tmp };
  delete env.DIGISMITH_RUN_ID;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const dg = (...args: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", ENTRY, "run", ...args], { env, encoding: "utf8" });

describe("dg run", () => {
  it("start prints the run id alone; event, list, show and tail read it back", () => {
    const s = dg("start", "--ticket", "DGS-581", "--role", "builder", "--order", "/o.md", "--seat", "dev0");
    expect(s.status).toBe(0);
    const id = s.stdout.trim();
    expect(id).toMatch(/^builder-\d{8}T\d{6}-[0-9a-f]{6}$/);

    expect(dg("event", id, "review_ready", "--data", '{"pack":"p1"}').status).toBe(0);
    expect(dg("event", id, "merged").status).toBe(0);

    const list = JSON.parse(dg("list", "--json").stdout);
    expect(list).toHaveLength(1);
    expect(list[0].record.run).toBe(id);
    expect(list[0].summary.events).toBe(2);
    expect(dg("list", "--ticket", "DGS-9", "--json").stdout.trim()).toBe("[]");
    expect(dg("list").stdout).toContain(id);

    const show = JSON.parse(dg("show", id, "--json").stdout);
    expect(show.record.seat).toBe("dev0");
    expect(show.summary.last_type).toBe("merged");
    expect(dg("show", id).stdout).toContain("DGS-581");

    const all = dg("tail", id).stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(all.map((e) => [e.seq, e.type])).toEqual([[1, "review_ready"], [2, "merged"]]);
    expect(all[0].data).toEqual({ pack: "p1" });
    expect(dg("tail", id, "--since", "1").stdout.trim().split("\n").map((l) => JSON.parse(l).seq)).toEqual([2]);
  });
  it("exits 1 with a message for an unknown run, an unknown type, a bad --data and a bad role", () => {
    const id = dg("start", "--ticket", "DGS-581", "--role", "scout").stdout.trim();
    expect(dg("event", "builder-x-000000", "merged").status).toBe(1);
    expect(dg("event", id, "started").status).toBe(1); // a hook type, not a conductor type
    expect(dg("event", id, "merged", "--data", "[1]").status).toBe(1);
    expect(dg("show", "builder-x-000000").status).toBe(1);
    expect(dg("tail", "builder-x-000000").status).toBe(1);
    const bad = dg("start", "--ticket", "DGS-581", "--role", "boss");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/role/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/run/read.test.ts packages/cli/src/run/index.test.ts`
Expected: FAIL, cannot find module `./read.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/cli/src/run/read.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { findRunDir, runsDir } from "./paths.ts";
import { readEvents, type EventLine } from "./events.ts";
import { readRun, type RunRecord } from "./record.ts";

export type RunSummary = { events: number; first_ts: string | null; last_ts: string | null; last_type: string | null; ended: boolean };
export type RunRow = { record: RunRecord; summary: RunSummary };

export function summarize(events: EventLine[]): RunSummary {
  const last = events[events.length - 1];
  return {
    events: events.length,
    first_ts: events[0]?.ts ?? null,
    last_ts: last?.ts ?? null,
    last_type: last?.type ?? null,
    ended: events.some((e) => e.type === "ended"),
  };
}

function row(dir: string): RunRow | null {
  try {
    return { record: readRun(dir), summary: summarize(readEvents(dir)) };
  } catch {
    return null;
  }
}

export function listRuns(env: NodeJS.ProcessEnv, ticket?: string): RunRow[] {
  const root = runsDir(env);
  let keys: string[];
  try {
    keys = fs.readdirSync(root);
  } catch {
    return [];
  }
  const rows: RunRow[] = [];
  for (const key of keys) {
    if (ticket !== undefined && key !== ticket) continue;
    const keyDir = path.join(root, key);
    let ids: string[];
    try {
      ids = fs.readdirSync(keyDir);
    } catch {
      continue; // hook-errors.log is a file, not a ticket folder
    }
    for (const id of ids) {
      const r = row(path.join(keyDir, id));
      if (r) rows.push(r);
    }
  }
  return rows.sort((a, b) => (a.record.created_at < b.record.created_at ? 1 : a.record.created_at > b.record.created_at ? -1 : 0));
}

export function showRun(runId: string, env: NodeJS.ProcessEnv): RunRow | null {
  const dir = findRunDir(runId, env);
  return dir ? row(dir) : null;
}

export function tailEvents(runId: string, since: number, env: NodeJS.ProcessEnv): EventLine[] | null {
  const dir = findRunDir(runId, env);
  return dir ? readEvents(dir).filter((e) => e.seq > since) : null;
}

export function formatList(rows: RunRow[]): string {
  if (rows.length === 0) return "no runs";
  return rows
    .map(({ record: r, summary: s }) => [r.run, r.ticket, r.role, r.seat ?? "-", r.created_at, `${s.events} events`, s.last_type ?? "-"].join("  "))
    .join("\n");
}

export function formatShow({ record: r, summary: s }: RunRow): string {
  return [
    `run       ${r.run}`,
    `ticket    ${r.ticket}`,
    `role      ${r.role}`,
    `seat      ${r.seat ?? "-"}`,
    `model     ${r.model ?? "-"}`,
    `branch    ${r.branch ?? "-"}`,
    `worktree  ${r.worktree ?? "-"}`,
    `herdr     ${[r.herdr.workspace, r.herdr.tab, r.herdr.pane].map((v) => v ?? "-").join(" / ")}`,
    `created   ${r.created_at}`,
    `events    ${s.events} (last: ${s.last_type ?? "-"} at ${s.last_ts ?? "-"})`,
    `ended     ${s.ended ? "yes" : "no"}`,
  ].join("\n");
}
```

```ts
// packages/cli/src/run/index.ts
import type { CommandModule } from "yargs";
import { appendEvent, CONDUCTOR_TYPES } from "./events.ts";
import { findRunDir } from "./paths.ts";
import { createRun } from "./record.ts";
import { formatList, formatShow, listRuns, showRun, tailEvents } from "./read.ts";

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

const startCommand: CommandModule = {
  command: "start",
  describe: "write run.json for a new worker run and print the run id",
  builder: (y) =>
    y
      .option("ticket", { type: "string", demandOption: true, describe: "ticket key, e.g. DGS-581" })
      .option("role", { type: "string", demandOption: true, describe: "builder, reviewer, scout or other" })
      .option("order", { type: "string", describe: "path of the order" })
      .option("seat", { type: "string" })
      .option("model", { type: "string" })
      .option("worktree", { type: "string", describe: "worktree path (branch and base sha are read from git)" })
      .option("branch", { type: "string" })
      .option("base-sha", { type: "string" })
      .option("workspace", { type: "string", describe: "herdr workspace" })
      .option("tab", { type: "string", describe: "herdr tab label" })
      .option("pane", { type: "string", describe: "herdr pane id" })
      .option("budget", { type: "string", describe: "JSON object" }),
  handler: (a) => {
    try {
      const r = createRun({
        ticket: a.ticket as string,
        role: a.role as string,
        order: a.order as string | undefined,
        seat: a.seat as string | undefined,
        model: a.model as string | undefined,
        worktree: a.worktree as string | undefined,
        branch: a.branch as string | undefined,
        baseSha: a["base-sha"] as string | undefined,
        workspace: a.workspace as string | undefined,
        tab: a.tab as string | undefined,
        pane: a.pane as string | undefined,
        budget: a.budget as string | undefined,
      });
      console.log(r.run);
    } catch (e) {
      fail((e as Error).message);
    }
  },
};

const eventCommand: CommandModule = {
  command: "event <run-id> <type>",
  describe: `append an event (${CONDUCTOR_TYPES.join(", ")})`,
  builder: (y) =>
    y
      .positional("run-id", { type: "string", demandOption: true })
      .positional("type", { type: "string", demandOption: true })
      .option("data", { type: "string", describe: "JSON object" }),
  handler: (a) => {
    const runId = a["run-id"] as string;
    const type = a.type as string;
    if (!(CONDUCTOR_TYPES as readonly string[]).includes(type)) return fail(`type must be one of ${CONDUCTOR_TYPES.join(", ")}`);
    let data: Record<string, unknown> = {};
    if (a.data !== undefined) {
      try {
        const v: unknown = JSON.parse(a.data as string);
        if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error();
        data = v as Record<string, unknown>;
      } catch {
        return fail("--data must be a JSON object");
      }
    }
    const dir = findRunDir(runId, process.env);
    if (!dir) return fail(`no run ${runId}`);
    try {
      appendEvent(dir, runId, type, data, 2000);
    } catch (e) {
      fail((e as Error).message);
    }
  },
};

const listCommand: CommandModule = {
  command: "list",
  describe: "list runs, newest first",
  builder: (y) => y.option("ticket", { type: "string" }).option("json", { type: "boolean", default: false }),
  handler: (a) => {
    const rows = listRuns(process.env, a.ticket as string | undefined);
    console.log(a.json ? JSON.stringify(rows) : formatList(rows));
  },
};

const showCommand: CommandModule = {
  command: "show <run-id>",
  describe: "show a run record with an event summary",
  builder: (y) => y.positional("run-id", { type: "string", demandOption: true }).option("json", { type: "boolean", default: false }),
  handler: (a) => {
    const r = showRun(a["run-id"] as string, process.env);
    if (!r) return fail(`no run ${a["run-id"]}`);
    console.log(a.json ? JSON.stringify(r) : formatShow(r));
  },
};

const tailCommand: CommandModule = {
  command: "tail <run-id>",
  describe: "print the events of a run, one JSON line each (no follow)",
  builder: (y) => y.positional("run-id", { type: "string", demandOption: true }).option("since", { type: "number", default: 0, describe: "only events with a greater seq" }),
  handler: (a) => {
    const events = tailEvents(a["run-id"] as string, a.since as number, process.env);
    if (!events) return fail(`no run ${a["run-id"]}`);
    for (const e of events) console.log(JSON.stringify(e));
  },
};

const runCommand: CommandModule = {
  command: "run",
  describe: "Nightwatch run records: start, event, list, show, tail",
  builder: (y) => y.command(startCommand).command(eventCommand).command(listCommand).command(showCommand).command(tailCommand).demandCommand(1, ""),
  handler: () => {},
};

export default runCommand;
```

In `packages/cli/src/index.ts` add `import runCommand from "./run/index.ts";` and `.command(runCommand)` after `.command(reviewerCommand)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli`
Expected: PASS, including `index.test.ts` and `index.e2e.test.ts` (if one of them lists the root commands, add `run` there). Then run `pnpm --filter @digismith/cli build` and expect a clean tsc.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run packages/cli/src/index.ts
git commit -m "feat(run): add dg run start, event, list, show and tail"
```

---

### Task 6: Whole-ticket check, runbook block and docs

**Files:**
- Create: `packages/cli/src/run/README.md` (what the files are, the event types, how to read them; plain short sentences)
- Create: `.digismith/board/DGS-581—nightwatch-run-record/runbook-block.md` (the text block for the conductor; the report links it)
- Test: `scripts/run-events/end-to-end.test.ts`

**Interfaces:**
- Consumes (Tasks 1 to 5): `dg run start` (through `packages/cli/src/index.ts`), `scripts/run-events/hook-cli.ts`, `hooks/hooks.json`.
- Produces: the runbook block (below) and the end-to-end test that follows the "Done when" of the order.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/run-events/end-to-end.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..", "..");
const DG = path.join(ROOT, "packages", "cli", "src", "index.ts");
const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8")).hooks as Record<string, { hooks: { command: string }[] }[]>;

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-e2e-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function base(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, DIGISMITH_DEPOT_DIR: tmp, CLAUDE_PLUGIN_ROOT: ROOT };
  delete env.DIGISMITH_RUN_ID;
  return env;
}
const dg = (env: NodeJS.ProcessEnv, ...args: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", DG, ...args], { env, encoding: "utf8" });
function fire(event: string, env: NodeJS.ProcessEnv, payload: object) {
  const cmd = hooks[event].flatMap((g) => g.hooks.map((h) => h.command)).find((c) => c.includes("run-events/hook-cli.ts"))!;
  return spawnSync("sh", ["-c", cmd], { input: JSON.stringify(payload), env, encoding: "utf8" });
}

describe("a worker run, start to end", () => {
  it("writes run.json and started, tool, blocked, turn_end, ended in seq order; dg run reads them", () => {
    const id = dg(base(), "run", "start", "--ticket", "DGS-581", "--role", "builder", "--order", "/o.md", "--seat", "dev0").stdout.trim();
    const env = { ...base(), DIGISMITH_RUN_ID: id };
    fire("SessionStart", env, { source: "startup", session_id: "s1" });
    fire("PostToolUse", env, { tool_name: "Bash", tool_response: {} });
    fire("Notification", env, { notification_type: "permission_prompt" });
    fire("Stop", env, {});
    fire("SessionEnd", env, { reason: "other" });
    const show = JSON.parse(dg(base(), "run", "show", id, "--json").stdout);
    expect(show.summary).toMatchObject({ events: 5, last_type: "ended", ended: true });
    const types = dg(base(), "run", "tail", id).stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(types.map((e) => [e.seq, e.type])).toEqual([[1, "started"], [2, "tool"], [3, "blocked"], [4, "turn_end"], [5, "ended"]]);
    expect(types[2].data).toEqual({ kind: "permission_prompt" });
  });
  it("a session without DIGISMITH_RUN_ID writes nothing", () => {
    const env = base();
    for (const e of ["SessionStart", "PostToolUse", "Notification", "Stop", "SessionEnd"]) expect(fire(e, env, { source: "startup" }).status).toBe(0);
    expect(fs.existsSync(path.join(tmp, "runs"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `pnpm vitest run scripts/run-events/end-to-end.test.ts`
Expected: PASS if Tasks 1 to 5 are right. If it fails, fix the earlier task, not this test.

- [ ] **Step 3: Write the README and the runbook block**

`packages/cli/src/run/README.md`: five short sections (Files, run.json, Events, Hooks, Commands) copied from the spec, no new facts.

`runbook-block.md` must hold this text, for the conductor to put into the worker-start step of `.digismith/sessions/workbox.md` (that file is git-excluded, so this branch cannot change it):

```
Worker start, new step before the worker is started (DGS-581):
  RUN_ID=$(dg run start --ticket <KEY> --role <builder|reviewer|scout> --order <order path> \
           --seat <seat> --model <model> --worktree <worktree dir> --workspace <w> --tab "<tab label>" --pane <pane>)
Start the worker with DIGISMITH_RUN_ID=$RUN_ID in its environment (with DIGISMITH_REVIEW_MODE=role for a Builder).
A retry, a new Reviewer or a new Scout runs dg run start again and gets a new id. Never reuse an id.
After the start, check: dg run show $RUN_ID. Events appear as the worker works: started, tool, blocked, turn_end, ended.
The conductor writes the lifecycle events no hook can see: dg run event $RUN_ID review_ready|merged|pushed|lost [--data '{...}'].
First use after the merge and plugin update: start a throwaway worker this way, trigger one prompt and one permission
prompt, close it, then dg run show must list started, tool, blocked, turn_end, ended in seq order.
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm vitest run`
Expected: PASS, no failure outside this ticket's files (if one exists on `main` already, say so in the report with the output).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run/README.md scripts/run-events/end-to-end.test.ts ".digismith/board/DGS-581—nightwatch-run-record/runbook-block.md"
git commit -m "docs(run): add the nightwatch readme and runbook block"
```
