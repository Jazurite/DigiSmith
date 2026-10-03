# Subscription Load Balancer (dg workbox) Implementation Plan

> **Deferred 2026-10-03 (Jack): dg workbox is a separate package packages/workbox, not packages/cli. File paths below that say packages/cli/src/workbox must move to packages/workbox when this is built later. Build ticket: see backlog/dg-workbox-package.md.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `dg workbox` command group (`start`, `list`, `stop`, `exhaust`) that starts a herdr worker on the least-loaded Claude subscription account and records the assignment in a roster file.

**Architecture:** A new `packages/cli/src/workbox/` module group next to `vps`, `depot` and `clickup`. A pure balancer picks the account, a locked atomic roster file remembers assignments, and `start` loads the chosen token inside the herdr pane through a shell command that carries only the account name. All herdr and `claude-account` calls go through injected runners, so tests record calls and never touch live herdr or the real token store.

**Tech Stack:** TypeScript run with `node --experimental-strip-types` (Node 24), yargs `CommandModule`, vitest, `herdr` 0.9.1 CLI, `claude-account` CLI.

**Spec:** `.digismith/docs/B/B.2/subscription-load-balancer/design.html` (approved 2026-10-03). Ticket DGS-144, ClickUp `14zcebrupd2`.

## Global Constraints

- Never print, read or commit a token. Do not read `~/.config/claude-accounts/`. DigiSmith code never opens the token store; only the pane shell reads `<name>.token`.
- Only an account name travels through herdr arguments, logs, the roster and the maestro.
- Account names match `^[a-z][a-z0-9_-]{0,31}$` (claude-account's own pattern). `loadCommand` validates the name before putting it into shell text.
- All herdr calls are `herdr --session <s> ...` with an argument array, never a shell string.
- The load marker is `workbox account: <name>`, printed with `printf 'workbox account: %s\n'`, and matched as a whole trimmed line, never as a substring (the pane echoes the typed command).
- Roster file is `~/.digismith-depot/workbox.json`, version 1, written atomically (temp file, then rename), with an advisory lock file around read-modify-write. A corrupt or unknown-version file is never overwritten.
- Roster key is `(herdr session, agent name)`. `lastAssignedAt` and `exhaustedUntil` belong to the account and survive `stop`.
- v1 assignment: drop accounts whose `exhaustedUntil` is later than now; pick the fewest live workers; tie goes to the oldest `lastAssignedAt` (never assigned first); final tie goes to name order. `start --pane` does not count the re-seated worker's own old seat.
- Every time shown to a person is UTC+7 first, UTC in brackets: `2026-10-03 21:30 UTC+7 [2026-10-03 14:30 UTC]`.
- Imports use `.ts` extensions. `tsconfig.build.json` is strict NodeNext and excludes only `src/**/*.test.ts`, so no non-test fixture `.ts` files.
- Tests never run live herdr and never read real tokens. Token-safety tests use a temp `CLAUDE_ACCOUNTS_DIR` with a sentinel token and a real `bash` subprocess.
- Commits are title-only conventional commits with no Co-Authored-By line and no "Generated with" footer. Push when the branch is finished.
- Work only in `.worktrees/subscription-load-balancer`. Do not touch the main checkout, DGS-114 or its worktree.
- Run tests from the worktree root: `npx vitest run packages/cli/src/workbox`.

---

## File Structure

All new files are in `packages/cli/src/workbox/` unless noted. One test file sits beside each module.

| File | Responsibility |
|---|---|
| `time.ts` | `formatUtc7(iso)` |
| `balancer.ts` | `pickAccount`, `exhaustedUntilMs`, types `AccountState`, `LiveWorker`, `PickInput` |
| `roster.ts` | roster types, read, atomic write, lock, `updateRoster`, small pure helpers |
| `accounts.ts` | account list parsing, name validation, load command, marker check |
| `herdr.ts` | `Herdr` interface and `createHerdr(session, run)` over an injected runner |
| `deps.ts` | `WorkboxDeps` and `defaultDeps(session)` |
| `start.ts` | `runStart` |
| `stop.ts` | `runStop` |
| `exhaust.ts` | `runExhaust` |
| `list.ts` | `formatList`, `runList` |
| `index.ts` | `createWorkboxCommand(depsFactory)` and `workboxCommand` |
| `packages/cli/src/index.ts` | modify: `.command(workboxCommand)` |
| `packages/cli/src/index.test.ts` | modify: registers-workbox assertion |
| `packages/cli/README.md` | modify: list the commands |
| `.digismith/docs/B/B.2/subscription-load-balancer/runbook-patch.md` | the runbook edits for the maestro to apply (the runbook is untracked in main) |

Task split (7 tasks, a commit after each): 1 time and balancer; 2 roster; 3 accounts; 4 herdr wrapper and default deps; 5 start; 6 stop, exhaust and list; 7 wiring, README and runbook patch.

---

### Task 1: Time formatter and balancer

**Files:**
- Create: `packages/cli/src/workbox/time.ts`, `packages/cli/src/workbox/time.test.ts`
- Create: `packages/cli/src/workbox/balancer.ts`, `packages/cli/src/workbox/balancer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatUtc7(iso: string): string`
  - `interface AccountState { exhaustedUntil?: string; lastAssignedAt?: string }`
  - `interface LiveWorker { agent: string; account: string }`
  - `interface PickInput { accounts: string[]; workers: LiveWorker[]; accountState: Record<string, AccountState>; now: Date; excludeAgent?: string }`
  - `exhaustedUntilMs(state: AccountState | undefined, now: Date): number | undefined`
  - `pickAccount(input: PickInput): string`

- [ ] **Step 1: Write the failing time test**

`packages/cli/src/workbox/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatUtc7 } from "./time.ts";

describe("formatUtc7", () => {
  it("shows UTC+7 first and UTC in brackets", () => {
    expect(formatUtc7("2026-10-03T14:30:00Z")).toBe("2026-10-03 21:30 UTC+7 [2026-10-03 14:30 UTC]");
  });

  it("accepts an offset input", () => {
    expect(formatUtc7("2026-10-03T21:30:00+07:00")).toBe("2026-10-03 21:30 UTC+7 [2026-10-03 14:30 UTC]");
  });

  it("rolls the UTC+7 date over midnight", () => {
    expect(formatUtc7("2026-10-03T20:00:00Z")).toBe("2026-10-04 03:00 UTC+7 [2026-10-03 20:00 UTC]");
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatUtc7("soon")).toBe("soon");
  });
});
```

- [ ] **Step 2: Write the failing balancer test**

`packages/cli/src/workbox/balancer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickAccount, type PickInput } from "./balancer.ts";

const NOW = new Date("2026-10-03T08:00:00Z");

function pick(over: Partial<PickInput>): string {
  return pickAccount({ accounts: ["jack", "dev0"], workers: [], accountState: {}, now: NOW, ...over });
}

describe("pickAccount", () => {
  it("picks the account with the fewest live workers", () => {
    const workers = [
      { agent: "a", account: "jack" },
      { agent: "b", account: "jack" },
      { agent: "c", account: "dev0" },
    ];
    expect(pick({ workers })).toBe("dev0");
  });

  it("skips an account that is exhausted until later", () => {
    const accountState = { dev0: { exhaustedUntil: "2026-10-03T11:00:00Z" } };
    expect(pick({ accountState, workers: [{ agent: "a", account: "jack" }] })).toBe("jack");
  });

  it("ignores an expired exhausted mark", () => {
    const accountState = { dev0: { exhaustedUntil: "2026-10-03T07:00:00Z" } };
    expect(pick({ accountState, workers: [{ agent: "a", account: "jack" }] })).toBe("dev0");
  });

  it("breaks a tie with the oldest lastAssignedAt", () => {
    const accountState = {
      jack: { lastAssignedAt: "2026-10-03T07:00:00Z" },
      dev0: { lastAssignedAt: "2026-10-03T06:00:00Z" },
    };
    expect(pick({ accountState })).toBe("dev0");
  });

  it("puts a never-assigned account before an assigned one", () => {
    const accountState = { jack: { lastAssignedAt: "2026-10-03T06:00:00Z" } };
    expect(pick({ accountState })).toBe("dev0");
  });

  it("breaks a final tie by name", () => {
    expect(pick({ accounts: ["jack", "dev0"] })).toBe("dev0");
    expect(pick({ accounts: ["dev0", "jack"] })).toBe("dev0");
  });

  it("does not count the re-seated worker's own old seat", () => {
    const workers = [
      { agent: "me", account: "jack" },
      { agent: "o", account: "dev0" },
    ];
    const accountState = {
      jack: { lastAssignedAt: "2026-10-03T09:00:00Z" },
      dev0: { lastAssignedAt: "2026-10-03T08:00:00Z" },
    };
    expect(pick({ workers, accountState, excludeAgent: "me" })).toBe("jack");
  });

  it("counts that seat when no agent is excluded", () => {
    const workers = [
      { agent: "me", account: "jack" },
      { agent: "o", account: "dev0" },
    ];
    const accountState = {
      jack: { lastAssignedAt: "2026-10-03T09:00:00Z" },
      dev0: { lastAssignedAt: "2026-10-03T08:00:00Z" },
    };
    expect(pick({ workers, accountState })).toBe("dev0");
  });

  it("errors with the earliest reset when every account is exhausted", () => {
    const accountState = {
      jack: { exhaustedUntil: "2026-10-03T11:00:00Z" },
      dev0: { exhaustedUntil: "2026-10-03T13:00:00Z" },
    };
    expect(() => pick({ accountState })).toThrow(/every account is exhausted; earliest reset 2026-10-03 18:00 UTC\+7/);
  });

  it("balances across three accounts", () => {
    const workers = [
      { agent: "a", account: "jack" },
      { agent: "b", account: "dev0" },
      { agent: "c", account: "dev0" },
    ];
    expect(pick({ accounts: ["jack", "dev0", "emma"], workers })).toBe("emma");
  });

  it("errors on an empty account list", () => {
    expect(() => pick({ accounts: [] })).toThrow(/no accounts/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/workbox/time.test.ts packages/cli/src/workbox/balancer.test.ts`
Expected: FAIL, "Failed to resolve import ./time.ts" and "./balancer.ts".

- [ ] **Step 4: Implement `time.ts`**

```ts
const UTC7_MS = 7 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function stamp(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatUtc7(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return `${stamp(new Date(ms + UTC7_MS))} UTC+7 [${stamp(new Date(ms))} UTC]`;
}
```

- [ ] **Step 5: Implement `balancer.ts`**

```ts
import { formatUtc7 } from "./time.ts";

export interface AccountState {
  exhaustedUntil?: string;
  lastAssignedAt?: string;
}

export interface LiveWorker {
  agent: string;
  account: string;
}

export interface PickInput {
  accounts: string[];
  workers: LiveWorker[];
  accountState: Record<string, AccountState>;
  now: Date;
  excludeAgent?: string;
}

export function exhaustedUntilMs(state: AccountState | undefined, now: Date): number | undefined {
  if (!state?.exhaustedUntil) return undefined;
  const ms = Date.parse(state.exhaustedUntil);
  if (Number.isNaN(ms) || ms <= now.getTime()) return undefined;
  return ms;
}

function lastAssignedMs(state: AccountState | undefined): number {
  const ms = state?.lastAssignedAt ? Date.parse(state.lastAssignedAt) : Number.NaN;
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function cmp(x: number, y: number): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

export function pickAccount(input: PickInput): string {
  const { accounts, workers, accountState, now, excludeAgent } = input;
  if (accounts.length === 0) throw new Error("no accounts to choose from");
  const open = accounts.filter((a) => exhaustedUntilMs(accountState[a], now) === undefined);
  if (open.length === 0) {
    const earliest = Math.min(...accounts.map((a) => exhaustedUntilMs(accountState[a], now) as number));
    throw new Error(`every account is exhausted; earliest reset ${formatUtc7(new Date(earliest).toISOString())}`);
  }
  const load = (a: string): number => workers.filter((w) => w.account === a && w.agent !== excludeAgent).length;
  const order = (a: string, b: string): number =>
    cmp(load(a), load(b)) ||
    cmp(lastAssignedMs(accountState[a]), lastAssignedMs(accountState[b])) ||
    a.localeCompare(b);
  return open.reduce((best, a) => (order(a, best) < 0 ? a : best));
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/workbox/time.test.ts packages/cli/src/workbox/balancer.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/workbox/time.ts packages/cli/src/workbox/time.test.ts packages/cli/src/workbox/balancer.ts packages/cli/src/workbox/balancer.test.ts
git commit -m "feat(workbox): add account balancer"
```

---

### Task 2: Roster file

**Files:**
- Create: `packages/cli/src/workbox/roster.ts`, `packages/cli/src/workbox/roster.test.ts`

**Interfaces:**
- Consumes: `AccountState` from `./balancer.ts`, `exhaustedUntilMs` from `./balancer.ts`.
- Produces:
  - `ROSTER_VERSION = 1`
  - `interface RosterWorker { agent: string; session: string; workspace: string; pane: string; account: string; assignedAt: string; state: "running" | "stopped" }`
  - `interface Roster { version: number; workers: RosterWorker[]; accounts: Record<string, AccountState> }`
  - `defaultRosterPath(): string`, `emptyRoster(): Roster`
  - `readRoster(file: string): Roster` (missing file gives an empty roster; corrupt or unknown version throws)
  - `writeRoster(file: string, roster: Roster): void` (atomic)
  - `updateRoster(file: string, mutate: (r: Roster) => void, opts?: { lockTimeoutMs?: number; now?: () => Date }): Roster`
  - `liveWorkers(roster: Roster, session: string, liveAgentNames: string[]): RosterWorker[]`
  - `findWorker(roster: Roster, session: string, agent: string): RosterWorker | undefined`
  - `upsertWorker(roster: Roster, worker: RosterWorker): void`
  - `markStopped(roster: Roster, session: string, agent: string): boolean`
  - `recordAssignment(roster: Roster, account: string, at: string): void`
  - `recordExhausted(roster: Roster, account: string, until: string): void`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/workbox/roster.test.ts`:

```ts
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emptyRoster,
  findWorker,
  liveWorkers,
  markStopped,
  readRoster,
  recordAssignment,
  recordExhausted,
  updateRoster,
  upsertWorker,
  writeRoster,
  type RosterWorker,
} from "./roster.ts";

const NOW = new Date("2026-10-03T08:00:00Z");

function worker(over: Partial<RosterWorker> = {}): RosterWorker {
  return {
    agent: "b-agentic",
    session: "DigiSmith",
    workspace: "w4",
    pane: "w4:p1",
    account: "jack",
    assignedAt: "2026-10-03T08:00:00Z",
    state: "running",
    ...over,
  };
}

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "roster-"));
  file = join(dir, "workbox.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("readRoster and writeRoster", () => {
  it("returns an empty roster when the file is missing", () => {
    expect(readRoster(file)).toEqual(emptyRoster());
  });

  it("round-trips a roster and leaves no temp file", () => {
    const roster = emptyRoster();
    upsertWorker(roster, worker());
    recordAssignment(roster, "jack", "2026-10-03T08:00:00Z");
    writeRoster(file, roster);
    expect(readRoster(file)).toEqual(roster);
    expect(readdirSync(dir)).toEqual(["workbox.json"]);
  });

  it("refuses an unknown version and leaves the file unchanged", () => {
    const text = JSON.stringify({ version: 2, workers: [], accounts: {} });
    writeFileSync(file, text);
    expect(() => readRoster(file)).toThrow(/unknown version 2/);
    expect(readFileSync(file, "utf8")).toBe(text);
  });

  it("refuses invalid JSON and leaves the file unchanged", () => {
    writeFileSync(file, "{not json");
    expect(() => readRoster(file)).toThrow(/is corrupt/);
    expect(readFileSync(file, "utf8")).toBe("{not json");
  });

  it("refuses a wrong shape", () => {
    writeFileSync(file, JSON.stringify({ version: 1, workers: "nope", accounts: {} }));
    expect(() => readRoster(file)).toThrow(/is corrupt/);
    writeFileSync(file, JSON.stringify({ version: 1, workers: [{ agent: "x" }], accounts: {} }));
    expect(() => readRoster(file)).toThrow(/is corrupt/);
    writeFileSync(file, JSON.stringify({ version: 1, workers: [], accounts: { jack: { exhaustedUntil: 5 } } }));
    expect(() => readRoster(file)).toThrow(/is corrupt/);
  });
});

describe("updateRoster", () => {
  it("applies the mutation and writes it", () => {
    updateRoster(file, (r) => upsertWorker(r, worker()));
    expect(readRoster(file).workers).toEqual([worker()]);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it("writes nothing and removes the lock when the mutation throws", () => {
    expect(() =>
      updateRoster(file, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(existsSync(file)).toBe(false);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it("does not overwrite a corrupt file and still removes the lock", () => {
    writeFileSync(file, "{not json");
    expect(() => updateRoster(file, () => {})).toThrow(/is corrupt/);
    expect(readFileSync(file, "utf8")).toBe("{not json");
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it("times out when a fresh lock is held", () => {
    writeFileSync(`${file}.lock`, "");
    expect(() => updateRoster(file, () => {}, { lockTimeoutMs: 100 })).toThrow(
      /could not lock .*another dg workbox command may be running/,
    );
  });

  it("takes over a stale lock", () => {
    writeFileSync(`${file}.lock`, "");
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${file}.lock`, old, old);
    updateRoster(file, (r) => upsertWorker(r, worker()));
    expect(readRoster(file).workers).toHaveLength(1);
  });

  it("prunes expired exhausted marks and keeps future ones", () => {
    const roster = emptyRoster();
    recordExhausted(roster, "jack", "2026-10-03T07:00:00Z");
    recordExhausted(roster, "dev0", "2026-10-03T11:00:00Z");
    writeRoster(file, roster);
    updateRoster(file, () => {}, { now: () => NOW });
    const after = readRoster(file);
    expect(after.accounts.jack?.exhaustedUntil).toBeUndefined();
    expect(after.accounts.dev0?.exhaustedUntil).toBe("2026-10-03T11:00:00Z");
  });

  it("keeps every write when three processes update at once", async () => {
    const script = `
      const { updateRoster, upsertWorker } = await import(process.env.ROSTER_URL);
      const [file, tag] = process.argv.slice(1);
      for (let i = 0; i < 5; i++) {
        updateRoster(file, (r) => upsertWorker(r, {
          agent: tag + "-" + i, session: "s", workspace: "w", pane: "w:p1",
          account: "jack", assignedAt: "2026-10-03T08:00:00Z", state: "running",
        }));
      }
    `;
    const rosterUrl = new URL("./roster.ts", import.meta.url).href;
    const run = (tag: string) =>
      new Promise<number | null>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--experimental-strip-types", "--input-type=module", "-e", script, file, tag],
          { env: { ...process.env, ROSTER_URL: rosterUrl }, stdio: "ignore" },
        );
        child.on("error", reject);
        child.on("close", resolve);
      });
    const codes = await Promise.all([run("a"), run("b"), run("c")]);
    expect(codes).toEqual([0, 0, 0]);
    expect(readRoster(file).workers).toHaveLength(15);
  }, 30_000);
});

describe("roster helpers", () => {
  it("liveWorkers keeps running workers of the session that herdr still lists", () => {
    const roster = emptyRoster();
    upsertWorker(roster, worker({ agent: "a" }));
    upsertWorker(roster, worker({ agent: "gone" }));
    upsertWorker(roster, worker({ agent: "stopped", state: "stopped" }));
    upsertWorker(roster, worker({ agent: "other", session: "Emma" }));
    const live = liveWorkers(roster, "DigiSmith", ["a", "stopped", "other"]);
    expect(live.map((w) => w.agent)).toEqual(["a"]);
  });

  it("upsertWorker replaces the entry with the same session and agent", () => {
    const roster = emptyRoster();
    upsertWorker(roster, worker({ account: "jack" }));
    upsertWorker(roster, worker({ account: "dev0", pane: "w4:p2" }));
    expect(roster.workers).toHaveLength(1);
    expect(findWorker(roster, "DigiSmith", "b-agentic")?.account).toBe("dev0");
  });

  it("markStopped flips the state and reports whether it found the worker", () => {
    const roster = emptyRoster();
    upsertWorker(roster, worker());
    expect(markStopped(roster, "DigiSmith", "b-agentic")).toBe(true);
    expect(roster.workers[0]?.state).toBe("stopped");
    expect(markStopped(roster, "DigiSmith", "nope")).toBe(false);
  });

  it("account marks survive stop", () => {
    const roster = emptyRoster();
    upsertWorker(roster, worker());
    recordAssignment(roster, "jack", "2026-10-03T08:00:00Z");
    recordExhausted(roster, "jack", "2026-10-03T11:00:00Z");
    markStopped(roster, "DigiSmith", "b-agentic");
    expect(roster.accounts.jack).toEqual({
      lastAssignedAt: "2026-10-03T08:00:00Z",
      exhaustedUntil: "2026-10-03T11:00:00Z",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/cli/src/workbox/roster.test.ts`
Expected: FAIL, "Failed to resolve import ./roster.ts".

- [ ] **Step 3: Implement `roster.ts`**

```ts
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { exhaustedUntilMs, type AccountState } from "./balancer.ts";

export const ROSTER_VERSION = 1;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

export interface RosterWorker {
  agent: string;
  session: string;
  workspace: string;
  pane: string;
  account: string;
  assignedAt: string;
  state: "running" | "stopped";
}

export interface Roster {
  version: number;
  workers: RosterWorker[];
  accounts: Record<string, AccountState>;
}

export function defaultRosterPath(): string {
  return join(homedir(), ".digismith-depot", "workbox.json");
}

export function emptyRoster(): Roster {
  return { version: ROSTER_VERSION, workers: [], accounts: {} };
}

function corrupt(file: string, why: string): Error {
  return new Error(`roster file ${file} is corrupt (${why}); fix or remove it (it is never overwritten)`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const isStr = (v: unknown): v is string => typeof v === "string";

function isWorker(v: unknown): v is RosterWorker {
  return (
    isRecord(v) &&
    isStr(v.agent) &&
    isStr(v.session) &&
    isStr(v.workspace) &&
    isStr(v.pane) &&
    isStr(v.account) &&
    isStr(v.assignedAt) &&
    (v.state === "running" || v.state === "stopped")
  );
}

function isAccountState(v: unknown): v is AccountState {
  return (
    isRecord(v) &&
    (v.exhaustedUntil === undefined || isStr(v.exhaustedUntil)) &&
    (v.lastAssignedAt === undefined || isStr(v.lastAssignedAt))
  );
}

export function readRoster(file: string): Roster {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyRoster();
    throw e;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw corrupt(file, "invalid JSON");
  }
  if (!isRecord(data)) throw corrupt(file, "not an object");
  if (data.version !== ROSTER_VERSION) {
    throw new Error(`roster file ${file} has unknown version ${String(data.version)}; it is never overwritten`);
  }
  if (!Array.isArray(data.workers) || !data.workers.every(isWorker)) throw corrupt(file, "bad workers list");
  if (!isRecord(data.accounts) || !Object.values(data.accounts).every(isAccountState)) {
    throw corrupt(file, "bad accounts map");
  }
  return { version: ROSTER_VERSION, workers: data.workers, accounts: data.accounts as Record<string, AccountState> };
}

export function writeRoster(file: string, roster: Roster): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(roster, null, 2)}\n`);
  renameSync(tmp, file);
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Stale takeover is best effort: it exists to recover from a crashed holder, not to arbitrate two live ones.
function acquireLock(lock: string, timeoutMs: number): void {
  mkdirSync(dirname(lock), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    try {
      if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) {
        unlinkSync(lock);
        continue;
      }
    } catch {
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`could not lock ${lock}; another dg workbox command may be running`);
    }
    sleepMs(20);
  }
}

function pruneExpired(roster: Roster, now: Date): void {
  for (const state of Object.values(roster.accounts)) {
    if (state.exhaustedUntil !== undefined && exhaustedUntilMs(state, now) === undefined) {
      delete state.exhaustedUntil;
    }
  }
}

export interface UpdateOptions {
  lockTimeoutMs?: number;
  now?: () => Date;
}

export function updateRoster(file: string, mutate: (r: Roster) => void, opts: UpdateOptions = {}): Roster {
  const lock = `${file}.lock`;
  acquireLock(lock, opts.lockTimeoutMs ?? LOCK_TIMEOUT_MS);
  try {
    const roster = readRoster(file);
    mutate(roster);
    pruneExpired(roster, (opts.now ?? (() => new Date()))());
    writeRoster(file, roster);
    return roster;
  } finally {
    try {
      unlinkSync(lock);
    } catch {
      // already gone
    }
  }
}

export function liveWorkers(roster: Roster, session: string, liveAgentNames: string[]): RosterWorker[] {
  return roster.workers.filter(
    (w) => w.session === session && w.state === "running" && liveAgentNames.includes(w.agent),
  );
}

export function findWorker(roster: Roster, session: string, agent: string): RosterWorker | undefined {
  return roster.workers.find((w) => w.session === session && w.agent === agent);
}

export function upsertWorker(roster: Roster, worker: RosterWorker): void {
  const i = roster.workers.findIndex((w) => w.session === worker.session && w.agent === worker.agent);
  if (i >= 0) roster.workers[i] = worker;
  else roster.workers.push(worker);
}

export function markStopped(roster: Roster, session: string, agent: string): boolean {
  const w = findWorker(roster, session, agent);
  if (!w) return false;
  w.state = "stopped";
  return true;
}

export function recordAssignment(roster: Roster, account: string, at: string): void {
  roster.accounts[account] = { ...roster.accounts[account], lastAssignedAt: at };
}

export function recordExhausted(roster: Roster, account: string, until: string): void {
  roster.accounts[account] = { ...roster.accounts[account], exhaustedUntil: until };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/cli/src/workbox/roster.test.ts`
Expected: PASS, 16 tests. If the three-process test fails with a lock timeout, raise nothing: investigate (the lock must be released in `finally`).

- [ ] **Step 5: Type-check**

Run: `npx tsc -p packages/cli/tsconfig.build.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/workbox/roster.ts packages/cli/src/workbox/roster.test.ts
git commit -m "feat(workbox): add roster file with lock and atomic write"
```

---

### Task 3: Accounts and the pane-side token loader

**Files:**
- Create: `packages/cli/src/workbox/accounts.ts`, `packages/cli/src/workbox/accounts.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ACCOUNT_NAME: RegExp`
  - `assertAccountName(name: string): void` (throws on an invalid name)
  - `parseAccountList(stdout: string): string[]`
  - `interface AccountListRun { status: number | null; stdout: string; stderr: string; error?: Error }`
  - `runClaudeAccountList(): AccountListRun`
  - `listAccounts(run?: () => AccountListRun): string[]` (throws when `claude-account` is missing, fails, or lists nothing)
  - `loadMarker(name: string): string` returns `workbox account: <name>`
  - `loadCommand(name: string): string` (calls `assertAccountName` first)
  - `markerPresent(paneText: string, account: string): boolean`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/workbox/accounts.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertAccountName,
  listAccounts,
  loadCommand,
  loadMarker,
  markerPresent,
  parseAccountList,
  type AccountListRun,
} from "./accounts.ts";

const SENTINEL = "SENTINEL-TOKEN-123";

describe("parseAccountList", () => {
  it("reads active and inactive names", () => {
    expect(parseAccountList("* jack\n  dev0\n")).toEqual(["jack", "dev0"]);
  });

  it("returns nothing for the empty message and for junk lines", () => {
    expect(parseAccountList("(no accounts yet — add one)\n")).toEqual([]);
    expect(parseAccountList("hello\n* Bad Name\n")).toEqual([]);
  });
});

describe("listAccounts", () => {
  const ok = (stdout: string): (() => AccountListRun) => () => ({ status: 0, stdout, stderr: "" });

  it("returns the names", () => {
    expect(listAccounts(ok("* jack\n  dev0\n"))).toEqual(["jack", "dev0"]);
  });

  it("errors when claude-account is missing", () => {
    const run = () => ({ status: null, stdout: "", stderr: "", error: new Error("spawnSync claude-account ENOENT") });
    expect(() => listAccounts(run)).toThrow(/claude-account is not available/);
  });

  it("errors on a non-zero exit", () => {
    const run = () => ({ status: 2, stdout: "", stderr: "broken" });
    expect(() => listAccounts(run)).toThrow(/claude-account list failed \(exit 2\): broken/);
  });

  it("errors when no accounts are listed", () => {
    expect(() => listAccounts(ok("(no accounts yet — add one)\n"))).toThrow(/lists no accounts/);
  });
});

describe("assertAccountName", () => {
  it("accepts claude-account style names", () => {
    for (const n of ["jack", "dev0", "a", "a-b_c9", "a".repeat(32)]) expect(() => assertAccountName(n)).not.toThrow();
  });

  it("rejects everything else", () => {
    for (const n of ["", "Jack", "1x", "a b", "a;rm", "$(id)", "a".repeat(33), "-x"]) {
      expect(() => assertAccountName(n)).toThrow(/invalid account name/);
    }
  });
});

describe("loadCommand text", () => {
  it("refuses a name that could inject shell text", () => {
    expect(() => loadCommand("x; rm -rf ~")).toThrow(/invalid account name/);
    expect(() => loadCommand("$(id)")).toThrow(/invalid account name/);
  });

  it("carries the token path and the printf marker, and no token", () => {
    const cmd = loadCommand("jack");
    expect(cmd).toContain("${CLAUDE_ACCOUNTS_DIR:-$HOME/.config/claude-accounts}/jack.token");
    expect(cmd).toContain("printf 'workbox account: %s\\n' jack");
    expect(cmd).not.toContain(SENTINEL);
  });
});

describe("markerPresent", () => {
  it("matches a whole printed line", () => {
    expect(markerPresent("$ foo\nworkbox account: jack\n$ ", "jack")).toBe(true);
    expect(markerPresent("  workbox account: jack  \n", "jack")).toBe(true);
  });

  it("does not count a pane tail that holds only the typed load command", () => {
    const typed = `$ ${loadCommand("jack")}\n$ `;
    expect(markerPresent(typed, "jack")).toBe(false);
  });

  it("does not match a longer or prefixed line", () => {
    expect(markerPresent("workbox account: jackson\n", "jack")).toBe(false);
    expect(markerPresent("xworkbox account: jack\n", "jack")).toBe(false);
  });

  it("loadMarker is the marker text", () => {
    expect(loadMarker("jack")).toBe("workbox account: jack");
  });
});

describe("loadCommand in real bash", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "accounts-"));
    writeFileSync(join(dir, "jack.token"), `${SENTINEL}\n`);
    writeFileSync(join(dir, "empty.token"), "");
    mkdirSync(join(dir, "dir.token"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function runBash(name: string): { status: number | null; stdout: string; stderr: string } {
    const script = [
      "export CLAUDE_CODE_OAUTH_TOKEN=ACTIVE-DEFAULT",
      loadCommand(name),
      "rc=$?",
      'case "$CLAUDE_CODE_OAUTH_TOKEN" in SENTINEL-TOKEN-123) echo token=sentinel;; ACTIVE-DEFAULT) echo token=old;; *) echo token=other;; esac',
      'echo "acct=${CLAUDE_ACCOUNT:-unset}"',
      'if [ -z "${t+x}" ]; then echo t=unset; else echo t=set; fi',
      "exit $rc",
    ].join("\n");
    const r = spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: dir, CLAUDE_ACCOUNTS_DIR: dir },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  it("prints only the marker, loads the token, and unsets t", () => {
    const r = runBash("jack");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("workbox account: jack\ntoken=sentinel\nacct=jack\nt=unset\n");
    expect(r.stderr).toBe("");
    expect(r.stdout).not.toContain(SENTINEL);
  });

  it("wins over the shell's active-account token", () => {
    expect(runBash("jack").stdout).toContain("token=sentinel");
  });

  it.each([
    ["missing", "nobody"],
    ["empty", "empty"],
    ["unreadable", "dir"],
  ])("prints nothing and keeps the old token when the token file is %s", (_label, name) => {
    const r = runBash(name);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("token=old\nacct=unset\nt=unset\n");
    expect(r.stderr).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/cli/src/workbox/accounts.test.ts`
Expected: FAIL, "Failed to resolve import ./accounts.ts".

- [ ] **Step 3: Implement `accounts.ts`**

```ts
import { spawnSync } from "node:child_process";

export const ACCOUNT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const LIST_LINE = /^[* ] ([a-z][a-z0-9_-]{0,31})$/;

export function assertAccountName(name: string): void {
  if (!ACCOUNT_NAME.test(name)) {
    throw new Error(`invalid account name "${name}"; use lowercase letters, digits, - or _ (max 32, starting with a letter)`);
  }
}

export function parseAccountList(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = LIST_LINE.exec(line.trimEnd());
    if (m?.[1]) names.push(m[1]);
  }
  return names;
}

export interface AccountListRun {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export function runClaudeAccountList(): AccountListRun {
  const r = spawnSync("claude-account", ["list"], { encoding: "utf8", timeout: 10_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error };
}

export function listAccounts(run: () => AccountListRun = runClaudeAccountList): string[] {
  const r = run();
  if (r.error) throw new Error(`claude-account is not available: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`claude-account list failed (exit ${r.status}): ${r.stderr.trim() || r.stdout.trim()}`);
  }
  const names = parseAccountList(r.stdout);
  if (names.length === 0) throw new Error("claude-account lists no accounts; add one with claude-account first");
  return names;
}

export function loadMarker(name: string): string {
  return `workbox account: ${name}`;
}

// Runs inside the pane shell. Reads the token file into a variable first, because
// `export X="$(cat missing)"` returns success and would hide a failed read. Prints
// the marker only when the token is non-empty. Only the account name is interpolated.
export function loadCommand(name: string): string {
  assertAccountName(name);
  return (
    `t="$(cat "\${CLAUDE_ACCOUNTS_DIR:-$HOME/.config/claude-accounts}/${name}.token" 2>/dev/null)"` +
    ` && [ -n "$t" ]` +
    ` && export CLAUDE_ACCOUNT=${name} CLAUDE_CODE_OAUTH_TOKEN="$t"` +
    ` && printf 'workbox account: %s\\n' ${name}; s=$?; unset t; (exit $s)`
  );
}

export function markerPresent(paneText: string, account: string): boolean {
  const marker = loadMarker(account);
  return paneText.split("\n").some((line) => line.trim() === marker);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/cli/src/workbox/accounts.test.ts`
Expected: PASS, 19 tests. The real-bash block needs `bash` on PATH.

- [ ] **Step 5: Type-check**

Run: `npx tsc -p packages/cli/tsconfig.build.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/workbox/accounts.ts packages/cli/src/workbox/accounts.test.ts
git commit -m "feat(workbox): add account list and pane-side token loader"
```

---

### Task 4: Herdr wrapper and default deps

**Files:**
- Create: `packages/cli/src/workbox/herdr.ts`, `packages/cli/src/workbox/herdr.test.ts`
- Create: `packages/cli/src/workbox/deps.ts`

**Interfaces:**
- Consumes: `listAccounts` from `./accounts.ts`, `defaultRosterPath` from `./roster.ts`.
- Produces:
  - `interface RunResult { status: number | null; stdout: string; stderr: string; error?: Error }`
  - `type HerdrRunner = (args: string[]) => RunResult`
  - `spawnHerdr: HerdrRunner` (runs the real `herdr`, 200 s timeout)
  - `interface AgentInfo { name: string; pane: string; workspace: string }`
  - `interface Herdr { workspaceCreate(o: { cwd: string; label: string; account: string }): { workspace: string; pane: string }; workspaceClose(workspace: string): void; paneRun(pane: string, command: string): void; paneRead(pane: string): string; agentStart(o: { name: string; pane: string; claudeArgs: string[]; timeoutMs?: number }): void; agentList(): AgentInfo[] }`
  - `createHerdr(session: string, run: HerdrRunner): Herdr`
  - `interface WorkboxDeps { herdr: Herdr; listAccounts: () => string[]; rosterFile: string; now: () => Date; sleep: (ms: number) => void; log: (line: string) => void }`
  - `defaultDeps(session: string): WorkboxDeps`

Herdr 0.9.1 forms this task relies on (checked with `--help`): `workspace create [--cwd P] [--label T] [--env K=V] [--no-focus]`, `workspace close <id>`, `pane run <pane> <command>...`, `pane read <pane> [--source recent-unwrapped] [--lines N]`, `agent start <name> --kind claude --pane <id> [--timeout MS] [-- args...]`, `agent list`. `workspace create` prints JSON with `result.workspace.workspace_id` and `result.root_pane.pane_id`. `agent list` prints JSON with `result.agents[]` carrying `name`, `pane_id`, `workspace_id`. Herdr prints errors as JSON on stdout.

- [ ] **Step 1: Write the failing test**

`packages/cli/src/workbox/herdr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHerdr, type HerdrRunner, type RunResult } from "./herdr.ts";

const ok = (stdout = ""): RunResult => ({ status: 0, stdout, stderr: "" });

function scripted(...responses: RunResult[]): { run: HerdrRunner; calls: string[][] } {
  const calls: string[][] = [];
  const run: HerdrRunner = (args) => {
    calls.push(args);
    return responses.shift() ?? ok();
  };
  return { run, calls };
}

const WORKSPACE_JSON = JSON.stringify({
  result: {
    type: "workspace_created",
    root_pane: { pane_id: "w6:p1", workspace_id: "w6" },
    workspace: { workspace_id: "w6", label: "b: x" },
  },
});

describe("createHerdr", () => {
  it("workspaceCreate passes the account as an env name and parses the ids", () => {
    const { run, calls } = scripted(ok(WORKSPACE_JSON));
    const out = createHerdr("DigiSmith", run).workspaceCreate({ cwd: "/r", label: "b: x", account: "jack" });
    expect(out).toEqual({ workspace: "w6", pane: "w6:p1" });
    expect(calls[0]).toEqual([
      "--session", "DigiSmith", "workspace", "create",
      "--cwd", "/r", "--label", "b: x", "--env", "CLAUDE_ACCOUNT=jack", "--no-focus",
    ]);
  });

  it("workspaceCreate rejects output without the ids", () => {
    const { run } = scripted(ok("{}"));
    expect(() => createHerdr("s", run).workspaceCreate({ cwd: "/r", label: "x", account: "jack" })).toThrow(
      /workspace create returned unexpected output/,
    );
    const { run: run2 } = scripted(ok("not json"));
    expect(() => createHerdr("s", run2).workspaceCreate({ cwd: "/r", label: "x", account: "jack" })).toThrow(
      /workspace create returned unexpected output/,
    );
  });

  it("workspaceClose, paneRun and paneRead use argument arrays", () => {
    const { run, calls } = scripted(ok(), ok(), ok("pane text\n"));
    const h = createHerdr("s", run);
    h.workspaceClose("w6");
    h.paneRun("w6:p1", "echo 'a b'");
    expect(h.paneRead("w6:p1")).toBe("pane text\n");
    expect(calls).toEqual([
      ["--session", "s", "workspace", "close", "w6"],
      ["--session", "s", "pane", "run", "w6:p1", "echo 'a b'"],
      ["--session", "s", "pane", "read", "w6:p1", "--source", "recent-unwrapped", "--lines", "60"],
    ]);
  });

  it("agentStart passes claude args after --, and omits -- when there are none", () => {
    const { run, calls } = scripted();
    const h = createHerdr("s", run);
    h.agentStart({ name: "b-agentic", pane: "w4:p1", claudeArgs: ["--name", "DGS-144: x y"], timeoutMs: 90_000 });
    h.agentStart({ name: "b-agentic", pane: "w4:p1", claudeArgs: [] });
    expect(calls[0]).toEqual([
      "--session", "s", "agent", "start", "b-agentic", "--kind", "claude", "--pane", "w4:p1",
      "--timeout", "90000", "--", "--name", "DGS-144: x y",
    ]);
    expect(calls[1]).toEqual([
      "--session", "s", "agent", "start", "b-agentic", "--kind", "claude", "--pane", "w4:p1",
      "--timeout", "120000",
    ]);
  });

  it("agentList parses named agents and skips unnamed ones", () => {
    const json = JSON.stringify({
      result: {
        agents: [
          { name: "b-agentic", pane_id: "w4:p1", workspace_id: "w4" },
          { pane_id: "w5:p1", workspace_id: "w5" },
        ],
      },
    });
    const { run } = scripted(ok(json));
    expect(createHerdr("s", run).agentList()).toEqual([{ name: "b-agentic", pane: "w4:p1", workspace: "w4" }]);
  });

  it("reports herdr's own error text from stdout", () => {
    const { run } = scripted({ status: 1, stdout: '{"error":{"message":"nope"}}', stderr: "" });
    expect(() => createHerdr("s", run).agentList()).toThrow(/herdr agent list failed: .*nope/);
  });

  it("falls back to stderr, then the exit code", () => {
    const { run } = scripted({ status: 1, stdout: "", stderr: "bad" }, { status: 3, stdout: "", stderr: "" });
    const h = createHerdr("s", run);
    expect(() => h.workspaceClose("w1")).toThrow(/herdr workspace close failed: bad/);
    expect(() => h.workspaceClose("w1")).toThrow(/herdr workspace close failed: exit 3/);
  });

  it("reports a spawn error", () => {
    const { run } = scripted({ status: null, stdout: "", stderr: "", error: new Error("spawn herdr ENOENT") });
    expect(() => createHerdr("s", run).workspaceClose("w1")).toThrow(/herdr workspace close failed: spawn herdr ENOENT/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/cli/src/workbox/herdr.test.ts`
Expected: FAIL, "Failed to resolve import ./herdr.ts".

- [ ] **Step 3: Implement `herdr.ts`**

```ts
import { spawnSync } from "node:child_process";

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type HerdrRunner = (args: string[]) => RunResult;

export const spawnHerdr: HerdrRunner = (args) => {
  const r = spawnSync("herdr", args, { encoding: "utf8", timeout: 200_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error };
};

export interface AgentInfo {
  name: string;
  pane: string;
  workspace: string;
}

export interface Herdr {
  workspaceCreate(o: { cwd: string; label: string; account: string }): { workspace: string; pane: string };
  workspaceClose(workspace: string): void;
  paneRun(pane: string, command: string): void;
  paneRead(pane: string): string;
  agentStart(o: { name: string; pane: string; claudeArgs: string[]; timeoutMs?: number }): void;
  agentList(): AgentInfo[];
}

const AGENT_START_TIMEOUT_MS = 120_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createHerdr(session: string, run: HerdrRunner): Herdr {
  const call = (what: string, args: string[]): string => {
    const r = run(["--session", session, ...args]);
    if (r.error) throw new Error(`herdr ${what} failed: ${r.error.message}`);
    if (r.status !== 0) {
      throw new Error(`herdr ${what} failed: ${r.stdout.trim() || r.stderr.trim() || `exit ${r.status}`}`);
    }
    return r.stdout;
  };

  return {
    workspaceCreate({ cwd, label, account }) {
      const out = call("workspace create", [
        "workspace", "create", "--cwd", cwd, "--label", label, "--env", `CLAUDE_ACCOUNT=${account}`, "--no-focus",
      ]);
      const result = (parseJson(out) as { result?: unknown } | undefined)?.result;
      const workspace = isRecord(result) && isRecord(result.workspace) ? result.workspace.workspace_id : undefined;
      const pane = isRecord(result) && isRecord(result.root_pane) ? result.root_pane.pane_id : undefined;
      if (typeof workspace !== "string" || typeof pane !== "string") {
        throw new Error("herdr workspace create returned unexpected output");
      }
      return { workspace, pane };
    },
    workspaceClose(workspace) {
      call("workspace close", ["workspace", "close", workspace]);
    },
    paneRun(pane, command) {
      call("pane run", ["pane", "run", pane, command]);
    },
    paneRead(pane) {
      return call("pane read", ["pane", "read", pane, "--source", "recent-unwrapped", "--lines", "60"]);
    },
    agentStart({ name, pane, claudeArgs, timeoutMs }) {
      call("agent start", [
        "agent", "start", name, "--kind", "claude", "--pane", pane,
        "--timeout", String(timeoutMs ?? AGENT_START_TIMEOUT_MS),
        ...(claudeArgs.length > 0 ? ["--", ...claudeArgs] : []),
      ]);
    },
    agentList() {
      const out = call("agent list", ["agent", "list"]);
      const agents = (parseJson(out) as { result?: { agents?: unknown } } | undefined)?.result?.agents;
      if (!Array.isArray(agents)) throw new Error("herdr agent list returned unexpected output");
      const infos: AgentInfo[] = [];
      for (const a of agents) {
        if (isRecord(a) && typeof a.name === "string" && typeof a.pane_id === "string" && typeof a.workspace_id === "string") {
          infos.push({ name: a.name, pane: a.pane_id, workspace: a.workspace_id });
        }
      }
      return infos;
    },
  };
}
```

- [ ] **Step 4: Implement `deps.ts`**

```ts
import { listAccounts } from "./accounts.ts";
import { createHerdr, spawnHerdr, type Herdr } from "./herdr.ts";
import { defaultRosterPath } from "./roster.ts";

export interface WorkboxDeps {
  herdr: Herdr;
  listAccounts: () => string[];
  rosterFile: string;
  now: () => Date;
  sleep: (ms: number) => void;
  log: (line: string) => void;
}

export function defaultDeps(session: string): WorkboxDeps {
  return {
    herdr: createHerdr(session, spawnHerdr),
    listAccounts: () => listAccounts(),
    rosterFile: defaultRosterPath(),
    now: () => new Date(),
    sleep: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
    log: (line) => console.log(line),
  };
}
```

- [ ] **Step 5: Run the test and the type-check**

Run: `npx vitest run packages/cli/src/workbox/herdr.test.ts && npx tsc -p packages/cli/tsconfig.build.json --noEmit`
Expected: PASS, 8 tests, then no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/workbox/herdr.ts packages/cli/src/workbox/herdr.test.ts packages/cli/src/workbox/deps.ts
git commit -m "feat(workbox): add herdr wrapper and default deps"
```

---

### Task 5: The start command logic

**Files:**
- Create: `packages/cli/src/workbox/start.ts`, `packages/cli/src/workbox/start.test.ts`

**Interfaces:**
- Consumes: `WorkboxDeps` (`./deps.ts`); `AgentInfo`, `Herdr` (`./herdr.ts`); `assertAccountName`, `loadCommand`, `markerPresent` (`./accounts.ts`); `pickAccount`, `exhaustedUntilMs` (`./balancer.ts`); `readRoster`, `updateRoster`, `liveWorkers`, `upsertWorker`, `recordAssignment` (`./roster.ts`); `formatUtc7` (`./time.ts`).
- Produces:
  - `interface StartOptions { agent: string; session: string; claudeArgs: string[]; account?: string; pane?: string; repo?: string; label?: string }`
  - `runStart(deps: WorkboxDeps, opts: StartOptions): void` (throws `Error` with the message to print; the command layer sets the exit code)

Behaviour (from the spec's start flow and Errors table): validate and read everything before the first herdr write; refuse a live pane; pick or validate the account; create a workspace only without `--pane`; type the load command and wait for the whole-line marker; start the agent; write the roster only after the agent is ready; on any failure after a workspace was created, name it and leave it open.

- [ ] **Step 1: Write the failing test**

`packages/cli/src/workbox/start.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkboxDeps } from "./deps.ts";
import type { AgentInfo, Herdr } from "./herdr.ts";
import { emptyRoster, readRoster, recordAssignment, recordExhausted, upsertWorker, writeRoster } from "./roster.ts";
import { runStart, type StartOptions } from "./start.ts";

const NOW = new Date("2026-10-03T08:00:00Z");
const SENTINEL = "SENTINEL-TOKEN-123";

interface EnvOpts {
  agents?: AgentInfo[];
  accounts?: string[] | Error;
  printMarker?: boolean;
  agentStartError?: string;
  execInBash?: boolean;
}

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "start-"));
  file = join(dir, "workbox.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function makeEnv(o: EnvOpts = {}) {
  const order: string[] = [];
  const record: string[] = [];
  const logs: string[] = [];
  const seen = { rosterAtAgentStart: undefined as boolean | undefined, agentStart: undefined as unknown, workspaceCreate: undefined as unknown };
  let lastTyped = "";
  const rec = (name: string, ...args: unknown[]): void => {
    order.push(name);
    record.push(JSON.stringify([name, ...args]));
  };
  const herdr: Herdr = {
    workspaceCreate(a) {
      rec("workspaceCreate", a);
      seen.workspaceCreate = a;
      return { workspace: "w9", pane: "w9:p1" };
    },
    workspaceClose(w) {
      rec("workspaceClose", w);
    },
    paneRun(pane, command) {
      rec("paneRun", pane, command);
      lastTyped = command;
    },
    paneRead() {
      rec("paneRead");
      const echo = `$ ${lastTyped}\n`;
      if (o.execInBash) {
        const r = spawnSync("bash", ["-c", lastTyped], {
          encoding: "utf8",
          env: { PATH: process.env.PATH ?? "", HOME: dir, CLAUDE_ACCOUNTS_DIR: dir },
        });
        return `${echo}${r.stdout}$ `;
      }
      const acct = /CLAUDE_ACCOUNT=([a-z][a-z0-9_-]*)/.exec(lastTyped)?.[1];
      return o.printMarker === false || !acct ? `${echo}$ ` : `${echo}workbox account: ${acct}\n$ `;
    },
    agentStart(a) {
      rec("agentStart", a);
      seen.agentStart = a;
      seen.rosterAtAgentStart = existsSync(file);
      if (o.agentStartError) throw new Error(`herdr agent start failed: ${o.agentStartError}`);
    },
    agentList() {
      rec("agentList");
      return o.agents ?? [];
    },
  };
  const deps: WorkboxDeps = {
    herdr,
    listAccounts: () => {
      if (o.accounts instanceof Error) throw o.accounts;
      return o.accounts ?? ["jack", "dev0"];
    },
    rosterFile: file,
    now: () => NOW,
    sleep: () => {},
    log: (l) => logs.push(l),
  };
  return { deps, order, record, logs, seen };
}

const base: StartOptions = { agent: "b-agentic", session: "DigiSmith", claudeArgs: [], repo: "/r", label: "b: x" };

describe("runStart", () => {
  it("creates the workspace, loads the account, starts the agent, then writes the roster", () => {
    const env = makeEnv();
    runStart(env.deps, { ...base, claudeArgs: ["--name", "DGS-144: x"] });
    expect(env.order).toEqual(["agentList", "workspaceCreate", "paneRun", "paneRead", "agentStart"]);
    expect(env.seen.workspaceCreate).toEqual({ cwd: "/r", label: "b: x", account: "dev0" });
    expect(env.seen.agentStart).toEqual({
      name: "b-agentic", pane: "w9:p1", claudeArgs: ["--name", "DGS-144: x"], timeoutMs: 120_000,
    });
    expect(env.seen.rosterAtAgentStart).toBe(false);
    const roster = readRoster(file);
    expect(roster.workers).toEqual([
      {
        agent: "b-agentic", session: "DigiSmith", workspace: "w9", pane: "w9:p1",
        account: "dev0", assignedAt: NOW.toISOString(), state: "running",
      },
    ]);
    expect(roster.accounts.dev0?.lastAssignedAt).toBe(NOW.toISOString());
    expect(env.logs.join("\n")).toMatch(/started b-agentic on account dev0/);
  });

  it("uses an explicit account", () => {
    const env = makeEnv();
    runStart(env.deps, { ...base, account: "jack" });
    expect(readRoster(file).workers[0]?.account).toBe("jack");
  });

  it("rejects an explicit account that claude-account does not list, before any herdr call", () => {
    const env = makeEnv();
    expect(() => runStart(env.deps, { ...base, account: "ghost" })).toThrow(/unknown account "ghost"/);
    expect(env.order).toEqual([]);
  });

  it("rejects an explicit account that is exhausted", () => {
    const roster = emptyRoster();
    recordExhausted(roster, "jack", "2026-10-03T11:00:00Z");
    writeRoster(file, roster);
    const env = makeEnv();
    expect(() => runStart(env.deps, { ...base, account: "jack" })).toThrow(
      /account "jack" is exhausted until 2026-10-03 18:00 UTC\+7/,
    );
    expect(env.order).toEqual(["agentList"]);
  });

  it("balances by live worker count", () => {
    const roster = emptyRoster();
    for (const agent of ["a", "b"]) {
      upsertWorker(roster, { agent, session: "DigiSmith", workspace: "w1", pane: "w1:p1", account: "dev0", assignedAt: "2026-10-03T07:00:00Z", state: "running" });
    }
    writeRoster(file, roster);
    const env = makeEnv({
      agents: [
        { name: "a", pane: "w1:p1", workspace: "w1" },
        { name: "b", pane: "w2:p1", workspace: "w2" },
      ],
    });
    runStart(env.deps, base);
    expect(readRoster(file).workers.find((w) => w.agent === "b-agentic")?.account).toBe("jack");
  });

  it("does not count a roster worker that herdr no longer lists", () => {
    const roster = emptyRoster();
    for (const agent of ["a", "b"]) {
      upsertWorker(roster, { agent, session: "DigiSmith", workspace: "w1", pane: "w1:p1", account: "dev0", assignedAt: "2026-10-03T07:00:00Z", state: "running" });
    }
    writeRoster(file, roster);
    const env = makeEnv({ agents: [] });
    runStart(env.deps, base);
    expect(readRoster(file).workers.find((w) => w.agent === "b-agentic")?.account).toBe("dev0");
  });

  it("refuses --pane when an agent still runs on that pane", () => {
    const env = makeEnv({ agents: [{ name: "x", pane: "w4:p1", workspace: "w4" }] });
    expect(() => runStart(env.deps, { ...base, pane: "w4:p1" })).toThrow(/pane w4:p1 still runs agent x; \/exit it first/);
    expect(env.order).toEqual(["agentList"]);
    expect(existsSync(file)).toBe(false);
  });

  it("refuses a name that already runs on another pane", () => {
    const env = makeEnv({ agents: [{ name: "b-agentic", pane: "w7:p1", workspace: "w7" }] });
    expect(() => runStart(env.deps, base)).toThrow(/agent b-agentic already runs on pane w7:p1/);
    expect(env.order).toEqual(["agentList"]);
  });

  it("with --pane reuses the slot: no workspace create, workspace taken from the pane id", () => {
    const roster = emptyRoster();
    upsertWorker(roster, { agent: "other", session: "DigiSmith", workspace: "w5", pane: "w5:p1", account: "dev0", assignedAt: "2026-10-03T07:00:00Z", state: "running" });
    recordAssignment(roster, "dev0", "2026-10-03T07:00:00Z");
    writeRoster(file, roster);
    const env = makeEnv({ agents: [{ name: "other", pane: "w5:p1", workspace: "w5" }] });
    runStart(env.deps, { agent: "b-agentic", session: "DigiSmith", pane: "w4:p1", claudeArgs: ["--resume", "abc"] });
    expect(env.order).toEqual(["agentList", "paneRun", "paneRead", "agentStart"]);
    const w = readRoster(file).workers.find((x) => x.agent === "b-agentic");
    expect(w).toMatchObject({ workspace: "w4", pane: "w4:p1", account: "jack" });
    expect(env.seen.agentStart).toMatchObject({ pane: "w4:p1", claudeArgs: ["--resume", "abc"] });
  });

  it("stops before claude starts when the marker never appears, and leaves the workspace open", () => {
    const env = makeEnv({ printMarker: false });
    expect(() => runStart(env.deps, base)).toThrow(
      /account "dev0" did not load in pane w9:p1; its token file may be missing, unreadable or empty[\s\S]*workspace w9 was left open/,
    );
    expect(env.order).not.toContain("agentStart");
    expect(env.order.filter((n) => n === "paneRead")).toHaveLength(20);
    expect(existsSync(file)).toBe(false);
  });

  it("reports an agent start failure with the open workspace and writes no roster", () => {
    const env = makeEnv({ agentStartError: "boom" });
    expect(() => runStart(env.deps, base)).toThrow(/agent start failed: boom[\s\S]*workspace w9 was left open/);
    expect(existsSync(file)).toBe(false);
  });

  it("makes no herdr call when claude-account is unavailable", () => {
    const env = makeEnv({ accounts: new Error("claude-account is not available: ENOENT") });
    expect(() => runStart(env.deps, base)).toThrow(/claude-account is not available/);
    expect(env.order).toEqual([]);
  });

  it("stops before creating a workspace when every account is exhausted", () => {
    const roster = emptyRoster();
    recordExhausted(roster, "jack", "2026-10-03T11:00:00Z");
    recordExhausted(roster, "dev0", "2026-10-03T13:00:00Z");
    writeRoster(file, roster);
    const env = makeEnv();
    expect(() => runStart(env.deps, base)).toThrow(/every account is exhausted/);
    expect(env.order).toEqual(["agentList"]);
  });

  it("stops before creating a workspace when the roster is corrupt", () => {
    writeFileSync(file, "{not json");
    const env = makeEnv();
    expect(() => runStart(env.deps, base)).toThrow(/is corrupt/);
    expect(env.order).toEqual(["agentList"]);
    expect(readFileSync(file, "utf8")).toBe("{not json");
  });

  it("requires --repo and --label without --pane", () => {
    const env = makeEnv();
    expect(() => runStart(env.deps, { agent: "b-agentic", session: "DigiSmith", claudeArgs: [] })).toThrow(
      /--repo and --label are required without --pane/,
    );
    expect(env.order).toEqual([]);
  });

  it("rejects an invalid agent name", () => {
    const env = makeEnv();
    expect(() => runStart(env.deps, { ...base, agent: "Bad Name" })).toThrow(/invalid agent name/);
  });

  it("never lets the token reach a herdr call, a log line or the roster (real bash load)", () => {
    writeFileSync(join(dir, "jack.token"), `${SENTINEL}\n`);
    writeFileSync(join(dir, "dev0.token"), `${SENTINEL}\n`);
    const env = makeEnv({ execInBash: true });
    runStart(env.deps, base);
    const everything = [...env.record, ...env.logs, readFileSync(file, "utf8")].join("\n");
    expect(everything).not.toContain(SENTINEL);
    expect(readRoster(file).workers).toHaveLength(1);
    expect(env.order).toContain("agentStart");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/cli/src/workbox/start.test.ts`
Expected: FAIL, "Failed to resolve import ./start.ts".

- [ ] **Step 3: Implement `start.ts`**

```ts
import { assertAccountName, loadCommand, markerPresent } from "./accounts.ts";
import { exhaustedUntilMs, pickAccount } from "./balancer.ts";
import type { WorkboxDeps } from "./deps.ts";
import { liveWorkers, readRoster, recordAssignment, updateRoster, upsertWorker } from "./roster.ts";
import { formatUtc7 } from "./time.ts";

export interface StartOptions {
  agent: string;
  session: string;
  claudeArgs: string[];
  account?: string;
  pane?: string;
  repo?: string;
  label?: string;
}

const AGENT_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MARKER_POLLS = 20;
const MARKER_POLL_MS = 250;
const AGENT_START_TIMEOUT_MS = 120_000;
const TAIL_LINES = 8;

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function tail(text: string): string {
  return text.split("\n").filter((l) => l.trim() !== "").slice(-TAIL_LINES).join("\n");
}

function waitForMarker(deps: WorkboxDeps, pane: string, account: string): { loaded: boolean; text: string } {
  let text = "";
  for (let i = 0; i < MARKER_POLLS; i++) {
    text = deps.herdr.paneRead(pane);
    if (markerPresent(text, account)) return { loaded: true, text };
    if (i < MARKER_POLLS - 1) deps.sleep(MARKER_POLL_MS);
  }
  return { loaded: false, text };
}

export function runStart(deps: WorkboxDeps, opts: StartOptions): void {
  const { agent, session, claudeArgs } = opts;
  if (!AGENT_NAME.test(agent)) {
    throw new Error(`invalid agent name "${agent}"; use lowercase letters, digits, - or _ (max 64)`);
  }
  if (!opts.pane && (!opts.repo || !opts.label)) {
    throw new Error("--repo and --label are required without --pane");
  }

  const accounts = deps.listAccounts();
  if (opts.account !== undefined) {
    assertAccountName(opts.account);
    if (!accounts.includes(opts.account)) {
      throw new Error(`unknown account "${opts.account}"; claude-account lists: ${accounts.join(", ")}`);
    }
  }

  const agents = deps.herdr.agentList();
  if (opts.pane) {
    const occupant = agents.find((a) => a.pane === opts.pane);
    if (occupant) throw new Error(`pane ${opts.pane} still runs agent ${occupant.name}; /exit it first`);
  }
  const sameName = agents.find((a) => a.name === agent);
  if (sameName) throw new Error(`agent ${agent} already runs on pane ${sameName.pane}; pick another name or /exit it first`);

  const roster = readRoster(deps.rosterFile);
  const now = deps.now();
  let account: string;
  if (opts.account !== undefined) {
    const state = roster.accounts[opts.account];
    if (exhaustedUntilMs(state, now) !== undefined) {
      throw new Error(`account "${opts.account}" is exhausted until ${formatUtc7(state?.exhaustedUntil ?? "")}`);
    }
    account = opts.account;
  } else {
    account = pickAccount({
      accounts,
      workers: liveWorkers(roster, session, agents.map((a) => a.name)),
      accountState: roster.accounts,
      now,
      excludeAgent: agent,
    });
  }

  let workspace: string;
  let pane: string;
  let created = false;
  if (opts.pane) {
    pane = opts.pane;
    workspace = pane.split(":")[0] ?? pane;
  } else {
    ({ workspace, pane } = deps.herdr.workspaceCreate({ cwd: opts.repo ?? "", label: opts.label ?? "", account }));
    created = true;
  }

  try {
    deps.herdr.paneRun(pane, loadCommand(account));
    const { loaded, text } = waitForMarker(deps, pane, account);
    if (!loaded) {
      throw new Error(
        `account "${account}" did not load in pane ${pane}; its token file may be missing, unreadable or empty\n${tail(text)}`,
      );
    }
    deps.herdr.agentStart({ name: agent, pane, claudeArgs, timeoutMs: AGENT_START_TIMEOUT_MS });
  } catch (e) {
    throw created ? new Error(`${messageOf(e)}\nworkspace ${workspace} was left open`) : e;
  }

  const at = deps.now().toISOString();
  updateRoster(
    deps.rosterFile,
    (r) => {
      upsertWorker(r, { agent, session, workspace, pane, account, assignedAt: at, state: "running" });
      recordAssignment(r, account, at);
    },
    { now: deps.now },
  );
  deps.log(`started ${agent} on account ${account} (pane ${pane}, workspace ${workspace})`);
}
```

- [ ] **Step 4: Run the test and the type-check**

Run: `npx vitest run packages/cli/src/workbox/start.test.ts && npx tsc -p packages/cli/tsconfig.build.json --noEmit`
Expected: PASS, 17 tests, then no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/workbox/start.ts packages/cli/src/workbox/start.test.ts
git commit -m "feat(workbox): add start flow with account balancing"
```

---

### Task 6: Stop, exhaust and list

**Files:**
- Create: `packages/cli/src/workbox/stop.ts`, `packages/cli/src/workbox/stop.test.ts`
- Create: `packages/cli/src/workbox/exhaust.ts`, `packages/cli/src/workbox/exhaust.test.ts`
- Create: `packages/cli/src/workbox/list.ts`, `packages/cli/src/workbox/list.test.ts`

**Interfaces:**
- Consumes: `WorkboxDeps` (`./deps.ts`); `Herdr` (`./herdr.ts`); `Roster`, `readRoster`, `updateRoster`, `findWorker`, `markStopped`, `recordExhausted`, `liveWorkers` (`./roster.ts`); `exhaustedUntilMs` (`./balancer.ts`); `assertAccountName` (`./accounts.ts`); `formatUtc7` (`./time.ts`).
- Produces:
  - `runStop(deps: WorkboxDeps, opts: { agent: string; session: string }): void`
  - `runExhaust(deps: WorkboxDeps, opts: { account: string; until: string }): void`
  - `formatList(input: { roster: Roster; session: string; liveAgents: string[]; accounts: string[]; now: Date }): string`
  - `runList(deps: WorkboxDeps, opts: { session: string }): void`

Each test file builds its own small `WorkboxDeps` stub whose herdr methods throw on any call the test does not expect. No shared non-test helper file, because `tsconfig.build.json` would compile it.

- [ ] **Step 1: Write the failing stop test**

`packages/cli/src/workbox/stop.test.ts`:

```ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkboxDeps } from "./deps.ts";
import { emptyRoster, readRoster, recordAssignment, upsertWorker, writeRoster } from "./roster.ts";
import { runStop } from "./stop.ts";

const NOW = new Date("2026-10-03T08:00:00Z");
let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stop-"));
  file = join(dir, "workbox.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function stubDeps(closed: string[], logs: string[], closeError?: string): WorkboxDeps {
  const unexpected = (): never => {
    throw new Error("unexpected herdr call");
  };
  return {
    herdr: {
      workspaceCreate: unexpected,
      workspaceClose: (w) => {
        if (closeError) throw new Error(closeError);
        closed.push(w);
      },
      paneRun: unexpected,
      paneRead: unexpected,
      agentStart: unexpected,
      agentList: unexpected,
    },
    listAccounts: () => ["jack", "dev0"],
    rosterFile: file,
    now: () => NOW,
    sleep: () => {},
    log: (l) => logs.push(l),
  };
}

function seed(state: "running" | "stopped" = "running"): void {
  const roster = emptyRoster();
  upsertWorker(roster, { agent: "b-agentic", session: "DigiSmith", workspace: "w4", pane: "w4:p1", account: "jack", assignedAt: "2026-10-03T07:00:00Z", state });
  recordAssignment(roster, "jack", "2026-10-03T07:00:00Z");
  writeRoster(file, roster);
}

describe("runStop", () => {
  it("closes the workspace, marks the entry stopped and keeps the account marks", () => {
    seed();
    const closed: string[] = [];
    const logs: string[] = [];
    runStop(stubDeps(closed, logs), { agent: "b-agentic", session: "DigiSmith" });
    expect(closed).toEqual(["w4"]);
    const roster = readRoster(file);
    expect(roster.workers).toHaveLength(1);
    expect(roster.workers[0]?.state).toBe("stopped");
    expect(roster.accounts.jack?.lastAssignedAt).toBe("2026-10-03T07:00:00Z");
    expect(logs.join("\n")).toMatch(/stopped b-agentic/);
  });

  it("refuses an agent that is not in the roster, without closing anything", () => {
    const closed: string[] = [];
    expect(() => runStop(stubDeps(closed, []), { agent: "nobody", session: "DigiSmith" })).toThrow(
      /no running worker "nobody" in session DigiSmith/,
    );
    expect(closed).toEqual([]);
    expect(existsSync(file)).toBe(false);
  });

  it("refuses an agent that is already stopped", () => {
    seed("stopped");
    const closed: string[] = [];
    expect(() => runStop(stubDeps(closed, []), { agent: "b-agentic", session: "DigiSmith" })).toThrow(/no running worker/);
    expect(closed).toEqual([]);
  });

  it("leaves the entry running when herdr fails to close the workspace", () => {
    seed();
    expect(() => runStop(stubDeps([], [], "herdr workspace close failed: nope"), { agent: "b-agentic", session: "DigiSmith" })).toThrow(/nope/);
    expect(readRoster(file).workers[0]?.state).toBe("running");
  });
});
```

- [ ] **Step 2: Write the failing exhaust test**

`packages/cli/src/workbox/exhaust.test.ts`:

```ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkboxDeps } from "./deps.ts";
import { runExhaust } from "./exhaust.ts";
import { readRoster } from "./roster.ts";

const NOW = new Date("2026-10-03T08:00:00Z");
let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "exhaust-"));
  file = join(dir, "workbox.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function stubDeps(logs: string[]): WorkboxDeps {
  const unexpected = (): never => {
    throw new Error("unexpected herdr call");
  };
  return {
    herdr: {
      workspaceCreate: unexpected,
      workspaceClose: unexpected,
      paneRun: unexpected,
      paneRead: unexpected,
      agentStart: unexpected,
      agentList: unexpected,
    },
    listAccounts: () => ["jack", "dev0"],
    rosterFile: file,
    now: () => NOW,
    sleep: () => {},
    log: (l) => logs.push(l),
  };
}

describe("runExhaust", () => {
  it("records the time as a normalized ISO string and logs it in UTC+7 first", () => {
    const logs: string[] = [];
    runExhaust(stubDeps(logs), { account: "jack", until: "2026-10-03T21:30:00+07:00" });
    expect(readRoster(file).accounts.jack?.exhaustedUntil).toBe("2026-10-03T14:30:00.000Z");
    expect(logs.join("\n")).toContain("account jack exhausted until 2026-10-03 21:30 UTC+7 [2026-10-03 14:30 UTC]");
  });

  it.each([
    ["no offset", "2026-10-03T21:30:00"],
    ["not a time", "soon"],
    ["a date only", "2026-10-03"],
  ])("rejects --until with %s", (_label, until) => {
    expect(() => runExhaust(stubDeps([]), { account: "jack", until })).toThrow(/--until must be an ISO time with an offset/);
    expect(existsSync(file)).toBe(false);
  });

  it("rejects a time that is not in the future", () => {
    expect(() => runExhaust(stubDeps([]), { account: "jack", until: "2026-10-03T07:00:00Z" })).toThrow(/is not in the future/);
  });

  it("rejects an invalid or unlisted account", () => {
    expect(() => runExhaust(stubDeps([]), { account: "Bad Name", until: "2026-10-03T21:30:00Z" })).toThrow(/invalid account name/);
    expect(() => runExhaust(stubDeps([]), { account: "ghost", until: "2026-10-03T21:30:00Z" })).toThrow(/unknown account "ghost"/);
    expect(existsSync(file)).toBe(false);
  });
});
```

- [ ] **Step 3: Write the failing list test**

`packages/cli/src/workbox/list.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkboxDeps } from "./deps.ts";
import { formatList, runList } from "./list.ts";
import { emptyRoster, recordAssignment, recordExhausted, upsertWorker, writeRoster, type Roster } from "./roster.ts";

const NOW = new Date("2026-10-03T08:00:00Z");

function fixture(): Roster {
  const r = emptyRoster();
  upsertWorker(r, { agent: "b-agentic", session: "DigiSmith", workspace: "w4", pane: "w4:p1", account: "jack", assignedAt: "2026-10-03T08:00:00Z", state: "running" });
  upsertWorker(r, { agent: "old", session: "DigiSmith", workspace: "w5", pane: "w5:p1", account: "dev0", assignedAt: "2026-10-03T07:00:00Z", state: "running" });
  upsertWorker(r, { agent: "done", session: "DigiSmith", workspace: "w6", pane: "w6:p1", account: "jack", assignedAt: "2026-10-03T06:00:00Z", state: "stopped" });
  upsertWorker(r, { agent: "elsewhere", session: "Emma", workspace: "w1", pane: "w1:p1", account: "jack", assignedAt: "2026-10-03T06:00:00Z", state: "running" });
  recordAssignment(r, "jack", "2026-10-03T08:00:00Z");
  recordExhausted(r, "dev0", "2026-10-03T11:00:00Z");
  return r;
}

describe("formatList", () => {
  it("shows workers for the session and per-account load, in UTC+7 first", () => {
    const out = formatList({ roster: fixture(), session: "DigiSmith", liveAgents: ["b-agentic", "done"], accounts: ["jack", "dev0"], now: NOW });
    expect(out.split("\n")).toEqual([
      "Workers (session DigiSmith)",
      "  b-agentic  jack  running  pane w4:p1  assigned 2026-10-03 15:00 UTC+7 [2026-10-03 08:00 UTC]",
      "  old  dev0  gone  pane w5:p1  assigned 2026-10-03 14:00 UTC+7 [2026-10-03 07:00 UTC]",
      "  done  jack  stopped  pane w6:p1  assigned 2026-10-03 13:00 UTC+7 [2026-10-03 06:00 UTC]",
      "Accounts",
      "  jack  1 live worker  last assigned 2026-10-03 15:00 UTC+7 [2026-10-03 08:00 UTC]",
      "  dev0  0 live workers  exhausted until 2026-10-03 18:00 UTC+7 [2026-10-03 11:00 UTC]  never assigned",
    ]);
  });

  it("hides an expired exhausted mark", () => {
    const r = emptyRoster();
    recordExhausted(r, "jack", "2026-10-03T07:00:00Z");
    const out = formatList({ roster: r, session: "DigiSmith", liveAgents: [], accounts: ["jack"], now: NOW });
    expect(out).not.toContain("exhausted");
  });

  it("prints (none) for an empty roster", () => {
    const out = formatList({ roster: emptyRoster(), session: "DigiSmith", liveAgents: [], accounts: ["jack", "dev0"], now: NOW });
    expect(out.split("\n")).toEqual([
      "Workers (session DigiSmith)",
      "  (none)",
      "Accounts",
      "  jack  0 live workers  never assigned",
      "  dev0  0 live workers  never assigned",
    ]);
  });
});

describe("runList", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "list-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the roster and the live agents, and logs the table", () => {
    const file = join(dir, "workbox.json");
    writeRoster(file, fixture());
    const logs: string[] = [];
    const unexpected = (): never => {
      throw new Error("unexpected herdr call");
    };
    const deps: WorkboxDeps = {
      herdr: {
        workspaceCreate: unexpected,
        workspaceClose: unexpected,
        paneRun: unexpected,
        paneRead: unexpected,
        agentStart: unexpected,
        agentList: () => [{ name: "b-agentic", pane: "w4:p1", workspace: "w4" }],
      },
      listAccounts: () => ["jack", "dev0"],
      rosterFile: file,
      now: () => NOW,
      sleep: () => {},
      log: (l) => logs.push(l),
    };
    runList(deps, { session: "DigiSmith" });
    expect(logs.join("\n")).toContain("  b-agentic  jack  running  pane w4:p1");
    expect(logs.join("\n")).toContain("  jack  1 live worker");
  });
});
```

- [ ] **Step 4: Run the three tests to verify they fail**

Run: `npx vitest run packages/cli/src/workbox/stop.test.ts packages/cli/src/workbox/exhaust.test.ts packages/cli/src/workbox/list.test.ts`
Expected: FAIL, "Failed to resolve import" for `./stop.ts`, `./exhaust.ts`, `./list.ts`.

- [ ] **Step 5: Implement `stop.ts`**

```ts
import type { WorkboxDeps } from "./deps.ts";
import { findWorker, markStopped, readRoster, updateRoster } from "./roster.ts";

export function runStop(deps: WorkboxDeps, opts: { agent: string; session: string }): void {
  const { agent, session } = opts;
  const worker = findWorker(readRoster(deps.rosterFile), session, agent);
  if (!worker || worker.state !== "running") {
    throw new Error(`no running worker "${agent}" in session ${session} in the roster`);
  }
  deps.herdr.workspaceClose(worker.workspace);
  updateRoster(deps.rosterFile, (r) => void markStopped(r, session, agent), { now: deps.now });
  deps.log(`stopped ${agent} (workspace ${worker.workspace} closed)`);
}
```

- [ ] **Step 6: Implement `exhaust.ts`**

```ts
import { assertAccountName } from "./accounts.ts";
import type { WorkboxDeps } from "./deps.ts";
import { recordExhausted, updateRoster } from "./roster.ts";
import { formatUtc7 } from "./time.ts";

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function runExhaust(deps: WorkboxDeps, opts: { account: string; until: string }): void {
  const { account, until } = opts;
  assertAccountName(account);
  if (!deps.listAccounts().includes(account)) throw new Error(`unknown account "${account}"`);
  const ms = Date.parse(until);
  if (!ISO_WITH_OFFSET.test(until) || Number.isNaN(ms)) {
    throw new Error(`--until must be an ISO time with an offset, like 2026-10-03T21:30:00+07:00 (got "${until}")`);
  }
  const iso = new Date(ms).toISOString();
  if (ms <= deps.now().getTime()) throw new Error(`--until ${formatUtc7(iso)} is not in the future`);
  updateRoster(deps.rosterFile, (r) => recordExhausted(r, account, iso), { now: deps.now });
  deps.log(`account ${account} exhausted until ${formatUtc7(iso)}`);
}
```

- [ ] **Step 7: Implement `list.ts`**

```ts
import { exhaustedUntilMs } from "./balancer.ts";
import type { WorkboxDeps } from "./deps.ts";
import { liveWorkers, readRoster, type Roster } from "./roster.ts";
import { formatUtc7 } from "./time.ts";

export interface ListInput {
  roster: Roster;
  session: string;
  liveAgents: string[];
  accounts: string[];
  now: Date;
}

export function formatList(input: ListInput): string {
  const { roster, session, liveAgents, accounts, now } = input;
  const live = liveWorkers(roster, session, liveAgents);
  const lines = [`Workers (session ${session})`];
  const mine = roster.workers.filter((w) => w.session === session);
  if (mine.length === 0) lines.push("  (none)");
  for (const w of mine) {
    const status = w.state === "stopped" ? "stopped" : live.includes(w) ? "running" : "gone";
    lines.push(`  ${w.agent}  ${w.account}  ${status}  pane ${w.pane}  assigned ${formatUtc7(w.assignedAt)}`);
  }
  lines.push("Accounts");
  for (const name of accounts) {
    const state = roster.accounts[name];
    const count = live.filter((w) => w.account === name).length;
    const parts = [`  ${name}`, `${count} live ${count === 1 ? "worker" : "workers"}`];
    if (exhaustedUntilMs(state, now) !== undefined) parts.push(`exhausted until ${formatUtc7(state?.exhaustedUntil ?? "")}`);
    parts.push(state?.lastAssignedAt ? `last assigned ${formatUtc7(state.lastAssignedAt)}` : "never assigned");
    lines.push(parts.join("  "));
  }
  return lines.join("\n");
}

export function runList(deps: WorkboxDeps, opts: { session: string }): void {
  const roster = readRoster(deps.rosterFile);
  const liveAgents = deps.herdr.agentList().map((a) => a.name);
  deps.log(formatList({ roster, session: opts.session, liveAgents, accounts: deps.listAccounts(), now: deps.now() }));
}
```

- [ ] **Step 8: Run the three tests and the type-check**

Run: `npx vitest run packages/cli/src/workbox/stop.test.ts packages/cli/src/workbox/exhaust.test.ts packages/cli/src/workbox/list.test.ts && npx tsc -p packages/cli/tsconfig.build.json --noEmit`
Expected: PASS (4 + 6 + 4 tests), then no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/workbox/stop.ts packages/cli/src/workbox/stop.test.ts packages/cli/src/workbox/exhaust.ts packages/cli/src/workbox/exhaust.test.ts packages/cli/src/workbox/list.ts packages/cli/src/workbox/list.test.ts
git commit -m "feat(workbox): add stop, exhaust and list commands"
```

---

### Task 7: Command wiring, README and runbook patch

**Files:**
- Create: `packages/cli/src/workbox/index.ts`, `packages/cli/src/workbox/index.test.ts`
- Modify: `packages/cli/src/index.ts` (import and register the group)
- Modify: `packages/cli/src/index.test.ts` (the "registers both domains" test)
- Modify: `packages/cli/README.md` (command list and a short paragraph)
- Create: `.digismith/docs/B/B.2/subscription-load-balancer/runbook-patch.md`

**Interfaces:**
- Consumes: `defaultDeps`, `WorkboxDeps` (`./deps.ts`); `runStart` (`./start.ts`); `runList` (`./list.ts`); `runStop` (`./stop.ts`); `runExhaust` (`./exhaust.ts`).
- Produces:
  - `type DepsFactory = (session: string) => WorkboxDeps`
  - `createWorkboxCommand(depsFactory?: DepsFactory): CommandModule` (default factory is `defaultDeps`)
  - default export `workboxCommand: CommandModule`

Command surface (all four print `workbox <cmd>: <message>` on error and set exit code 1):

| Command | Options |
|---|---|
| `workbox start <agent>` | `--repo <path>`, `--label <text>` (both required without `--pane`), `--account <name>`, `--pane <id>`, `--session <name>` (default `DigiSmith`), then `-- <claude args>` |
| `workbox list` | `--session <name>` |
| `workbox stop <agent>` | `--session <name>` |
| `workbox exhaust <account>` | `--until <ISO time with offset>` (required) |

`start` reads the raw `--` arguments. yargs would turn `-5`, `1e3` or `00123` into numbers, so the builder sets `"parse-positional-numbers": false` (verified: with `populate--` alone, or with `parse-numbers: false`, numbers still leak through).

- [ ] **Step 1: Write the failing command test**

`packages/cli/src/workbox/index.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import type { WorkboxDeps } from "./deps.ts";
import { createWorkboxCommand, type DepsFactory } from "./index.ts";

interface Call {
  fn: string;
  arg: unknown;
}

let dir: string;
let calls: Call[];
let sessions: string[];
let logs: string[];

function factory(): DepsFactory {
  return (session) => {
    sessions.push(session);
    const deps: WorkboxDeps = {
      herdr: {
        workspaceCreate: (o) => {
          calls.push({ fn: "workspaceCreate", arg: o });
          return { workspace: "w9", pane: "w9:p1" };
        },
        workspaceClose: (w) => void calls.push({ fn: "workspaceClose", arg: w }),
        paneRun: (pane, command) => void calls.push({ fn: "paneRun", arg: { pane, command } }),
        paneRead: () => "workbox account: jack\n",
        agentStart: (o) => void calls.push({ fn: "agentStart", arg: o }),
        agentList: () => [],
      },
      listAccounts: () => ["jack"],
      rosterFile: join(dir, "workbox.json"),
      now: () => new Date("2026-10-03T08:00:00Z"),
      sleep: () => {},
      log: (line) => void logs.push(line),
    };
    return deps;
  };
}

async function run(argv: string[]): Promise<void> {
  await yargs(argv).scriptName("t").command(createWorkboxCommand(factory())).demandCommand(1, "").strict().parseAsync();
}

function agentStartArg(): { name: string; pane: string; claudeArgs: string[] } {
  const call = calls.find((c) => c.fn === "agentStart");
  if (!call) throw new Error("agentStart was not called");
  return call.arg as { name: string; pane: string; claudeArgs: string[] };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "workbox-cmd-"));
  calls = [];
  sessions = [];
  logs = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  rmSync(dir, { recursive: true, force: true });
});

describe("workbox start", () => {
  it("passes the arguments after -- through as raw strings", async () => {
    await run([
      "workbox", "start", "b-agentic", "--pane", "w4:p1", "--",
      "--name", "DGS-144: load balancer", "--resume", "00123", "--effort", "-5", "--budget", "1e3",
    ]);
    expect(process.exitCode).toBe(0);
    expect(agentStartArg().claudeArgs).toEqual([
      "--name", "DGS-144: load balancer", "--resume", "00123", "--effort", "-5", "--budget", "1e3",
    ]);
    expect(agentStartArg().pane).toBe("w4:p1");
  });

  it("starts with no claude args when there is no --", async () => {
    await run(["workbox", "start", "b-agentic", "--pane", "w4:p1"]);
    expect(agentStartArg().claudeArgs).toEqual([]);
  });

  it("defaults the session to DigiSmith and honours --session", async () => {
    await run(["workbox", "start", "b-agentic", "--pane", "w4:p1"]);
    await run(["workbox", "start", "emma-agent", "--pane", "w5:p1", "--session", "emma"]);
    expect(sessions).toEqual(["DigiSmith", "emma"]);
  });

  it("resolves --repo to an absolute path when it creates a workspace", async () => {
    await run(["workbox", "start", "b-agentic", "--repo", ".", "--label", "B: test"]);
    const create = calls.find((c) => c.fn === "workspaceCreate");
    expect((create?.arg as { cwd: string }).cwd).toBe(resolve("."));
  });

  it("prints the error and sets exit code 1", async () => {
    await run(["workbox", "start", "b-agentic"]);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith("workbox start: --repo and --label are required without --pane");
    expect(calls).toEqual([]);
  });
});

describe("workbox list, stop and exhaust", () => {
  it("list prints the Workers and Accounts text and exits 0", async () => {
    await run(["workbox", "list"]);
    expect(process.exitCode).toBe(0);
    expect(logs.join("\n")).toMatch(/Workers/);
    expect(logs.join("\n")).toMatch(/Accounts/);
  });

  it("stop of an unknown worker exits 1 with the message", async () => {
    await run(["workbox", "stop", "ghost"]);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^workbox stop: no running worker "ghost"/));
  });

  it("exhaust records the account and exits 0", async () => {
    await run(["workbox", "exhaust", "jack", "--until", "2026-10-03T21:30:00+07:00"]);
    expect(process.exitCode).toBe(0);
    expect(logs[0]).toMatch(/^account jack exhausted until 2026-10-03 21:30 UTC\+7/);
  });

  it("exhaust without --until is a usage error", async () => {
    await expect(run(["workbox", "exhaust", "jack"])).rejects.toThrow(/process\.exit/);
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/cli/src/workbox/index.test.ts`
Expected: FAIL, "Failed to resolve import ./index.ts".

- [ ] **Step 3: Implement `index.ts`**

`packages/cli/src/workbox/index.ts`:

```ts
import * as path from "node:path";
import type { ArgumentsCamelCase, CommandModule } from "yargs";
import { defaultDeps, type WorkboxDeps } from "./deps.ts";
import { runExhaust } from "./exhaust.ts";
import { runList } from "./list.ts";
import { runStart } from "./start.ts";
import { runStop } from "./stop.ts";

export type DepsFactory = (session: string) => WorkboxDeps;

const DEFAULT_SESSION = "DigiSmith";

function guarded(name: string, fn: () => void): void {
  try {
    fn();
    process.exitCode = 0;
  } catch (err) {
    console.error(`workbox ${name}: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

const sessionOption = {
  type: "string",
  default: DEFAULT_SESSION,
  describe: "herdr session the worker lives in",
} as const;

function startCommand(depsFactory: DepsFactory): CommandModule {
  return {
    command: "start <agent>",
    describe: "start a worker on the least-loaded Claude account (claude args go after --)",
    builder: (y) =>
      y
        .parserConfiguration({ "populate--": true, "parse-positional-numbers": false })
        .positional("agent", { type: "string", demandOption: true, describe: "herdr agent name" })
        .option("repo", { type: "string", describe: "working directory of a new workspace" })
        .option("label", { type: "string", describe: "label of a new workspace" })
        .option("account", { type: "string", describe: "use this account instead of the balancer's pick" })
        .option("pane", { type: "string", describe: "re-seat an existing, empty pane instead of creating a workspace" })
        .option("session", sessionOption),
    handler: (argv) =>
      guarded("start", () => {
        const a = argv as ArgumentsCamelCase<{
          agent: string;
          session: string;
          repo?: string;
          label?: string;
          account?: string;
          pane?: string;
        }> & { "--"?: unknown[] };
        runStart(depsFactory(a.session), {
          agent: a.agent,
          session: a.session,
          claudeArgs: (a["--"] ?? []).map(String),
          account: a.account,
          pane: a.pane,
          repo: a.repo === undefined ? undefined : path.resolve(a.repo),
          label: a.label,
        });
      }),
  };
}

function listCommand(depsFactory: DepsFactory): CommandModule {
  return {
    command: "list",
    describe: "show the workers and each account's load",
    builder: (y) => y.option("session", sessionOption),
    handler: (argv) =>
      guarded("list", () => {
        const session = argv.session as string;
        runList(depsFactory(session), { session });
      }),
  };
}

function stopCommand(depsFactory: DepsFactory): CommandModule {
  return {
    command: "stop <agent>",
    describe: "close a worker's workspace and mark it stopped",
    builder: (y) =>
      y
        .positional("agent", { type: "string", demandOption: true, describe: "herdr agent name" })
        .option("session", sessionOption),
    handler: (argv) =>
      guarded("stop", () => {
        const session = argv.session as string;
        runStop(depsFactory(session), { agent: argv.agent as string, session });
      }),
  };
}

function exhaustCommand(depsFactory: DepsFactory): CommandModule {
  return {
    command: "exhaust <account>",
    describe: "mark an account out of quota until a time, so start skips it",
    builder: (y) =>
      y
        .positional("account", { type: "string", demandOption: true, describe: "claude-account name" })
        .option("until", {
          type: "string",
          demandOption: true,
          describe: "ISO time with an offset, like 2026-10-03T21:30:00+07:00",
        }),
    handler: (argv) =>
      guarded("exhaust", () => {
        runExhaust(depsFactory(DEFAULT_SESSION), { account: argv.account as string, until: argv.until as string });
      }),
  };
}

export function createWorkboxCommand(depsFactory: DepsFactory = defaultDeps): CommandModule {
  return {
    command: "workbox",
    describe: "start herdr workers on the least-loaded Claude subscription account",
    builder: (y) =>
      y
        .command(startCommand(depsFactory))
        .command(listCommand(depsFactory))
        .command(stopCommand(depsFactory))
        .command(exhaustCommand(depsFactory))
        .demandCommand(1, ""),
    handler: () => {},
  };
}

const workboxCommand = createWorkboxCommand();

export default workboxCommand;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/cli/src/workbox/index.test.ts`
Expected: PASS, 9 tests. The last test relies on vitest turning yargs' `process.exit(1)` into a thrown error (checked on yargs 17.7.3); yargs' usage text goes to the mocked `console.error`. If a `--` test shows numbers instead of strings, the `parserConfiguration` call in `startCommand` is missing or misspelled.

- [ ] **Step 5: Register the group and update the existing test**

In `packages/cli/src/index.ts`, add the import after the clickup import:

```ts
import workboxCommand from "./workbox/index.ts";
```

and register it in `buildCli`:

```ts
    .command(vpsCommand)
    .command(depotCommand)
    .command(clickupCommand)
    .command(workboxCommand)
```

In `packages/cli/src/index.test.ts`, change the first test to:

```ts
  it("registers every domain", async () => {
    const help = await buildCli([]).getHelp();
    expect(help).toMatch(/vps/);
    expect(help).toMatch(/depot/);
    expect(help).toMatch(/workbox/);
  });
```

- [ ] **Step 5b: Check the real CLI help**

Run: `node --experimental-strip-types packages/cli/src/index.ts workbox start --help`
Expected: usage for `workbox start <agent>` with the options `--repo`, `--label`, `--account`, `--pane`, `--session`, and exit 0. It must not call herdr.

- [ ] **Step 6: Document the commands in the README**

In `packages/cli/README.md`, add this block inside the Commands code fence, after the `clickup` lines and before `digismith --version`:

```
digismith workbox start <agent> --repo <path> --label <text> [--account <name>] [-- <claude args>]
digismith workbox start <agent> --pane <id> [--account <name>] [-- <claude args>]
digismith workbox list [--session <name>]                          # workers, and each account's load
digismith workbox stop <agent> [--session <name>]                  # close the worker's workspace
digismith workbox exhaust <account> --until <ISO time with offset> # skip the account until then
```

Then add this section after the `clickup` prose (the last prose section before any license or footer text):

```markdown
`workbox` starts [herdr](https://herdr.dev) workers on the least-loaded Claude subscription account and
records each assignment in `~/.digismith-depot/workbox.json`. `start` picks the account with the fewest live
workers (never one marked exhausted, ties go to the one assigned longest ago) and loads that account's token
inside the pane itself, so no token passes through the command line, the log or the caller. The accounts come
from `claude-account list`. `--session` defaults to `DigiSmith`; load is counted per herdr session.
`start --pane <id>` re-seats a worker in an empty pane (it refuses a pane that still runs an agent). Put the
arguments for `claude` after `--`, for example `-- --name "B.2: DGS-144 load balancer"`.
`exhaust <account> --until <time>` records that an account hit its limit; `list` shows times as UTC+7 with UTC in brackets.
```

- [ ] **Step 7: Write the runbook patch**

The Workbox runbook (`.digismith/sessions/workbox.md`) is git-excluded and untracked, so this branch cannot edit it. Ship the edits as a tracked file for the maestro to apply.

`.digismith/docs/B/B.2/subscription-load-balancer/runbook-patch.md`:

````markdown
# Workbox runbook patch (DGS-144)

The maestro applies these edits to `.digismith/sessions/workbox.md` after DGS-144 merges. That runbook is
untracked, so the branch cannot change it. `dg workbox` below means
`node /root/Workspace/Jazurite/DigiSmith/packages/cli/src/index.ts workbox` from a checkout
(`dg workbox` once `@digismith/cli` is installed globally).

## 1. "Switch lineage or ticket": replace steps 3 and 4

Old step 2 (`/exit` the worker) stays. Replace old steps 3 and 4 with one step:

3. Start the next worker on the least-loaded account in the same pane (a new session, no `--resume`: the note
   carries the context):
   `dg workbox start <agent> --pane <pane> -- --name "<key>: <ticket key> <short name>"`
   The command loads the account's token in the pane itself, checks the load marker, starts the worker and
   records the account in `~/.digismith-depot/workbox.json`. It refuses a pane that still runs an agent, so
   `/exit` first. Add `--account <name>` to force an account. `claude-account next` is no longer part of a
   handoff: it changed the VPS-wide active account, which `dg workbox start` does not touch.

Renumber the later steps (old 5 to 7 become 4 to 6).

## 2. "Move a worker to another account mid-session": replace the steps

1. Record the session ID: `herdr --session DigiSmith agent get <agent>` (`agent_session.value`).
2. Mark the account that hit its limit: `dg workbox exhaust <account> --until <ISO time with offset>`
   (the time from the limit message, for example `2026-10-03T21:30:00+07:00`).
3. `herdr --session DigiSmith agent send-keys <agent> esc`, then `herdr --session DigiSmith agent prompt <agent> "/exit"`.
4. `dg workbox start <agent> --pane <pane> -- --resume <session id>` (the balancer skips the exhausted account).
5. Tell the worker it was restarted and what to redo: a subagent that was running at the limit is lost.
   The first turn on the new account re-reads the whole conversation.

## 3. Roster table: replace the "Account" bookkeeping

The roster of record for accounts is `~/.digismith-depot/workbox.json`. Read it with `dg workbox list`, which shows
each worker's account and each account's load and exhaustion time (UTC+7 first). Drop the "update the table with the
worker's account" step; keep the table for agent names, panes and lineages.

## 4. New section: "dg workbox"

- `dg workbox start <agent> --repo <path> --label <text>` creates a workspace with `CLAUDE_ACCOUNT=<name>` set.
- `dg workbox start <agent> --pane <pane>` re-seats a worker in an existing pane.
- `dg workbox list`, `dg workbox stop <agent>`, `dg workbox exhaust <account> --until <time>`.
- Load is counted per herdr session (`--session`, default `DigiSmith`). A worker in the `emma` session does not count
  toward `DigiSmith` load (v1 limit).
- Never print, read or commit a token. The command never opens `~/.config/claude-accounts/`; only the pane shell does.
````

- [ ] **Step 8: Run the full CLI suite and the type-check**

Run: `npx vitest run packages/cli && npx tsc -p packages/cli/tsconfig.build.json --noEmit`
Expected: all tests PASS (the new workbox tests plus the existing vps, depot, clickup and index tests), no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/workbox/index.ts packages/cli/src/workbox/index.test.ts packages/cli/src/index.ts packages/cli/src/index.test.ts packages/cli/README.md .digismith/docs/B/B.2/subscription-load-balancer/runbook-patch.md
git commit -m "feat(workbox): wire workbox commands into the dg CLI"
```

---

## Self-Review

**Spec coverage.**

| Spec requirement | Task |
|---|---|
| v1 balancer: skip exhausted, fewest live workers, oldest assignment, name order, `excludeAgent` | 1 |
| UTC+7 times with UTC in brackets | 1, 6 |
| Roster file v1, atomic write, advisory lock, corrupt or unknown version never overwritten, key `(session, agent)`, account state survives `stop` | 2 |
| Name validation, `claude-account list` parsing, pane-side token load, whole-line marker, no token in code or logs | 3 |
| herdr argument-array wrapper, `--env CLAUDE_ACCOUNT`, `--no-focus`, 120 s agent timeout | 4 |
| `start`: explicit or balanced account, `--pane` re-seat, live-pane refusal, duplicate-agent refusal, marker poll, workspace left-open note, roster upsert plus assignment | 5 |
| `stop`, `exhaust`, `list` | 6 |
| CLI group, `--` passthrough as raw strings, default session, exit codes | 7 |
| README, runbook edits | 7 |
| Live proof (first handoff with `dg workbox start --pane`), ClickUp status | Not in the plan: the maestro owns both |

**Placeholder scan.** No "TBD" or "similar to Task N". Every code step carries code. The one hand-off, the runbook edit, is an explicit tracked patch file.

**Type consistency.** `WorkboxDeps` (Task 4) is the only deps type; Tasks 5, 6 and 7 consume it unchanged. `StartOptions.claudeArgs: string[]` (Task 5) matches `(a["--"] ?? []).map(String)` (Task 7). `runExhaust` takes `{ account, until }` and `runStop` takes `{ agent, session }`, as Task 6 defines them. `markerPresent`/`loadCommand` (Task 3) are used by Task 5 under the same names. `findWorker`, `markStopped`, `recordAssignment`, `recordExhausted`, `upsertWorker`, `readRoster`, `updateRoster` (Task 2) keep their signatures in Tasks 5 and 6. `DepsFactory` is exported from Task 7's `index.ts` and imported only by its own test.

**Known v1 limits (to flag at review).** Load is counted per herdr session. The runbook edit ships as a patch file. The stale-lock takeover is best effort. A herdr agent that dies without `dg workbox stop` stays `running` in the roster file, but it stops counting as load as soon as `herdr agent list` no longer shows it.

---

## Execution handoff

Execution approach: `digismith:subagent-driven-development`. The plan has 7 tasks, and two of them are risky enough to want an independent reviewer: Task 2 (a lock and atomic write on shared state) and Task 3 (token handling in shell text). Each task gets a fresh implementer and a task review, then Sol reviews the whole branch before the push.
