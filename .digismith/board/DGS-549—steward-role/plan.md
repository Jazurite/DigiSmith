# Steward Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `dg steward`: an event engine that knows the whole DGS-488 status map and moves ClickUp tickets by event, plus a command that files and types new ideas.

**Architecture:** A new command family `packages/cli/src/steward/`. A pure rule table (`rules.ts`) turns (event, ticket view, config) into one result. A state store keeps one JSON file per open ticket in the depot. A `Tracker` interface hides ClickUp (`clickup-tracker.ts` implements it over the existing `@digismith/clickup-client`). `event.ts` ties them together and reads back every write. `file.ts` makes one small-model call to pick the list, type and duplicate. No skill, hook or runbook is edited (that is DGS-551).

**Tech Stack:** TypeScript on Node 24 (run with `--experimental-strip-types`, so no enums and no constructor parameter properties; imports use the `.ts` extension), yargs, Vitest, `@digismith/clickup-client`. pnpm only, never npm.

## Global Constraints

Copied from the approved spec (`design.html`) and the brief:

- Statuses of the space: `backlog, concept, discovery, refinement, to do, in progress, review, acceptance, release, done, documented, discarded, Closed`. Status names are lower case except `Closed`.
- Events: `filed, concept-started, discovery-started, refinement-started, approved, started, review-started, merged, verified, accepted, release-started, released, documented, discard, close`.
- The two gates are `refinement` to `to do` and the `acceptance` status. Only `approved` and `accepted` cross them, and both are refused without a non-empty `--quote`. `discard` and `close` also need `--quote`.
- Done rules by Sign-off mark. `Auto`: `done` at `merged`. `Jack`: `acceptance` at `merged`, then only `accepted yes`; `verified` is refused. Unmarked: stays in `review` until `verified`. The mark is the ClickUp drop-down field named `Sign-off` (values `Auto`, `Jack`). The Steward only reads it.
- `release_stage` profile flag, default `false`. Off: Auto at `merged` and `accepted yes` go straight to `done`. On: they go to `release`, and `released` moves to `done`.
- Dates are date-only, UTC+7. Start date is set once, at `started`, only if empty. Due date is set at every move into `done`.
- A non-zero exit means a usage error only (exit code 2). Tracker and state failures print one line to stderr and exit 0. `tracker: none` (the default) ends silently with exit 0.
- State file: `~/.digismith-depot/steward/<KEY>.json`. In version 1 the file is never removed (the check for Hallmark DGS-545 and analytics DGS-220 returns false).
- ClickUp writes go through `@digismith/clickup-client` calls that `dg clickup` already uses. No one-off script.
- No skill, hook or runbook changes. No audit, no session ties, no JIRA, no email to Jack.
- Commits: title-only conventional messages, no Co-Authored-By line, no AI attribution. No push.

## Deviation from the spec (for the checkpoint 2 reviewer)

The spec said a lock timeout puts the event into `pending` of the next call. That cannot work without the lock. This plan does this instead: after 5 seconds without the lock, the call prints a warning and applies nothing. Events are idempotent, so the caller (DGS-551) can send it again.

## File Structure

All under `packages/cli/src/steward/` unless noted.

| File | Responsibility |
|---|---|
| `types.ts` | Status and event names, `Signoff`, `Config`, `TicketView`, `RuleResult`, `EventInput`, gate list |
| `rules.ts` | `evaluate(input, view, cfg)`: the pure rule table |
| `state.ts` | State type, `readState`, `writeState`, `withLock`, `rebuildState`, `stewardDir` |
| `profile.ts` | `readStewardProfile(cwd, env)`: `tracker` and `release_stage` from the profile |
| `tracker.ts` | `Tracker` interface and its data types |
| `clickup-tracker.ts` | `ClickUpTracker implements Tracker` |
| `fake-tracker.test-util.ts` | `FakeTracker` for tests |
| `event.ts` | `runEvent(deps, ticket, input, dryRun)` |
| `file.ts` | `fileIdea(deps, idea, opts)`, `buildPrompt`, `parsePick` |
| `model.ts` | `claudeRunner()`: the one model call |
| `index.ts` | The `steward` yargs command with `event`, `file`, `rebuild` |
| `README.md` | What the command does, the event table |
| `packages/cli/src/index.ts` | Register `stewardCommand` (modify) |
| `packages/clickup-client/src/client.ts` | Add `searchTeamTasks` (modify, Task 5) |
| `packages/cli/src/clickup/time-in-status.ts` | New `dg clickup time-in-status` (Task 6, own ticket) |
| `profiles/digismith.yml` | Add `tracker: clickup`, `release_stage: false` (modify) |

Run tests from the worktree root: `pnpm vitest run <path>`.

---

### Task 1: Types and the rule table

**Files:**
- Create: `packages/cli/src/steward/types.ts`
- Create: `packages/cli/src/steward/rules.ts`
- Test: `packages/cli/src/steward/rules.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact):
  - `STATUSES`, `type Status`, `EVENTS`, `type EventName`, `GATE_EVENTS: readonly EventName[]`, `type Signoff = "Auto" | "Jack" | null`
  - `interface Config { releaseStage: boolean }`
  - `interface TicketView { status: string; signoff: Signoff; mergedRecorded: boolean; acceptedYes: boolean }`
  - `interface EventInput { event: EventName; answer?: "yes" | "no"; quote?: string; by?: string; sha?: string }`
  - `interface Move { kind: "move"; to: Status; startDate?: boolean; dueDate?: boolean; recordMerge?: boolean; comment?: string }`
  - `type RuleResult = Move | { kind: "record"; recordMerge: true } | { kind: "noop" } | { kind: "refuse"; reason: string }`
  - `evaluate(input: EventInput, view: TicketView, cfg: Config): RuleResult`

- [ ] **Step 1: Write `types.ts`**

```ts
export const STATUSES = [
  "backlog", "concept", "discovery", "refinement", "to do", "in progress", "review",
  "acceptance", "release", "done", "documented", "discarded", "Closed",
] as const;
export type Status = (typeof STATUSES)[number];

export const EVENTS = [
  "filed", "concept-started", "discovery-started", "refinement-started", "approved", "started",
  "review-started", "merged", "verified", "accepted", "release-started", "released", "documented",
  "discard", "close",
] as const;
export type EventName = (typeof EVENTS)[number];

/** Events that carry Jack's own answer: refused without --quote. */
export const GATE_EVENTS: readonly EventName[] = ["approved", "accepted", "discard", "close"];

/** Statuses a ticket has left for good: discard and close do not apply to them. */
export const FINISHED: readonly string[] = ["done", "documented", "discarded", "Closed"];

export type Signoff = "Auto" | "Jack" | null;

export interface Config {
  releaseStage: boolean;
}

export interface TicketView {
  status: string;
  signoff: Signoff;
  mergedRecorded: boolean;
  acceptedYes: boolean;
}

export interface EventInput {
  event: EventName;
  answer?: "yes" | "no";
  quote?: string;
  by?: string;
  sha?: string;
}

export interface Move {
  kind: "move";
  to: Status;
  startDate?: boolean;
  dueDate?: boolean;
  recordMerge?: boolean;
  comment?: string;
}

export type RuleResult =
  | Move
  | { kind: "record"; recordMerge: true }
  | { kind: "noop" }
  | { kind: "refuse"; reason: string };
```

- [ ] **Step 2: Write the failing tests `rules.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { evaluate } from "./rules.ts";
import { EVENTS, GATE_EVENTS, STATUSES, FINISHED } from "./types.ts";
import type { Config, EventInput, EventName, RuleResult, Signoff, TicketView } from "./types.ts";

const OFF: Config = { releaseStage: false };
const ON: Config = { releaseStage: true };
const view = (status: string, extra: Partial<TicketView> = {}): TicketView => ({
  status, signoff: null, mergedRecorded: false, acceptedYes: false, ...extra,
});
const ev = (event: EventName, extra: Partial<EventInput> = {}): EventInput => ({ event, ...extra });
const Q = { quote: "yes, go" };
const to = (r: RuleResult) => (r.kind === "move" ? r.to : r.kind);

describe("entry events, one per status", () => {
  const rows: [EventInput, TicketView, string][] = [
    [ev("concept-started"), view("backlog"), "concept"],
    [ev("discovery-started"), view("concept"), "discovery"],
    [ev("refinement-started"), view("concept"), "refinement"],
    [ev("refinement-started"), view("discovery"), "refinement"],
    [ev("approved", Q), view("refinement"), "to do"],
    [ev("started"), view("to do"), "in progress"],
    [ev("review-started"), view("in progress"), "review"],
    [ev("merged"), view("review", { signoff: "Jack" }), "acceptance"],
    [ev("merged"), view("review", { signoff: "Auto" }), "done"],
    [ev("verified"), view("review", { mergedRecorded: true }), "done"],
    [ev("release-started"), view("review", { signoff: "Auto", mergedRecorded: true }), "release"],
    [ev("released"), view("release"), "done"],
    [ev("documented"), view("done"), "documented"],
    [ev("discard", Q), view("backlog"), "discarded"],
    [ev("close", Q), view("in progress"), "Closed"],
  ];
  it.each(rows)("%j from %j gives %s", (input, v, expected) => {
    expect(to(evaluate(input, v, OFF))).toBe(expected);
  });
  it("every status except backlog is the target of some row; backlog is made by filed", () => {
    const targets = new Set(rows.map((r) => r[2]));
    for (const s of STATUSES) if (s !== "backlog") expect(targets.has(s)).toBe(true);
    expect(to(evaluate(ev("filed"), view("backlog"), OFF))).toBe("refuse");
  });
});

describe("dates", () => {
  it("started sets the start date, done sets the due date", () => {
    expect(evaluate(ev("started"), view("to do"), OFF)).toMatchObject({ startDate: true });
    expect(evaluate(ev("released"), view("release"), OFF)).toMatchObject({ dueDate: true });
    expect(evaluate(ev("merged"), view("review", { signoff: "Auto" }), OFF)).toMatchObject({ dueDate: true, recordMerge: true });
  });
});

describe("merged by Sign-off mark", () => {
  it("Auto goes to release when the release stage is on", () => {
    expect(to(evaluate(ev("merged"), view("review", { signoff: "Auto" }), ON))).toBe("release");
  });
  it("unmarked records the merge and does not move", () => {
    expect(evaluate(ev("merged", { sha: "abc" }), view("review"), OFF)).toEqual({ kind: "record", recordMerge: true });
  });
  it("is refused from in progress", () => {
    expect(to(evaluate(ev("merged"), view("in progress", { signoff: "Auto" }), OFF))).toBe("refuse");
  });
  it("is a no-op when the merge is already recorded and the ticket moved on", () => {
    expect(evaluate(ev("merged"), view("done", { signoff: "Auto", mergedRecorded: true }), OFF)).toEqual({ kind: "noop" });
    expect(evaluate(ev("merged"), view("review", { mergedRecorded: true }), OFF)).toEqual({ kind: "noop" });
  });
});

describe("verified", () => {
  it("is refused for Jack tickets, Auto tickets, and before a merge", () => {
    expect(to(evaluate(ev("verified"), view("review", { signoff: "Jack", mergedRecorded: true }), OFF))).toBe("refuse");
    expect(to(evaluate(ev("verified"), view("review", { signoff: "Auto", mergedRecorded: true }), OFF))).toBe("refuse");
    expect(to(evaluate(ev("verified"), view("review"), OFF))).toBe("refuse");
  });
  it("is refused in acceptance", () => {
    expect(to(evaluate(ev("verified"), view("acceptance", { signoff: "Jack", mergedRecorded: true }), OFF))).toBe("refuse");
  });
});

describe("accepted", () => {
  const a = (answer: "yes" | "no", cfg: Config, v = view("acceptance", { signoff: "Jack", mergedRecorded: true })) =>
    evaluate(ev("accepted", { answer, ...Q }), v, cfg);
  it("yes goes to done, or to release when the stage is on", () => {
    expect(to(a("yes", OFF))).toBe("done");
    expect(to(a("yes", ON))).toBe("release");
  });
  it("no returns to refinement with Jack's words as a comment", () => {
    expect(a("no", OFF)).toMatchObject({ kind: "move", to: "refinement", comment: expect.stringContaining("yes, go") });
  });
  it("needs an answer, and is refused outside acceptance", () => {
    expect(to(evaluate(ev("accepted", Q), view("acceptance"), OFF))).toBe("refuse");
    expect(to(a("yes", OFF, view("review")))).toBe("refuse");
  });
});

describe("release-started", () => {
  it("is valid from acceptance only after an accepted yes", () => {
    expect(to(evaluate(ev("release-started"), view("acceptance"), OFF))).toBe("refuse");
    expect(to(evaluate(ev("release-started"), view("acceptance", { acceptedYes: true }), OFF))).toBe("release");
  });
});

describe("discard and close", () => {
  it("are refused on a finished ticket", () => {
    for (const s of FINISHED.filter((x) => x !== "discarded"))
      expect(to(evaluate(ev("discard", Q), view(s), OFF))).toBe("refuse");
  });
});

describe("idempotent repeats", () => {
  it("an event whose target is the current status is a no-op", () => {
    expect(evaluate(ev("started"), view("in progress"), OFF)).toEqual({ kind: "noop" });
    expect(evaluate(ev("discard", Q), view("discarded"), OFF)).toEqual({ kind: "noop" });
    expect(evaluate(ev("released"), view("done"), OFF)).toEqual({ kind: "noop" });
  });
});

describe("the gates", () => {
  const signoffs: Signoff[] = [null, "Auto", "Jack"];
  const every = () => {
    const out: { input: EventInput; v: TicketView; cfg: Config; r: RuleResult }[] = [];
    for (const event of EVENTS)
      for (const status of STATUSES)
        for (const signoff of signoffs)
          for (const cfg of [OFF, ON])
            for (const flags of [false, true]) {
              const v = view(status, { signoff, mergedRecorded: flags, acceptedYes: flags });
              const input = ev(event, { answer: "yes", ...Q });
              out.push({ input, v, cfg, r: evaluate(input, v, cfg) });
            }
    return out;
  };
  it("only approved moves a ticket into to do, and only from refinement", () => {
    for (const { input, v, r } of every())
      if (r.kind === "move" && r.to === "to do") {
        expect(input.event).toBe("approved");
        expect(v.status).toBe("refinement");
      }
  });
  it("only accepted, discard and close move a ticket out of acceptance", () => {
    for (const { input, v, r } of every())
      if (v.status === "acceptance" && r.kind === "move") expect(["accepted", "discard", "close"]).toContain(input.event);
  });
  it("nothing but approved moves a ticket out of refinement toward to do; only merged enters acceptance", () => {
    for (const { input, v, r } of every()) {
      if (v.status === "refinement" && r.kind === "move" && r.to !== "discarded" && r.to !== "Closed") expect(input.event).toBe("approved");
      if (r.kind === "move" && r.to === "acceptance") expect(input.event).toBe("merged");
    }
  });
  it("every gate event is refused without a quote", () => {
    for (const event of GATE_EVENTS)
      for (const status of STATUSES)
        expect(evaluate({ event, answer: "yes" }, view(status), OFF).kind).toBe("refuse");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/steward/rules.test.ts`
Expected: FAIL (`Cannot find module './rules.ts'`).

- [ ] **Step 4: Write `rules.ts`**

```ts
import { FINISHED, GATE_EVENTS, type Config, type EventInput, type EventName, type RuleResult, type Status, type TicketView } from "./types.ts";

interface Entry {
  from: Status[];
  to: Status;
}

/** Events with one fixed target. The others (merged, verified, accepted, release-started, discard, close) are below. */
const ENTRY: Partial<Record<EventName, Entry>> = {
  "concept-started": { from: ["backlog"], to: "concept" },
  "discovery-started": { from: ["concept"], to: "discovery" },
  "refinement-started": { from: ["concept", "discovery"], to: "refinement" },
  approved: { from: ["refinement"], to: "to do" },
  started: { from: ["to do"], to: "in progress" },
  "review-started": { from: ["in progress"], to: "review" },
  released: { from: ["release"], to: "done" },
  documented: { from: ["done"], to: "documented" },
};

const AFTER_MERGE: readonly string[] = ["acceptance", "release", "done", "documented"];

const refuse = (reason: string): RuleResult => ({ kind: "refuse", reason });
const NOOP: RuleResult = { kind: "noop" };

function move(to: Status, extra: Omit<Extract<RuleResult, { kind: "move" }>, "kind" | "to"> = {}): RuleResult {
  return { kind: "move", to, ...(to === "done" ? { dueDate: true } : {}), ...extra };
}

export function evaluate(input: EventInput, view: TicketView, cfg: Config): RuleResult {
  const { event } = input;
  if (GATE_EVENTS.includes(event) && !(input.quote && input.quote.trim() !== "")) {
    return refuse(`${event} needs Jack's own words (--quote)`);
  }
  if (event === "filed") return refuse("filed is made by dg steward file, not sent as an event");
  const entry = ENTRY[event];
  if (entry) return viaEntry(event, entry, view);
  switch (event) {
    case "merged": return merged(view, cfg);
    case "verified": return verified(view);
    case "accepted": return accepted(input, view, cfg);
    case "release-started": return releaseStarted(view);
    case "discard": return closeOut("discarded", view);
    case "close": return closeOut("Closed", view);
    default: return refuse(`unknown event ${String(event)}`);
  }
}

function viaEntry(event: EventName, entry: Entry, view: TicketView): RuleResult {
  if (view.status === entry.to) return NOOP;
  if (!entry.from.includes(view.status as Status)) {
    return refuse(`${event} is valid from ${entry.from.join(" or ")}; the ticket is in ${view.status}`);
  }
  return move(entry.to, event === "started" ? { startDate: true } : {});
}

function merged(view: TicketView, cfg: Config): RuleResult {
  if (view.mergedRecorded && (AFTER_MERGE.includes(view.status) || (view.status === "review" && view.signoff === null))) return NOOP;
  if (view.status !== "review") return refuse(`merged is valid from review; the ticket is in ${view.status}`);
  if (view.signoff === "Auto") return move(cfg.releaseStage ? "release" : "done", { recordMerge: true });
  if (view.signoff === "Jack") return move("acceptance", { recordMerge: true });
  return { kind: "record", recordMerge: true };
}

function verified(view: TicketView): RuleResult {
  if (view.status === "done") return NOOP;
  if (view.status !== "review") return refuse(`verified is valid from review; the ticket is in ${view.status}`);
  if (view.signoff === "Jack") return refuse("a Sign-off: Jack ticket waits for Jack's accepted, never verified");
  if (view.signoff === "Auto") return refuse("a Sign-off: Auto ticket goes done at merged");
  if (!view.mergedRecorded) return refuse("verified needs a recorded merge first");
  return move("done");
}

function accepted(input: EventInput, view: TicketView, cfg: Config): RuleResult {
  if (input.answer !== "yes" && input.answer !== "no") return refuse("accepted needs --answer yes or no");
  if (input.answer === "yes" && (view.status === "done" || view.status === "release")) return NOOP;
  if (input.answer === "no" && view.status === "refinement") return NOOP;
  if (view.status !== "acceptance") return refuse(`accepted is valid from acceptance; the ticket is in ${view.status}`);
  if (input.answer === "yes") return move(cfg.releaseStage ? "release" : "done");
  return move("refinement", { comment: `Jack did not accept: ${input.quote?.trim()}` });
}

function releaseStarted(view: TicketView): RuleResult {
  if (view.status === "release") return NOOP;
  const fromReview = view.status === "review" && view.signoff === "Auto" && view.mergedRecorded;
  const fromAcceptance = view.status === "acceptance" && view.acceptedYes;
  if (fromReview || fromAcceptance) return move("release");
  return refuse(`release-started needs a merged Auto ticket in review, or an accepted yes in acceptance; the ticket is in ${view.status}`);
}

function closeOut(to: "discarded" | "Closed", view: TicketView): RuleResult {
  if (view.status === to) return NOOP;
  if (FINISHED.includes(view.status)) return refuse(`${view.status} is finished; it cannot be ${to}`);
  return move(to);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/steward/rules.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/steward/types.ts packages/cli/src/steward/rules.ts packages/cli/src/steward/rules.test.ts
git commit -m "feat(dgs-549): add the Steward status map and rule table"
```

---

### Task 2: State store, lock, rebuild, and the profile reader

**Files:**
- Create: `packages/cli/src/steward/state.ts`
- Create: `packages/cli/src/steward/profile.ts`
- Modify: `profiles/digismith.yml` (append two lines)
- Test: `packages/cli/src/steward/state.test.ts`, `packages/cli/src/steward/profile.test.ts`

**Interfaces:**
- Consumes: `Signoff`, `EventName` from `types.ts`.
- Produces (exact):
  - `interface GateRecord { event: EventName; answer?: "yes" | "no"; quote: string; by: string; at: string }`
  - `interface PendingWrite { to: string; start?: string; due?: string; comment?: string }`
  - `interface LogEntry { at: string; event: string; by: string; outcome: "applied" | "refused" | "noop" | "pending" | "recorded"; note: string }`
  - `interface StewardState { schema_version: 1; ticket: string; tracker: string; status_written: string | null; status_seen: string | null; start_written: string | null; due_written: string | null; signoff: Signoff; merged: { sha: string | null; at: string } | null; gates: GateRecord[]; applied: string[]; pending: PendingWrite[]; sessions: string[]; log: LogEntry[]; closed_at: string | null }`
  - `stewardDir(env?: NodeJS.ProcessEnv): string`
  - `newState(ticket: string, tracker: string): StewardState`
  - `readState(dir: string, ticket: string): StewardState | null` (a bad file is moved to `<KEY>.json.bad`, then `null`)
  - `writeState(dir: string, state: StewardState): void`
  - `interface LockOptions { waitMs: number; staleMs: number; pollMs: number }`, `DEFAULT_LOCK: LockOptions`
  - `withLock<T>(dir: string, ticket: string, fn: () => Promise<T>, opts?: LockOptions): Promise<{ locked: true; value: T } | { locked: false }>`
  - `rebuildState(ticket: string, tracker: string, snap: { status: string; signoff: Signoff; startDate: string | null; dueDate: string | null }, sessionIds: string[]): StewardState`
  - `readStewardProfile(cwd: string, env?: NodeJS.ProcessEnv): { tracker: "clickup" | "jira" | "none"; releaseStage: boolean }`

- [ ] **Step 1: Write the failing tests `state.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { newState, readState, writeState, withLock, rebuildState, stewardDir } from "./state.ts";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "steward-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const FAST = { waitMs: 150, staleMs: 60_000, pollMs: 10 };

describe("stewardDir", () => {
  it("is the steward folder of the depot, overridable", () => {
    expect(stewardDir({ DIGISMITH_DEPOT_DIR: "/d" })).toBe("/d/steward");
    expect(stewardDir({ DIGISMITH_STEWARD_DIR: "/s" })).toBe("/s");
  });
});

describe("state file", () => {
  it("writes and reads back", () => {
    const s = newState("DGS-1", "clickup");
    s.status_written = "review";
    writeState(dir, s);
    expect(readState(dir, "DGS-1")).toEqual(s);
    expect(fs.readdirSync(dir)).toEqual(["DGS-1.json"]);
  });
  it("returns null when there is no file", () => {
    expect(readState(dir, "DGS-2")).toBeNull();
  });
  it("moves an unreadable file aside and returns null", () => {
    fs.writeFileSync(path.join(dir, "DGS-3.json"), "{not json");
    expect(readState(dir, "DGS-3")).toBeNull();
    expect(fs.existsSync(path.join(dir, "DGS-3.json.bad"))).toBe(true);
  });
  it("moves a file with the wrong ticket or schema aside", () => {
    writeState(dir, { ...newState("DGS-9", "clickup") });
    fs.renameSync(path.join(dir, "DGS-9.json"), path.join(dir, "DGS-4.json"));
    expect(readState(dir, "DGS-4")).toBeNull();
    expect(fs.existsSync(path.join(dir, "DGS-4.json.bad"))).toBe(true);
  });
  it("refuses a key that is not a plain key", () => {
    expect(() => readState(dir, "../x")).toThrow(/invalid ticket key/);
  });
});

describe("withLock", () => {
  it("runs the function and frees the lock", async () => {
    const r = await withLock(dir, "DGS-5", async () => 7, FAST);
    expect(r).toEqual({ locked: true, value: 7 });
    expect(fs.existsSync(path.join(dir, "DGS-5.json.lock"))).toBe(false);
  });
  it("frees the lock when the function throws", async () => {
    await expect(withLock(dir, "DGS-5", async () => { throw new Error("x"); }, FAST)).rejects.toThrow("x");
    expect(fs.existsSync(path.join(dir, "DGS-5.json.lock"))).toBe(false);
  });
  it("gives up after the wait when another call holds the lock", async () => {
    fs.writeFileSync(path.join(dir, "DGS-6.json.lock"), "");
    expect(await withLock(dir, "DGS-6", async () => 1, FAST)).toEqual({ locked: false });
  });
  it("takes over a stale lock", async () => {
    const lock = path.join(dir, "DGS-7.json.lock");
    fs.writeFileSync(lock, "");
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(lock, old, old);
    expect(await withLock(dir, "DGS-7", async () => 2, FAST)).toEqual({ locked: true, value: 2 });
  });
  it("runs two calls one after the other", async () => {
    const order: string[] = [];
    const slow = withLock(dir, "DGS-8", async () => { order.push("a-in"); await new Promise((r) => setTimeout(r, 40)); order.push("a-out"); }, { ...FAST, waitMs: 2000 });
    const quick = withLock(dir, "DGS-8", async () => { order.push("b"); }, { ...FAST, waitMs: 2000 });
    await Promise.all([slow, quick]);
    expect(order).toEqual(["a-in", "a-out", "b"]);
  });
});

describe("rebuildState", () => {
  const snap = (status: string) => ({ status, signoff: "Jack" as const, startDate: "2026-10-01", dueDate: null });
  it("copies status, dates and mark from the tracker and the sessions from the registry", () => {
    const s = rebuildState("DGS-1", "clickup", snap("in progress"), ["s1"]);
    expect(s).toMatchObject({ status_written: "in progress", status_seen: "in progress", start_written: "2026-10-01", signoff: "Jack", sessions: ["s1"], merged: null });
  });
  it("marks the merge as rebuilt for a ticket past review", () => {
    expect(rebuildState("DGS-1", "clickup", snap("acceptance"), []).merged).toEqual({ sha: null, at: "rebuilt" });
  });
});
```

- [ ] **Step 2: Write the failing test `profile.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readStewardProfile } from "./profile.ts";

let root: string;
const put = (rel: string, text: string) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "stprofile-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
const env = () => ({ DIGISMITH_PROFILES_DIR: path.join(root, "profiles") });

describe("readStewardProfile", () => {
  it("reads tracker and release_stage from the profile the config names", () => {
    put("cwd/.digismith/config.yml", "profile: digismith\n");
    put("profiles/digismith.yml", "name: digismith\ntracker: clickup\nrelease_stage: true\n");
    expect(readStewardProfile(path.join(root, "cwd"), env())).toEqual({ tracker: "clickup", releaseStage: true });
  });
  it("defaults to none and false when the profile has neither field", () => {
    put("cwd/.digismith/config.yml", "profile: emma\n");
    put("profiles/emma.yml", "name: emma\n");
    expect(readStewardProfile(path.join(root, "cwd"), env())).toEqual({ tracker: "none", releaseStage: false });
  });
  it("defaults to none when there is no config, no profile file, or an unknown tracker", () => {
    expect(readStewardProfile(path.join(root, "nothing"), env())).toEqual({ tracker: "none", releaseStage: false });
    put("cwd/.digismith/config.yml", "profile: x\n");
    expect(readStewardProfile(path.join(root, "cwd"), env()).tracker).toBe("none");
    put("profiles/x.yml", "tracker: trello\n");
    expect(readStewardProfile(path.join(root, "cwd"), env()).tracker).toBe("none");
  });
  it("prefers the profiles folder inside the working directory", () => {
    put("cwd/.digismith/config.yml", "profile: digismith\n");
    put("cwd/profiles/digismith.yml", "tracker: clickup\n");
    expect(readStewardProfile(path.join(root, "cwd"), { DIGISMITH_PROFILES_DIR: path.join(root, "none") }).tracker).toBe("clickup");
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm vitest run packages/cli/src/steward/state.test.ts packages/cli/src/steward/profile.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Write `state.ts`**

```ts
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EventName, Signoff } from "./types.ts";

export interface GateRecord { event: EventName; answer?: "yes" | "no"; quote: string; by: string; at: string }
export interface PendingWrite { to: string; start?: string; due?: string; comment?: string }
export interface LogEntry { at: string; event: string; by: string; outcome: "applied" | "refused" | "noop" | "pending" | "recorded"; note: string }

export interface StewardState {
  schema_version: 1;
  ticket: string;
  tracker: string;
  status_written: string | null;
  status_seen: string | null;
  start_written: string | null;
  due_written: string | null;
  signoff: Signoff;
  merged: { sha: string | null; at: string } | null;
  gates: GateRecord[];
  applied: string[];
  pending: PendingWrite[];
  sessions: string[];
  log: LogEntry[];
  closed_at: string | null;
}

const TICKET_PATTERN = /^[A-Za-z0-9_-]+$/;
const AFTER_REVIEW = ["acceptance", "release", "done", "documented"];

export function stewardDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DIGISMITH_STEWARD_DIR) return env.DIGISMITH_STEWARD_DIR;
  return join(env.DIGISMITH_DEPOT_DIR || join(homedir(), ".digismith-depot"), "steward");
}

function fileOf(dir: string, ticket: string): string {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
  return join(dir, `${ticket}.json`);
}

export function newState(ticket: string, tracker: string): StewardState {
  return {
    schema_version: 1, ticket, tracker, status_written: null, status_seen: null, start_written: null,
    due_written: null, signoff: null, merged: null, gates: [], applied: [], pending: [], sessions: [], log: [], closed_at: null,
  };
}

function isState(v: unknown, ticket: string): v is StewardState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return s.schema_version === 1 && s.ticket === ticket && Array.isArray(s.gates) && Array.isArray(s.applied)
    && Array.isArray(s.pending) && Array.isArray(s.sessions) && Array.isArray(s.log);
}

/** A file that does not parse, or does not match this ticket and schema, is moved aside (never deleted) and reads as absent. */
export function readState(dir: string, ticket: string): StewardState | null {
  const file = fileOf(dir, ticket);
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
    if (isState(parsed, ticket)) return parsed;
  } catch {
    // falls through to the move-aside below
  }
  renameSync(file, `${file}.bad`);
  return null;
}

export function writeState(dir: string, state: StewardState): void {
  const file = fileOf(dir, state.ticket);
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, file);
}

export interface LockOptions { waitMs: number; staleMs: number; pollMs: number }
export const DEFAULT_LOCK: LockOptions = { waitMs: 5000, staleMs: 60_000, pollMs: 50 };

/** One call at a time per ticket. The lock file is the Steward's own file, so a stale one may be taken over. */
export async function withLock<T>(
  dir: string, ticket: string, fn: () => Promise<T>, opts: LockOptions = DEFAULT_LOCK,
): Promise<{ locked: true; value: T } | { locked: false }> {
  mkdirSync(dir, { recursive: true });
  const lock = `${fileOf(dir, ticket)}.lock`;
  const deadline = Date.now() + opts.waitMs;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - statSync(lock).mtimeMs > opts.staleMs) {
          rmSync(lock, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) return { locked: false };
      await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
    }
  }
  try {
    return { locked: true, value: await fn() };
  } finally {
    rmSync(lock, { force: true });
  }
}

/** ClickUp wins. A ticket already past review gets a placeholder merge, because the real sha is unknown. */
export function rebuildState(
  ticket: string, tracker: string,
  snap: { status: string; signoff: Signoff; startDate: string | null; dueDate: string | null },
  sessionIds: string[],
): StewardState {
  const s = newState(ticket, tracker);
  s.status_written = snap.status;
  s.status_seen = snap.status;
  s.start_written = snap.startDate;
  s.due_written = snap.dueDate;
  s.signoff = snap.signoff;
  s.sessions = [...sessionIds];
  if (AFTER_REVIEW.includes(snap.status)) s.merged = { sha: null, at: "rebuilt" };
  return s;
}
```

- [ ] **Step 5: Write `profile.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface StewardProfile {
  tracker: "clickup" | "jira" | "none";
  releaseStage: boolean;
}

const NONE: StewardProfile = { tracker: "none", releaseStage: false };

function scalar(text: string, key: string): string | null {
  const m = new RegExp(`^${key}:[ \\t]*([^#\\r\\n]*?)[ \\t]*(#.*)?$`, "m").exec(text);
  return m ? m[1].replace(/^["']|["']$/g, "") : null;
}

function read(file: string): string | null {
  try {
    return existsSync(file) ? readFileSync(file, "utf-8") : null;
  } catch {
    return null;
  }
}

/** The profile name comes from .digismith/config.yml in cwd. The file is profiles/<name>.yml in cwd, else in the depot clone. Anything missing means no tracker. */
export function readStewardProfile(cwd: string, env: NodeJS.ProcessEnv = process.env): StewardProfile {
  const config = read(join(cwd, ".digismith", "config.yml"));
  const name = config ? scalar(config, "profile") : null;
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return NONE;
  const depotProfiles = env.DIGISMITH_PROFILES_DIR || join(homedir(), ".digismith-depot", "repo", "profiles");
  const text = read(join(cwd, "profiles", `${name}.yml`)) ?? read(join(depotProfiles, `${name}.yml`));
  if (!text) return NONE;
  const tracker = scalar(text, "tracker");
  return {
    tracker: tracker === "clickup" || tracker === "jira" ? tracker : "none",
    releaseStage: scalar(text, "release_stage") === "true",
  };
}
```

- [ ] **Step 6: Add the two fields to the DigiSmith profile**

Append to `profiles/digismith.yml`:

```yaml
tracker: clickup
release_stage: false
```

- [ ] **Step 7: Run the new tests and the whole suite**

Run: `pnpm vitest run packages/cli/src/steward && pnpm vitest run`
Expected: the steward tests PASS. The whole suite passes. If a test that reads `profiles/digismith.yml` now fails on the two new keys, fix that test's expectation in the same commit and say so in the commit body.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/steward/state.ts packages/cli/src/steward/state.test.ts packages/cli/src/steward/profile.ts packages/cli/src/steward/profile.test.ts profiles/digismith.yml
git commit -m "feat(dgs-549): add the Steward state store, lock, rebuild and profile reader"
```

---

### Task 3: The Tracker interface and the ClickUp tracker

**Files:**
- Create: `packages/cli/src/steward/tracker.ts`
- Create: `packages/cli/src/steward/clickup-tracker.ts`
- Create: `packages/cli/src/steward/fake-tracker.test-util.ts`
- Test: `packages/cli/src/steward/clickup-tracker.test.ts`

**Interfaces:**
- Consumes: `Signoff` from `types.ts`; `parseDateFlag` from `../clickup/parse-date.ts`; `resolveTaskType` from `../clickup/task-types.ts`; `ClickUpClient` methods `getTaskByRef`, `getList`, `updateTask`, `addTaskComment`, `getSpaceFolders`, `getFolderlessLists`, `getTaskTypes`, `createTask`.
- Produces (exact):
  - `interface TicketSnapshot { key: string; status: string; signoff: Signoff; startDate: string | null; dueDate: string | null; statuses: string[] }`
  - `interface ListTarget { id: string; name: string; folder: string; description: string }`
  - `interface Candidate { key: string; name: string; status: string; list: string }`
  - `interface NewTicket { listId: string; name: string; type: string; description?: string }`
  - `interface Tracker { getTicket(key: string): Promise<TicketSnapshot>; setStatus(key: string, status: string): Promise<void>; setDates(key: string, dates: { start?: string; due?: string }): Promise<void>; addComment(key: string, text: string): Promise<void>; listTargets(): Promise<ListTarget[]>; findCandidates(idea: string): Promise<Candidate[]>; createTicket(t: NewTicket): Promise<{ key: string; url: string }> }`
  - `class ClickUpTracker implements Tracker` with `constructor(client: ClickUpClient, spaceId: string)`
  - `class FakeTracker implements Tracker` (test util): public `ticket: TicketSnapshot`, `calls: string[]`, `failWrites: number`, `comments: string[]`, `targets`, `candidates`, `created`

`findCandidates` calls `client.searchTeamTasks`, added in Task 5. In this task `ClickUpTracker.findCandidates` is written against that method and its test uses a fake client that has it. The real method lands in Task 5, so Task 3 compiles in tests only through the fake. Do not call `findCandidates` outside tests before Task 5.

- [ ] **Step 1: Write `tracker.ts`**

```ts
import type { Signoff } from "./types.ts";

export interface TicketSnapshot {
  key: string;
  status: string;
  signoff: Signoff;
  /** Date-only, UTC+7, or null. */
  startDate: string | null;
  dueDate: string | null;
  /** The status names on the ticket's list. */
  statuses: string[];
}

export interface ListTarget { id: string; name: string; folder: string; description: string }
export interface Candidate { key: string; name: string; status: string; list: string }
export interface NewTicket { listId: string; name: string; type: string; description?: string }

export interface Tracker {
  getTicket(key: string): Promise<TicketSnapshot>;
  setStatus(key: string, status: string): Promise<void>;
  setDates(key: string, dates: { start?: string; due?: string }): Promise<void>;
  addComment(key: string, text: string): Promise<void>;
  listTargets(): Promise<ListTarget[]>;
  findCandidates(idea: string): Promise<Candidate[]>;
  createTicket(t: NewTicket): Promise<{ key: string; url: string }>;
}
```

- [ ] **Step 2: Write `fake-tracker.test-util.ts`**

```ts
import type { Candidate, ListTarget, NewTicket, Tracker, TicketSnapshot } from "./tracker.ts";

export const ALL_STATUSES = [
  "backlog", "concept", "discovery", "refinement", "to do", "in progress", "review",
  "acceptance", "release", "done", "documented", "discarded", "Closed",
];

export function snapshot(status: string, extra: Partial<TicketSnapshot> = {}): TicketSnapshot {
  return { key: "DGS-1", status, signoff: null, startDate: null, dueDate: null, statuses: ALL_STATUSES, ...extra };
}

/** In-memory Tracker. failWrites = how many of the next write calls throw. */
export class FakeTracker implements Tracker {
  calls: string[] = [];
  comments: string[] = [];
  failWrites = 0;
  targets: ListTarget[] = [];
  candidates: Candidate[] = [];
  created: NewTicket[] = [];

  constructor(public ticket: TicketSnapshot) {}

  private write(name: string): void {
    this.calls.push(name);
    if (this.failWrites > 0) {
      this.failWrites -= 1;
      throw new Error("write failed");
    }
  }

  async getTicket(): Promise<TicketSnapshot> {
    return { ...this.ticket };
  }
  async setStatus(_key: string, status: string): Promise<void> {
    this.write(`status:${status}`);
    this.ticket.status = status;
  }
  async setDates(_key: string, dates: { start?: string; due?: string }): Promise<void> {
    this.write(`dates:${dates.start ?? ""}|${dates.due ?? ""}`);
    if (dates.start) this.ticket.startDate = dates.start;
    if (dates.due) this.ticket.dueDate = dates.due;
  }
  async addComment(_key: string, text: string): Promise<void> {
    this.write("comment");
    this.comments.push(text);
  }
  async listTargets(): Promise<ListTarget[]> {
    return this.targets;
  }
  async findCandidates(): Promise<Candidate[]> {
    return this.candidates;
  }
  async createTicket(t: NewTicket): Promise<{ key: string; url: string }> {
    this.write("create");
    this.created.push(t);
    return { key: "DGS-900", url: "https://app.clickup.com/t/x" };
  }
}
```

- [ ] **Step 3: Write the failing tests `clickup-tracker.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { ClickUpTracker } from "./clickup-tracker.ts";

function task(over: Record<string, unknown> = {}) {
  return {
    id: "abc", custom_id: "DGS-7", name: "n", url: "https://u", status: { status: "review" },
    start_date: null, due_date: null, list: { id: "L1", name: "B.5" },
    custom_fields: [{ name: "Sign-off", type: "drop_down", value: 0, type_config: { options: [{ name: "Auto", orderindex: 0 }, { name: "Jack", orderindex: 1 }] } }],
    ...over,
  };
}
function client(over: Record<string, unknown> = {}): ClickUpClient {
  return {
    getTaskByRef: vi.fn().mockResolvedValue(task()),
    getList: vi.fn().mockResolvedValue({ id: "L1", name: "B.5", statuses: [{ status: "review" }, { status: "done" }] }),
    updateTask: vi.fn().mockResolvedValue({}),
    addTaskComment: vi.fn().mockResolvedValue({}),
    getTaskTypes: vi.fn().mockResolvedValue([{ id: 1022, name: "Bug", name_plural: "Bugs", description: null, avatar: null }]),
    createTask: vi.fn().mockResolvedValue(task({ custom_id: "DGS-900", url: "https://new" })),
    getSpaceFolders: vi.fn().mockResolvedValue([{ id: "F1", name: "B: Agentic", lists: [{ id: "L1", name: "B.5: Autonomous Engineering" }] }]),
    getFolderlessLists: vi.fn().mockResolvedValue([]),
    searchTeamTasks: vi.fn().mockResolvedValue([task({ custom_id: "DGS-3", name: "Steward role keeps sync", status: { status: "refinement" }, list: { id: "L1", name: "B.5" } })]),
    ...over,
  } as unknown as ClickUpClient;
}

describe("getTicket", () => {
  it("reads status, the Sign-off name, dates in UTC+7 and the list statuses", async () => {
    const c = client({ getTaskByRef: vi.fn().mockResolvedValue(task({ start_date: String(Date.UTC(2026, 9, 17, 21, 0)), due_date: null })) });
    const t = await new ClickUpTracker(c, "S1").getTicket("DGS-7");
    expect(t).toEqual({ key: "DGS-7", status: "review", signoff: "Auto", startDate: "2026-10-18", dueDate: null, statuses: ["review", "done"] });
  });
  it("reads an unset or unknown Sign-off as null", async () => {
    const c = client({ getTaskByRef: vi.fn().mockResolvedValue(task({ custom_fields: [{ name: "Sign-off", type: "drop_down", type_config: { options: [] } }] })) });
    expect((await new ClickUpTracker(c, "S1").getTicket("DGS-7")).signoff).toBeNull();
    const d = client({ getTaskByRef: vi.fn().mockResolvedValue(task({ custom_fields: [] })) });
    expect((await new ClickUpTracker(d, "S1").getTicket("DGS-7")).signoff).toBeNull();
  });
});

describe("writes", () => {
  it("setStatus sends the status to the task id", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").setStatus("DGS-7", "done");
    expect(c.updateTask).toHaveBeenCalledWith("abc", { status: "done" });
  });
  it("setDates sends date-only values at 04:00 UTC+7", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").setDates("DGS-7", { start: "2026-10-17", due: "2026-10-18" });
    expect(c.updateTask).toHaveBeenCalledWith("abc", {
      start_date: Date.UTC(2026, 9, 16, 21, 0), start_date_time: false,
      due_date: Date.UTC(2026, 9, 17, 21, 0), due_date_time: false,
    });
  });
  it("addComment posts the text", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").addComment("DGS-7", "hi");
    expect(c.addTaskComment).toHaveBeenCalledWith("abc", "hi");
  });
});

describe("filing", () => {
  it("listTargets returns every list with its folder", async () => {
    expect(await new ClickUpTracker(client(), "S1").listTargets()).toEqual([
      { id: "L1", name: "B.5: Autonomous Engineering", folder: "B: Agentic", description: "" },
    ]);
  });
  it("findCandidates keeps the 10 best title matches", async () => {
    const found = await new ClickUpTracker(client(), "S1").findCandidates("steward role sync tickets");
    expect(found).toEqual([{ key: "DGS-3", name: "Steward role keeps sync", status: "refinement", list: "B.5" }]);
  });
  it("createTicket makes a backlog ticket with priority Normal and the resolved type", async () => {
    const c = client();
    const out = await new ClickUpTracker(c, "S1").createTicket({ listId: "L1", name: "Fix x", type: "Bug", description: "d" });
    expect(c.createTask).toHaveBeenCalledWith("L1", { name: "Fix x", description: "d", status: "backlog", priority: 3, custom_item_id: 1022 });
    expect(out).toEqual({ key: "DGS-900", url: "https://new" });
  });
  it("createTicket leaves custom_item_id off for the plain Task type and never sends an empty description", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").createTicket({ listId: "L1", name: "A", type: "Task" });
    expect(c.createTask).toHaveBeenCalledWith("L1", { name: "A", status: "backlog", priority: 3 });
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm vitest run packages/cli/src/steward/clickup-tracker.test.ts`
Expected: FAIL (`./clickup-tracker.ts` not found).

- [ ] **Step 5: Write `clickup-tracker.ts`**

```ts
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { parseDateFlag } from "../clickup/parse-date.ts";
import { resolveTaskType } from "../clickup/task-types.ts";
import type { Candidate, ListTarget, NewTicket, Tracker, TicketSnapshot } from "./tracker.ts";
import type { Signoff } from "./types.ts";

const UTC7_MS = 7 * 3_600_000;
const NORMAL_PRIORITY = 3;
const SIGNOFF_FIELD = "Sign-off";
const CANDIDATE_LIMIT = 10;

/** ClickUp stores all-day dates at 04:00 UTC+7; read them back as the UTC+7 day. */
function dayOf(ms: string | null): string | null {
  return ms ? new Date(Number(ms) + UTC7_MS).toISOString().slice(0, 10) : null;
}

function signoffOf(task: ClickUpTask): Signoff {
  const field = task.custom_fields.find((f) => f.name === SIGNOFF_FIELD);
  if (!field || field.type !== "drop_down" || typeof field.value !== "number") return null;
  const name = field.type_config.options.find((o) => o.orderindex === field.value)?.name;
  return name === "Auto" || name === "Jack" ? name : null;
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
}

export class ClickUpTracker implements Tracker {
  constructor(private readonly client: ClickUpClient, private readonly spaceId: string) {}

  private async taskOf(key: string): Promise<ClickUpTask> {
    return this.client.getTaskByRef(key);
  }

  async getTicket(key: string): Promise<TicketSnapshot> {
    const task = await this.taskOf(key);
    const list = await this.client.getList(task.list.id);
    return {
      key,
      status: task.status.status,
      signoff: signoffOf(task),
      startDate: dayOf(task.start_date),
      dueDate: dayOf(task.due_date),
      statuses: list.statuses.map((s) => s.status),
    };
  }

  async setStatus(key: string, status: string): Promise<void> {
    await this.client.updateTask((await this.taskOf(key)).id, { status });
  }

  async setDates(key: string, dates: { start?: string; due?: string }): Promise<void> {
    const body: Parameters<ClickUpClient["updateTask"]>[1] = {};
    if (dates.start) {
      const p = parseDateFlag(dates.start, "start date");
      body.start_date = p.ms;
      body.start_date_time = p.hasTime;
    }
    if (dates.due) {
      const p = parseDateFlag(dates.due, "due date");
      body.due_date = p.ms;
      body.due_date_time = p.hasTime;
    }
    await this.client.updateTask((await this.taskOf(key)).id, body);
  }

  async addComment(key: string, text: string): Promise<void> {
    await this.client.addTaskComment((await this.taskOf(key)).id, text);
  }

  async listTargets(): Promise<ListTarget[]> {
    const [folders, loose] = await Promise.all([this.client.getSpaceFolders(this.spaceId), this.client.getFolderlessLists(this.spaceId)]);
    const out: ListTarget[] = [];
    for (const f of folders) for (const l of f.lists) out.push({ id: l.id, name: l.name, folder: f.name, description: "" });
    for (const l of loose) out.push({ id: l.id, name: l.name, folder: "", description: "" });
    return out;
  }

  async findCandidates(idea: string): Promise<Candidate[]> {
    const want = words(idea);
    const tasks = await this.client.searchTeamTasks(this.spaceId);
    return tasks
      .map((t) => ({ t, score: [...words(t.name)].filter((w) => want.has(w)).length }))
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATE_LIMIT)
      .map(({ t }) => ({ key: t.custom_id ?? t.id, name: t.name, status: t.status.status, list: t.list.name }));
  }

  async createTicket(t: NewTicket): Promise<{ key: string; url: string }> {
    const body: Parameters<ClickUpClient["createTask"]>[1] = { name: t.name, status: "backlog", priority: NORMAL_PRIORITY };
    if (t.description) body.description = t.description;
    const type = resolveTaskType(await this.client.getTaskTypes(), t.type);
    if (type.id !== 0) body.custom_item_id = type.id;
    const created = await this.client.createTask(t.listId, body);
    return { key: created.custom_id ?? created.id, url: created.url };
  }
}
```

Note: the `createTicket` test expects the body key order `name, description, status, priority, custom_item_id`; `toHaveBeenCalledWith` ignores key order, so the order in the code is free.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm vitest run packages/cli/src/steward/clickup-tracker.test.ts`
Expected: PASS. If TypeScript-only complaints about `searchTeamTasks` appear in an editor, ignore them until Task 5; Vitest does not type-check.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/steward/tracker.ts packages/cli/src/steward/clickup-tracker.ts packages/cli/src/steward/clickup-tracker.test.ts packages/cli/src/steward/fake-tracker.test-util.ts
git commit -m "feat(dgs-549): add the Steward tracker interface and the ClickUp tracker"
```

---

### Task 4: The event command, rebuild, wiring, README and the first live dry run

**Files:**
- Create: `packages/cli/src/steward/event.ts`
- Create: `packages/cli/src/steward/index.ts`
- Create: `packages/cli/src/steward/README.md`
- Modify: `packages/cli/src/index.ts` (register the command)
- Modify: `packages/cli/src/index.test.ts` (help lists `steward`)
- Test: `packages/cli/src/steward/event.test.ts`, `packages/cli/src/steward/index.test.ts`

**Interfaces:**
- Consumes: Task 1, 2 and 3 exports; `createClient`, `DIGISMITH_SPACE_ID` from `../clickup/lib.ts`; `createDepotRegistry` from `../tokens/registry.ts` (its `read(ticket)` returns `RegistryEntry[]`).
- Produces (exact):
  - `interface EventDeps { tracker: Tracker | null; dir: string; now: () => Date; config: Config; lock?: LockOptions; sessionIds: (ticket: string) => string[] }`
  - `assertUsage(input: EventInput): void` (throws `UsageError`)
  - `class UsageError extends Error`
  - `runEvent(deps: EventDeps, ticket: string, input: EventInput, dryRun?: boolean): Promise<string[]>` returns the lines to print
  - `rebuild(deps: EventDeps, ticket: string): Promise<string[]>`
  - `createStewardCommand(depsFactory?: () => EventDeps): CommandModule` and `default stewardCommand`
  - `todayUtc7(now: Date): string` (`YYYY-MM-DD`)

- [ ] **Step 1: Write the failing tests `event.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runEvent, rebuild, assertUsage, UsageError, todayUtc7, type EventDeps } from "./event.ts";
import { readState } from "./state.ts";
import { FakeTracker, snapshot } from "./fake-tracker.test-util.ts";
import type { EventInput } from "./types.ts";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stev-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const NOW = new Date("2026-10-17T20:30:00Z"); // 03:30 on 2026-10-18 in UTC+7
const deps = (t: FakeTracker | null, over: Partial<EventDeps> = {}): EventDeps => ({
  tracker: t, dir, now: () => NOW, config: { releaseStage: false },
  lock: { waitMs: 100, staleMs: 60_000, pollMs: 10 }, sessionIds: () => ["s1"], ...over,
});
const run = (t: FakeTracker, input: EventInput, over: Partial<EventDeps> = {}, dry = false) => runEvent(deps(t, over), "DGS-1", input, dry);
const Q = { quote: "approved, go" };

describe("todayUtc7", () => {
  it("is the UTC+7 day", () => expect(todayUtc7(NOW)).toBe("2026-10-18"));
});

describe("assertUsage", () => {
  it("rejects a gate event without a quote and accepted without an answer", () => {
    expect(() => assertUsage({ event: "approved" })).toThrow(UsageError);
    expect(() => assertUsage({ event: "accepted", quote: "q" })).toThrow(UsageError);
    expect(() => assertUsage({ event: "accepted", quote: "q", answer: "yes" })).not.toThrow();
    expect(() => assertUsage({ event: "started" })).not.toThrow();
  });
});

describe("no tracker", () => {
  it("prints nothing and writes nothing", async () => {
    expect(await runEvent(deps(null), "DGS-1", { event: "started" })).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe("a start", () => {
  it("moves to do to in progress with a start date and writes state", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const lines = await run(t, { event: "started", by: "worker" });
    expect(t.ticket).toMatchObject({ status: "in progress", startDate: "2026-10-18" });
    expect(lines.join("\n")).toContain("to do -> in progress");
    const s = readState(dir, "DGS-1")!;
    expect(s).toMatchObject({ status_written: "in progress", start_written: "2026-10-18", sessions: ["s1"] });
    expect(s.log.at(-1)).toMatchObject({ event: "started", by: "worker", outcome: "applied" });
  });
  it("keeps an existing start date", async () => {
    const t = new FakeTracker(snapshot("to do", { startDate: "2026-10-01" }));
    await run(t, { event: "started" });
    expect(t.calls).toEqual(["status:in progress"]);
  });
});

describe("a refusal and a repeat", () => {
  it("a refused event writes nothing to the tracker but is logged", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    const lines = await run(t, { event: "started" });
    expect(t.calls).toEqual([]);
    expect(lines[0]).toMatch(/refused started/);
    expect(readState(dir, "DGS-1")!.log.at(-1)?.outcome).toBe("refused");
  });
  it("a repeated event is a no-op", async () => {
    const t = new FakeTracker(snapshot("in progress"));
    await run(t, { event: "started" });
    expect(t.calls).toEqual([]);
    expect(readState(dir, "DGS-1")!.log.at(-1)?.outcome).toBe("noop");
  });
});

describe("the three done paths", () => {
  it("Auto: review-started then merged ends done with a due date, no verified needed", async () => {
    const t = new FakeTracker(snapshot("in progress", { signoff: "Auto" }));
    await run(t, { event: "review-started" });
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket).toMatchObject({ status: "done", dueDate: "2026-10-18" });
    const s = readState(dir, "DGS-1")!;
    expect(s.merged?.sha).toBe("abc");
    expect(s.closed_at).toBe(NOW.toISOString());
  });
  it("Jack: merged enters acceptance, verified is refused, accepted yes ends done and keeps the quote", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket.status).toBe("acceptance");
    await run(t, { event: "verified" });
    expect(t.ticket.status).toBe("acceptance");
    await run(t, { event: "accepted", answer: "yes", quote: "looks good", by: "maestro" });
    expect(t.ticket.status).toBe("done");
    expect(readState(dir, "DGS-1")!.gates).toEqual([{ event: "accepted", answer: "yes", quote: "looks good", by: "maestro", at: NOW.toISOString() }]);
  });
  it("Jack: accepted no returns to refinement and comments his words", async () => {
    const t = new FakeTracker(snapshot("acceptance", { signoff: "Jack" }));
    await run(t, { event: "accepted", answer: "no", quote: "wrong colour" });
    expect(t.ticket.status).toBe("refinement");
    expect(t.comments).toEqual(["Jack did not accept: wrong colour"]);
  });
  it("unmarked: merged records only, verified ends done", async () => {
    const t = new FakeTracker(snapshot("review"));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket.status).toBe("review");
    expect(readState(dir, "DGS-1")!.merged?.sha).toBe("abc");
    await run(t, { event: "verified" });
    expect(t.ticket).toMatchObject({ status: "done", dueDate: "2026-10-18" });
  });
  it("release stage on: Auto merged goes to release, released goes to done", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto" }));
    await run(t, { event: "merged" }, { config: { releaseStage: true } });
    expect(t.ticket.status).toBe("release");
    await run(t, { event: "released" }, { config: { releaseStage: true } });
    expect(t.ticket.status).toBe("done");
  });
});

describe("the gates", () => {
  it("approved with a quote moves refinement to to do and records the decision", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    await run(t, { event: "approved", ...Q, by: "maestro" });
    expect(t.ticket.status).toBe("to do");
    expect(readState(dir, "DGS-1")!.gates[0]).toMatchObject({ event: "approved", quote: "approved, go", by: "maestro" });
  });
  it("an event in acceptance other than accepted is refused", async () => {
    const t = new FakeTracker(snapshot("acceptance", { signoff: "Jack" }));
    for (const event of ["started", "review-started", "merged", "verified"] as const) await run(t, { event });
    expect(t.ticket.status).toBe("acceptance");
    expect(t.calls).toEqual([]);
  });
});

describe("a status that is not on the list", () => {
  it("is refused with the list's statuses and nothing is written", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack", statuses: ["review", "done"] }));
    const lines = await run(t, { event: "merged" });
    expect(t.calls).toEqual([]);
    expect(lines.join("\n")).toContain('"acceptance" is not on the list');
  });
});

describe("a failed write", () => {
  it("is kept as pending and retried first at the next event", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.failWrites = 1;
    const lines = await run(t, { event: "started" });
    expect(lines.join("\n")).toMatch(/will retry/);
    expect(t.ticket.status).toBe("to do");
    expect(readState(dir, "DGS-1")!.pending).toEqual([{ to: "in progress", start: "2026-10-18" }]);
    await run(t, { event: "review-started" });
    expect(t.ticket.status).toBe("review");
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
  });
  it("a read-back that differs from the write counts as a failed write", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const original = t.setStatus.bind(t);
    t.setStatus = async (k, s) => { await original(k, s); t.ticket.status = "to do"; };
    await run(t, { event: "started" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
  });
});

describe("the lock", () => {
  it("applies nothing and says so when another call holds the lock", async () => {
    fs.writeFileSync(path.join(dir, "DGS-1.json.lock"), "");
    const t = new FakeTracker(snapshot("to do"));
    const lines = await run(t, { event: "started" });
    expect(lines[0]).toMatch(/lock/);
    expect(t.calls).toEqual([]);
  });
});

describe("dry run", () => {
  it("prints the move and writes nothing", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const lines = await run(t, { event: "started" }, {}, true);
    expect(lines[0]).toMatch(/dry run.*to do -> in progress/);
    expect(t.calls).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe("rebuild", () => {
  it("builds the state from the tracker and the registry, and reports a difference", async () => {
    const t = new FakeTracker(snapshot("in progress", { startDate: "2026-10-01", signoff: "Auto" }));
    const lines = await rebuild(deps(t), "DGS-1");
    expect(readState(dir, "DGS-1")).toMatchObject({ status_written: "in progress", start_written: "2026-10-01", signoff: "Auto", sessions: ["s1"] });
    expect(lines[0]).toMatch(/rebuilt/);
  });
  it("an event for a ticket with no file rebuilds first", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack" }));
    await run(t, { event: "merged" });
    expect(readState(dir, "DGS-1")!.sessions).toEqual(["s1"]);
  });
  it("ClickUp wins over a state file that disagrees", async () => {
    const t = new FakeTracker(snapshot("to do"));
    await run(t, { event: "started" });
    t.ticket.status = "review"; // someone moved it by hand
    await run(t, { event: "review-started" });
    expect(readState(dir, "DGS-1")!.status_seen).toBe("review");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/cli/src/steward/event.test.ts`
Expected: FAIL (`./event.ts` not found).

- [ ] **Step 3: Write `event.ts`**

```ts
import { evaluate } from "./rules.ts";
import { DEFAULT_LOCK, readState, rebuildState, withLock, writeState, type LockOptions, type PendingWrite, type StewardState } from "./state.ts";
import type { TicketSnapshot, Tracker } from "./tracker.ts";
import { GATE_EVENTS, type Config, type EventInput, type Move, type TicketView } from "./types.ts";

export class UsageError extends Error {}

export interface EventDeps {
  tracker: Tracker | null;
  dir: string;
  now: () => Date;
  config: Config;
  lock?: LockOptions;
  sessionIds: (ticket: string) => string[];
}

const TRACKER_NAME = "clickup";
const LOG_LIMIT = 200;
const CLOSING = ["done", "discarded", "Closed"];

export function todayUtc7(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function assertUsage(input: EventInput): void {
  if (GATE_EVENTS.includes(input.event) && !(input.quote && input.quote.trim() !== "")) {
    throw new UsageError(`${input.event} needs Jack's own words: pass --quote "<his words>"`);
  }
  if (input.event === "accepted" && input.answer !== "yes" && input.answer !== "no") {
    throw new UsageError("accepted needs --answer yes or no");
  }
}

function viewOf(snap: TicketSnapshot, st: StewardState): TicketView {
  return {
    status: snap.status,
    signoff: snap.signoff,
    mergedRecorded: st.merged !== null,
    acceptedYes: st.gates.some((g) => g.event === "accepted" && g.answer === "yes"),
  };
}

function log(st: StewardState, now: Date, input: EventInput, outcome: StewardState["log"][number]["outcome"], note: string): void {
  st.log.push({ at: now.toISOString(), event: input.event, by: input.by ?? "", outcome, note });
  if (st.log.length > LOG_LIMIT) st.log.splice(0, st.log.length - LOG_LIMIT);
}

/** One status write, its dates and comment, then a read back. Returns an error text, or null when the tracker shows the new status. */
async function write(tracker: Tracker, ticket: string, st: StewardState, p: PendingWrite, now: Date, snap: TicketSnapshot): Promise<string | null> {
  try {
    if (!snap.statuses.includes(p.to)) return `status "${p.to}" is not on the list (${snap.statuses.join(", ")})`;
    await tracker.setStatus(ticket, p.to);
    if (p.start || p.due) await tracker.setDates(ticket, { start: p.start, due: p.due });
    if (p.comment) await tracker.addComment(ticket, p.comment);
    const back = await tracker.getTicket(ticket);
    if (back.status !== p.to) return `read back shows "${back.status}", wanted "${p.to}"`;
    st.status_written = p.to;
    st.status_seen = p.to;
    if (p.start) st.start_written = p.start;
    if (p.due) st.due_written = p.due;
    if (CLOSING.includes(p.to)) st.closed_at = now.toISOString();
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

function pendingOf(move: Move, st: StewardState, snap: TicketSnapshot, today: string): PendingWrite {
  const p: PendingWrite = { to: move.to };
  if (move.startDate && !st.start_written && !snap.startDate) p.start = today;
  if (move.dueDate) p.due = today;
  if (move.comment) p.comment = move.comment;
  return p;
}

function describe(ticket: string, from: string, r: ReturnType<typeof evaluate>): string {
  switch (r.kind) {
    case "move": return `${ticket}: ${from} -> ${r.to}`;
    case "record": return `${ticket}: records the merge, stays in ${from}`;
    case "noop": return `${ticket}: already there, nothing to do`;
    case "refuse": return `${ticket}: refused: ${r.reason}`;
  }
}

async function loadState(deps: EventDeps, tracker: Tracker, ticket: string, snap: TicketSnapshot): Promise<StewardState> {
  return readState(deps.dir, ticket) ?? rebuildState(ticket, TRACKER_NAME, snap, deps.sessionIds(ticket));
}

async function apply(deps: EventDeps, tracker: Tracker, ticket: string, input: EventInput): Promise<string[]> {
  const out: string[] = [];
  const now = deps.now();
  const today = todayUtc7(now);
  let snap = await tracker.getTicket(ticket);
  const st = await loadState(deps, tracker, ticket, snap);

  // Writes that failed earlier go first, in order.
  const stillPending: PendingWrite[] = [];
  for (const p of st.pending) {
    const err = await write(tracker, ticket, st, p, now, snap);
    if (err) stillPending.push(p);
    else out.push(`steward: ${ticket}: retried the earlier move to ${p.to}`);
  }
  st.pending = stillPending;
  if (st.pending.length === 0 && out.length > 0) snap = await tracker.getTicket(ticket);

  st.signoff = snap.signoff;
  st.status_seen = snap.status;
  const result = evaluate(input, viewOf(snap, st), deps.config);
  const stamp = `${input.event}:${input.sha ?? today}`;

  if (result.kind === "refuse") {
    log(st, now, input, "refused", result.reason);
    out.push(`steward: refused ${input.event}: ${ticket} ${result.reason}`);
  } else if (result.kind === "noop") {
    log(st, now, input, "noop", "already at the target");
  } else {
    if (GATE_EVENTS.includes(input.event)) {
      st.gates.push({ event: input.event, ...(input.answer ? { answer: input.answer } : {}), quote: input.quote!.trim(), by: input.by ?? "", at: now.toISOString() });
    }
    if (result.recordMerge) st.merged = { sha: input.sha ?? null, at: now.toISOString() };
    if (result.kind === "record") {
      log(st, now, input, "recorded", "merge recorded, no move");
      st.applied.push(stamp);
      out.push(`steward: ${describe(ticket, snap.status, result)}`);
    } else {
      const p = pendingOf(result, st, snap, today);
      const err = await write(tracker, ticket, st, p, now, snap);
      if (err === null) {
        log(st, now, input, "applied", `${snap.status} -> ${result.to}`);
        st.applied.push(stamp);
        out.push(`steward: ${describe(ticket, snap.status, result)}${p.start ? ` (start ${p.start})` : ""}${p.due ? ` (due ${p.due})` : ""}`);
      } else if (err.includes("is not on the list")) {
        log(st, now, input, "refused", err);
        out.push(`steward: refused ${input.event}: ${ticket} ${err}`);
      } else {
        st.pending.push(p);
        log(st, now, input, "pending", err);
        out.push(`steward: ${ticket}: could not move to ${result.to} (${err}); will retry at the next event`);
      }
    }
  }
  writeState(deps.dir, st);
  return out;
}

/** Applies one event. Returns the lines to print. Throws UsageError on a bad call; the caller handles every other error. */
export async function runEvent(deps: EventDeps, ticket: string, input: EventInput, dryRun = false): Promise<string[]> {
  assertUsage(input);
  const tracker = deps.tracker;
  if (!tracker) return [];
  if (dryRun) {
    const snap = await tracker.getTicket(ticket);
    const st = readState(deps.dir, ticket) ?? rebuildState(ticket, TRACKER_NAME, snap, []);
    return [`steward: dry run: ${describe(ticket, snap.status, evaluate(input, viewOf(snap, st), deps.config))}`];
  }
  const locked = await withLock(deps.dir, ticket, () => apply(deps, tracker, ticket, input), deps.lock ?? DEFAULT_LOCK);
  if (!locked.locked) return [`steward: ${ticket}: another call holds the lock; ${input.event} was not applied. Send it again.`];
  return locked.value;
}

/** Rebuilds the state file from the tracker and the token registry. ClickUp wins. */
export async function rebuild(deps: EventDeps, ticket: string): Promise<string[]> {
  const tracker = deps.tracker;
  if (!tracker) return [];
  const locked = await withLock(deps.dir, ticket, async () => {
    const snap = await tracker.getTicket(ticket);
    const before = readState(deps.dir, ticket);
    const st = rebuildState(ticket, TRACKER_NAME, snap, deps.sessionIds(ticket));
    if (before) { st.gates = before.gates; st.log = before.log; st.applied = before.applied; st.pending = before.pending; if (before.merged) st.merged = before.merged; }
    writeState(deps.dir, st);
    const note = before && before.status_written !== snap.status ? ` (the file said ${before.status_written}; ClickUp says ${snap.status})` : "";
    return [`steward: ${ticket}: state rebuilt, status ${snap.status}${note}`];
  }, deps.lock ?? DEFAULT_LOCK);
  return locked.locked ? locked.value : [`steward: ${ticket}: another call holds the lock; nothing rebuilt`];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/cli/src/steward/event.test.ts`
Expected: PASS. If one test fails, fix `event.ts`, not the test, unless the test contradicts the spec.

- [ ] **Step 5: Write the failing test `index.test.ts` (command wiring)**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildCli } from "../index.ts";
import { createStewardCommand } from "./index.ts";
import type { EventDeps } from "./event.ts";
import { FakeTracker, snapshot } from "./fake-tracker.test-util.ts";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import yargs from "yargs";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

function cli(tracker: FakeTracker | null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stidx-"));
  const deps = (): EventDeps => ({ tracker, dir, now: () => new Date("2026-10-18T05:00:00Z"), config: { releaseStage: false }, sessionIds: () => [] });
  return { dir, parse: (args: string[]) => yargs(args).command(createStewardCommand(deps)).strict().parseAsync() };
}

describe("dg steward", () => {
  it("is in the root help", async () => {
    const out: string[] = [];
    await new Promise<void>((resolve) => buildCli(["--help"]).parse(["--help"], {}, (_e, _a, o) => { out.push(o); resolve(); }));
    expect(out.join("")).toMatch(/steward/);
  });
  it("applies an event and prints the line", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await cli(t).parse(["steward", "event", "started", "--ticket", "DGS-1"]);
    expect(log.mock.calls.flat().join("\n")).toContain("to do -> in progress");
    expect(process.exitCode ?? 0).toBe(0);
  });
  it("a gate event without a quote is a usage error (exit 2)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(new FakeTracker(snapshot("refinement"))).parse(["steward", "event", "approved", "--ticket", "DGS-1"]);
    expect(process.exitCode).toBe(2);
    expect(err.mock.calls.flat().join("\n")).toMatch(/--quote/);
  });
  it("a tracker failure prints one line and exits 0", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.getTicket = async () => { throw new Error("network down"); };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(t).parse(["steward", "event", "started", "--ticket", "DGS-1"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(err.mock.calls.flat().join("\n")).toMatch(/network down/);
  });
  it("--dry-run writes nothing", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const c = cli(t);
    await c.parse(["steward", "event", "started", "--ticket", "DGS-1", "--dry-run"]);
    expect(log.mock.calls.flat().join("\n")).toMatch(/dry run/);
    expect(t.calls).toEqual([]);
  });
  it("with no tracker it is silent and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await cli(null).parse(["steward", "event", "started", "--ticket", "DGS-1"]);
    expect(log).not.toHaveBeenCalled();
    expect(process.exitCode ?? 0).toBe(0);
  });
  it("an unknown event name is rejected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(cli(null).parse(["steward", "event", "bogus", "--ticket", "DGS-1"])).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm vitest run packages/cli/src/steward/index.test.ts`
Expected: FAIL (`./index.ts` not found).

- [ ] **Step 7: Write `index.ts`**

```ts
import type { CommandModule } from "yargs";
import { createClient, DIGISMITH_SPACE_ID } from "../clickup/lib.ts";
import { createDepotRegistry } from "../tokens/registry.ts";
import { ClickUpTracker } from "./clickup-tracker.ts";
import { rebuild, runEvent, UsageError, type EventDeps } from "./event.ts";
import { readStewardProfile } from "./profile.ts";
import { stewardDir } from "./state.ts";
import { EVENTS, type EventName } from "./types.ts";

/** The real dependencies: the profile picks the tracker; none or an unbuilt one means no tracker. */
export function defaultDeps(): EventDeps {
  const profile = readStewardProfile(process.cwd());
  let tracker = null;
  if (profile.tracker === "clickup") tracker = new ClickUpTracker(createClient(), DIGISMITH_SPACE_ID);
  if (profile.tracker === "jira") console.error("steward: the JIRA tracker is not built yet; nothing done");
  return {
    tracker,
    dir: stewardDir(),
    now: () => new Date(),
    config: { releaseStage: profile.releaseStage },
    sessionIds: (ticket) =>
      createDepotRegistry().read(ticket).filter((e) => e.kind === "session").map((e) => e.session_id),
  };
}

function guarded(depsFactory: () => EventDeps, body: (deps: EventDeps) => Promise<string[]>): Promise<void> {
  return (async () => {
    try {
      for (const line of await body(depsFactory())) console.log(line);
      process.exitCode = 0;
    } catch (err) {
      if (err instanceof UsageError) {
        console.error(`steward: ${err.message}`);
        process.exitCode = 2;
      } else {
        console.error(`steward: ${(err as Error).message}`);
        process.exitCode = 0;
      }
    }
  })();
}

export function createStewardCommand(depsFactory: () => EventDeps = defaultDeps): CommandModule {
  return {
    command: "steward",
    describe: "keep ClickUp in step with the work: apply status events, file new ideas",
    builder: (y) =>
      y
        .command({
          command: "event <event>",
          describe: "apply one event to a ticket (the Steward moves the status along DGS-488's map)",
          builder: (e) =>
            e
              .positional("event", { type: "string", choices: [...EVENTS], demandOption: true })
              .option("ticket", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key, e.g. DGS-549" })
              .option("by", { type: "string", requiresArg: true, describe: "who sends it (kept in the log only)" })
              .option("sha", { type: "string", requiresArg: true, describe: "merge sha, for merged" })
              .option("answer", { type: "string", choices: ["yes", "no"], describe: "Jack's answer, for accepted" })
              .option("quote", { type: "string", requiresArg: true, describe: "Jack's own words; required for approved, accepted, discard and close" })
              .option("dry-run", { type: "boolean", default: false, describe: "print the move, write nothing" }),
          handler: (argv) =>
            guarded(depsFactory, (deps) =>
              runEvent(
                deps,
                argv.ticket as string,
                { event: argv.event as EventName, by: argv.by as string | undefined, sha: argv.sha as string | undefined, answer: argv.answer as "yes" | "no" | undefined, quote: argv.quote as string | undefined },
                argv.dryRun as boolean,
              )),
        })
        .command({
          command: "rebuild",
          describe: "rebuild a ticket's state file from ClickUp and the token registry",
          builder: (e) => e.option("ticket", { type: "string", requiresArg: true, demandOption: true }),
          handler: (argv) => guarded(depsFactory, (deps) => rebuild(deps, argv.ticket as string)),
        })
        .demandCommand(1, ""),
    handler: () => {},
  };
}

const stewardCommand = createStewardCommand();
export default stewardCommand;
```

Note: Task 5 adds the `file` subcommand to this builder.

- [ ] **Step 8: Register the command**

In `packages/cli/src/index.ts` add `import stewardCommand from "./steward/index.ts";` after the `sessionsCommand` import, and `.command(stewardCommand)` after `.command(sessionsCommand)`. In `packages/cli/src/index.test.ts` add `expect(help).toMatch(/steward/);` after the existing `tokens` expectation (line 17).

- [ ] **Step 9: Run the steward tests and the cli tests**

Run: `pnpm vitest run packages/cli`
Expected: PASS.

- [ ] **Step 10: Write `README.md` for the folder**

```markdown
# dg steward

Keeps ClickUp in step with the work (DGS-549). Not a session: each call loads one ticket's state file, acts, saves, ends.

    dg steward event <event> --ticket <KEY> [--by <who>] [--sha <sha>] [--answer yes|no] [--quote "<Jack's words>"] [--dry-run]
    dg steward rebuild --ticket <KEY>

State: `~/.digismith-depot/steward/<KEY>.json` (one per ticket; rebuildable; never removed in version 1).
The tracker comes from the profile (`tracker: clickup | jira | none`). `release_stage: true` turns on the `release` status.

| Event | From | Into |
|---|---|---|
| `concept-started` | backlog | concept |
| `discovery-started` | concept | discovery |
| `refinement-started` | concept, discovery | refinement |
| `approved` (gate, needs `--quote`) | refinement | to do |
| `started` | to do | in progress (start date) |
| `review-started` | in progress | review |
| `merged` | review | Sign-off Auto: done. Jack: acceptance. Unmarked: stays, records the merge |
| `verified` | review (merge recorded, unmarked) | done |
| `accepted --answer yes\|no` (gate, needs `--quote`) | acceptance | yes: done (release if on). no: refinement |
| `release-started` | review (Auto, merged), acceptance (accepted yes) | release |
| `released` | release | done |
| `documented` | done | documented |
| `discard`, `close` (need `--quote`) | any open status | discarded, Closed |

A non-zero exit (code 2) means a usage error only. Tracker or state failures print one line and exit 0.
Which skill or step sends which event is DGS-551.
```

- [ ] **Step 11: First live use: a read-only dry run against DGS-549**

Run (from the worktree, which has `.digismith/config.yml` and `profiles/digismith.yml`):

```bash
node --experimental-strip-types packages/cli/src/index.ts steward event started --ticket DGS-549 --dry-run
```

Expected: one line `steward: dry run: DGS-549: refused: started is valid from to do; the ticket is in refinement` (or the move line if Jack has already moved it to `to do`). No ticket is written and `~/.digismith-depot/steward/` gets no file. If it prints nothing, the profile read failed: check `readStewardProfile` against `.digismith/config.yml`.

- [ ] **Step 12: Commit**

```bash
git add packages/cli/src/steward/event.ts packages/cli/src/steward/event.test.ts packages/cli/src/steward/index.ts packages/cli/src/steward/index.test.ts packages/cli/src/steward/README.md packages/cli/src/index.ts packages/cli/src/index.test.ts
git commit -m "feat(dgs-549): add dg steward event and rebuild"
```

---

### Task 5: `dg steward file`: file and type new ideas

**Files:**
- Modify: `packages/clickup-client/src/client.ts` (add `searchTeamTasks`)
- Create: `packages/cli/src/steward/model.ts`
- Create: `packages/cli/src/steward/file.ts`
- Modify: `packages/cli/src/steward/index.ts` (add the `file` subcommand)
- Test: `packages/clickup-client/src/client.test.ts` (add a case), `packages/cli/src/steward/file.test.ts`, `packages/cli/src/steward/model.test.ts`

**Interfaces:**
- Consumes: `Tracker` (Task 3), `newState`, `writeState` (Task 2).
- Produces (exact):
  - `ClickUpClient.searchTeamTasks(spaceId: string, maxPages?: number): Promise<ClickUpTask[]>` — open tasks of one space, 100 per page, up to `maxPages` (default 10)
  - `type ModelRunner = (prompt: string) => Promise<string>`
  - `claudeRunner(exec?: ExecFn): ModelRunner`, `MODEL_ID = "claude-haiku-5-5"`
  - `interface ModelPick { duplicate_of: string | null; list: string; type: string; title: string }`
  - `buildPrompt(idea: string, targets: ListTarget[], candidates: Candidate[]): string`
  - `parsePick(raw: string, targets: ListTarget[], candidates: Candidate[]): ModelPick` (strict; throws)
  - `interface FileDeps { tracker: Tracker; runModel: ModelRunner; dir: string; now: () => Date }`
  - `fileIdea(deps: FileDeps, idea: string, opts?: { type?: string }): Promise<string[]>`

- [ ] **Step 1: Write the failing client test (in `client.test.ts`, following the file's existing mock-axios pattern)**

Read the first 60 lines of `packages/clickup-client/src/client.test.ts` and reuse its setup helper. Add:

```ts
describe("searchTeamTasks", () => {
  it("pages through the team task list of one space and stops at a short page", async () => {
    // helper names below are the ones already used in this file; adapt to the file's own setup helper
    const { client, requests } = makeClient([
      { tasks: Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` })) },
      { tasks: [{ id: "b0" }] },
    ]);
    const tasks = await client.searchTeamTasks("S1");
    expect(tasks).toHaveLength(101);
    expect(requests[0]).toMatchObject({ url: expect.stringContaining("/team/") });
    expect(requests[0].params).toMatchObject({ "space_ids[]": "S1", page: 0, include_closed: false });
    expect(requests[1].params).toMatchObject({ page: 1 });
  });
});
```

If the file has no helper that records request params, write the test with the same `vi.mock("axios")` style it already uses. The assertion that matters: query `space_ids[]=S1`, `include_closed=false`, `page=0,1`, and stop when a page has fewer than 100 tasks.

- [ ] **Step 2: Run, see it fail, then add `searchTeamTasks` to `client.ts` (next to `getAllListTasks`)**

```ts
  /** GET /team/{team_id}/task for one space: open tasks only, 100 per page, up to maxPages pages. */
  async searchTeamTasks(spaceId: string, maxPages = 10): Promise<ClickUpTask[]> {
    const all: ClickUpTask[] = [];
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<{ tasks: ClickUpTask[] }>(`/team/${this.teamId}/task`, {
        params: { "space_ids[]": spaceId, include_closed: false, subtasks: true, page },
      });
      all.push(...res.tasks);
      if (res.tasks.length < 100) break;
    }
    return all;
  }
```

Run: `pnpm vitest run packages/clickup-client/src/client.test.ts` — Expected: PASS.

- [ ] **Step 3: Write the failing tests `file.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildPrompt, parsePick, fileIdea, type FileDeps } from "./file.ts";
import { readState } from "./state.ts";
import { FakeTracker, snapshot } from "./fake-tracker.test-util.ts";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stfile-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const targets = [
  { id: "L5", name: "B.5: Autonomous Engineering", folder: "B: Agentic", description: "" },
  { id: "L0", name: "B.0: Pavilion", folder: "B: Agentic", description: "" },
];
const cands = [{ key: "DGS-3", name: "Steward role keeps sync", status: "refinement", list: "B.5" }];
function tracker() {
  const t = new FakeTracker(snapshot("backlog"));
  t.targets = targets;
  t.candidates = cands;
  return t;
}
const deps = (t: FakeTracker, reply: string | Error): FileDeps => ({
  tracker: t, dir, now: () => new Date("2026-10-18T05:00:00Z"),
  runModel: async () => { if (reply instanceof Error) throw reply; return reply; },
});
const pick = (o: object) => JSON.stringify({ duplicate_of: null, list: "L5", type: "Task", title: "Idea", ...o });

describe("buildPrompt", () => {
  it("names the idea, every list, every candidate, and the rules", () => {
    const p = buildPrompt("Add retries", targets, cands);
    expect(p).toContain("Add retries");
    expect(p).toContain("L5");
    expect(p).toContain("DGS-3");
    expect(p).toMatch(/Pavilion/);
    expect(p).toMatch(/JSON/);
  });
});

describe("parsePick", () => {
  it("accepts a valid pick, also inside a code fence", () => {
    expect(parsePick(pick({}), targets, cands).list).toBe("L5");
    expect(parsePick("```json\n" + pick({}) + "\n```", targets, cands).title).toBe("Idea");
  });
  it("rejects bad JSON, an unknown list, an unknown type, an unknown duplicate and a blank title", () => {
    for (const raw of ["nope", pick({ list: "ZZ" }), pick({ type: "Story" }), pick({ duplicate_of: "DGS-77" }), pick({ title: " " })])
      expect(() => parsePick(raw, targets, cands)).toThrow();
  });
  it("accepts a known duplicate", () => {
    expect(parsePick(pick({ duplicate_of: "DGS-3" }), targets, cands).duplicate_of).toBe("DGS-3");
  });
});

describe("fileIdea", () => {
  it("creates a backlog ticket in the chosen list and writes its state", async () => {
    const t = tracker();
    const lines = await fileIdea(deps(t, pick({ type: "Spike", title: "Try x" })), "try x");
    expect(t.created).toEqual([{ listId: "L5", name: "Try x", type: "Spike", description: "try x" }]);
    expect(lines[0]).toBe("steward: filed DGS-900 in B.5: Autonomous Engineering as Spike (backlog)");
    expect(readState(dir, "DGS-900")).toMatchObject({ status_written: "backlog", signoff: null });
  });
  it("an explicit --type wins over the model's", async () => {
    const t = tracker();
    await fileIdea(deps(t, pick({ type: "Task" })), "x", { type: "Bug" });
    expect(t.created[0].type).toBe("Bug");
  });
  it("a duplicate creates nothing and names the existing ticket", async () => {
    const t = tracker();
    const lines = await fileIdea(deps(t, pick({ duplicate_of: "DGS-3" })), "steward sync");
    expect(t.created).toEqual([]);
    expect(lines[0]).toContain("duplicate of DGS-3");
  });
  it("a model failure files a Task in the B.0 Pavilion with a comment", async () => {
    const t = tracker();
    const lines = await fileIdea(deps(t, new Error("model down")), "lost idea");
    expect(t.created[0]).toMatchObject({ listId: "L0", type: "Task", name: "lost idea" });
    expect(t.comments[0]).toMatch(/filed unsorted: model call failed/);
    expect(lines[0]).toContain("unsorted");
  });
  it("malformed model output takes the same fallback", async () => {
    const t = tracker();
    await fileIdea(deps(t, "I think it is a bug"), "lost idea");
    expect(t.created[0].listId).toBe("L0");
  });
  it("with no Pavilion to fall back to, a model failure throws", async () => {
    const t = tracker();
    t.targets = [targets[0]];
    await expect(fileIdea(deps(t, new Error("down")), "x")).rejects.toThrow(/no B\.0 Pavilion/);
  });
  it("rejects a blank idea and a type that is not one of the five", async () => {
    await expect(fileIdea(deps(tracker(), pick({})), "  ")).rejects.toThrow(/idea/);
    await expect(fileIdea(deps(tracker(), pick({})), "x", { type: "Story" })).rejects.toThrow(/type/);
  });
});
```

The fake's `createTicket` returns key `DGS-900`, and `addComment(key, …)` needs the key of the new ticket: `fileIdea` calls `tracker.addComment(created.key, …)`.

- [ ] **Step 4: Write `file.ts`**

```ts
import { newState, writeState } from "./state.ts";
import type { Candidate, ListTarget, Tracker } from "./tracker.ts";

export const TYPES = ["Task", "Bug", "Spike", "Epic", "Initiative"] as const;
export type ModelRunner = (prompt: string) => Promise<string>;

export interface ModelPick { duplicate_of: string | null; list: string; type: string; title: string }
export interface FileDeps { tracker: Tracker; runModel: ModelRunner; dir: string; now: () => Date }

export function buildPrompt(idea: string, targets: ListTarget[], candidates: Candidate[]): string {
  const lists = targets.map((t) => `- id ${t.id}: ${t.name} (folder ${t.folder || "none"})${t.description ? ` - ${t.description}` : ""}`).join("\n");
  const open = candidates.length ? candidates.map((c) => `- ${c.key}: ${c.name} [${c.status}, ${c.list}]`).join("\n") : "- none";
  return [
    "You file ideas into a ClickUp backlog. Answer with one JSON object and nothing else.",
    'Shape: {"duplicate_of": "<KEY or null>", "list": "<list id>", "type": "Task|Bug|Spike|Epic|Initiative", "title": "<short ticket title>"}',
    "Rules:",
    "- duplicate_of is a key from the open tickets below only when the idea is the same work. Otherwise null.",
    "- list is an id from the lists below. Pick the clan and lineage whose name fits best.",
    "- If no lineage fits, pick the clan's .0 Pavilion list. Agentic spikes and experiments go to clan B.",
    "- type: Bug for a defect, Spike for research or an experiment, Epic or Initiative only for a large body of work, else Task.",
    "",
    `Idea: ${idea}`,
    "",
    "Lists:",
    lists,
    "",
    "Open tickets that look similar:",
    open,
  ].join("\n");
}

export function parsePick(raw: string, targets: ListTarget[], candidates: Candidate[]): ModelPick {
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const v = JSON.parse(body) as Record<string, unknown>;
  if (typeof v !== "object" || v === null) throw new Error("model output is not an object");
  const { duplicate_of, list, type, title } = v;
  if (typeof list !== "string" || !targets.some((t) => t.id === list)) throw new Error(`model picked an unknown list: ${String(list)}`);
  if (typeof type !== "string" || !(TYPES as readonly string[]).includes(type)) throw new Error(`model picked an unknown type: ${String(type)}`);
  if (typeof title !== "string" || title.trim() === "") throw new Error("model gave no title");
  if (duplicate_of !== null && (typeof duplicate_of !== "string" || !candidates.some((c) => c.key === duplicate_of))) {
    throw new Error(`model named an unknown duplicate: ${String(duplicate_of)}`);
  }
  return { duplicate_of: duplicate_of as string | null, list, type, title: title.trim() };
}

export async function fileIdea(deps: FileDeps, idea: string, opts: { type?: string } = {}): Promise<string[]> {
  if (idea.trim() === "") throw new Error("idea is empty");
  if (opts.type !== undefined && !(TYPES as readonly string[]).includes(opts.type)) throw new Error(`type must be one of ${TYPES.join(", ")}`);
  const [targets, candidates] = await Promise.all([deps.tracker.listTargets(), deps.tracker.findCandidates(idea)]);

  let pick: ModelPick | null = null;
  let failure = "";
  try {
    pick = parsePick(await deps.runModel(buildPrompt(idea, targets, candidates)), targets, candidates);
  } catch (err) {
    failure = (err as Error).message;
  }

  if (pick?.duplicate_of) {
    const dup = candidates.find((c) => c.key === pick!.duplicate_of)!;
    return [`steward: duplicate of ${dup.key} (${dup.name}); nothing filed`];
  }

  let listId: string;
  let name: string;
  let type: string;
  if (pick) {
    listId = pick.list;
    name = pick.title;
    type = opts.type ?? pick.type;
  } else {
    const pavilion = targets.find((t) => /^B\.0\b/.test(t.name));
    if (!pavilion) throw new Error(`model call failed (${failure}) and there is no B.0 Pavilion to file into`);
    listId = pavilion.id;
    name = idea.trim().split("\n")[0].slice(0, 120);
    type = opts.type ?? "Task";
  }

  const created = await deps.tracker.createTicket({ listId, name, type, description: idea.trim() });
  const st = newState(created.key, "clickup");
  st.status_written = "backlog";
  st.status_seen = "backlog";
  st.log.push({ at: deps.now().toISOString(), event: "filed", by: "steward", outcome: "applied", note: `${listId} ${type}` });
  writeState(deps.dir, st);

  const where = targets.find((t) => t.id === listId)!.name;
  if (!pick) {
    await deps.tracker.addComment(created.key, `filed unsorted: model call failed (${failure}). Please re-sort.`);
    return [`steward: filed ${created.key} unsorted in ${where} as ${type} (backlog); the model call failed`];
  }
  return [`steward: filed ${created.key} in ${where} as ${type} (backlog)`];
}
```

- [ ] **Step 5: Write the failing test `model.test.ts`, then `model.ts`**

`model.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { claudeRunner, MODEL_ID } from "./model.ts";

describe("claudeRunner", () => {
  it("runs claude -p with the small model and returns the result text", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ result: '{"a":1}' }) });
    const out = await claudeRunner(exec)("PROMPT");
    expect(out).toBe('{"a":1}');
    const [cmd, args, opts] = exec.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toEqual(expect.arrayContaining(["-p", "--model", MODEL_ID, "--output-format", "json"]));
    expect(opts.input).toBe("PROMPT");
  });
  it("throws when the output has no result string", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "{}" });
    await expect(claudeRunner(exec)("p")).rejects.toThrow(/result/);
  });
});
```

`model.ts`:

```ts
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";

export const MODEL_ID = "claude-haiku-5-5";
const TIMEOUT_MS = 60_000;

export type ExecFn = (cmd: string, args: string[], opts: { input: string; cwd: string; timeout: number }) => Promise<{ stdout: string }>;

const realExec: ExecFn = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { cwd: opts.cwd, timeout: opts.timeout, maxBuffer: 4_000_000 }, (err, stdout) =>
      err ? reject(err) : resolve({ stdout: String(stdout) }));
    child.stdin?.end(opts.input);
  });

/** One headless call to the small model. No tools; the working directory is the temp folder so no project file loads. */
export function claudeRunner(exec: ExecFn = realExec): (prompt: string) => Promise<string> {
  return async (prompt) => {
    const { stdout } = await exec("claude", ["-p", "--model", MODEL_ID, "--output-format", "json", "--tools", ""], {
      input: prompt, cwd: tmpdir(), timeout: TIMEOUT_MS,
    });
    const parsed = JSON.parse(stdout) as { result?: unknown };
    if (typeof parsed.result !== "string") throw new Error("claude output has no result string");
    return parsed.result;
  };
}
```

- [ ] **Step 6: Verify the `claude` flags by hand once**

Run: `claude -p --model claude-haiku-5-5 --output-format json --tools "" "Reply with the single word ok" < /dev/null`
Expected: JSON with `"result":"ok"`. If `--tools` is rejected, replace `"--tools", ""` in `model.ts` with `"--disallowedTools", "Bash", "Edit", "Write", "Read", "Glob", "Grep", "WebFetch", "WebSearch"` and run again. The model id sits only in `MODEL_ID`.

- [ ] **Step 7: Add the `file` subcommand to `index.ts`**

Add imports `import { claudeRunner } from "./model.ts";` and `import { fileIdea } from "./file.ts";`, and add this command after the `rebuild` command in the builder chain:

```ts
        .command({
          command: "file <idea>",
          describe: "file a new idea into the backlog: picks the list, the type and checks for a duplicate",
          builder: (e) =>
            e
              .positional("idea", { type: "string", demandOption: true })
              .option("type", { type: "string", choices: ["Task", "Bug", "Spike", "Epic", "Initiative"], describe: "force the type" }),
          handler: (argv) =>
            guarded(depsFactory, async (deps) => {
              if (!deps.tracker) return [];
              return fileIdea({ tracker: deps.tracker, runModel: claudeRunner(), dir: deps.dir, now: deps.now }, argv.idea as string, { type: argv.type as string | undefined });
            }),
        })
```

Add one case to `index.test.ts`: `dg steward file "x" --type Bug` with a `FakeTracker` that has targets and a stub — to keep the real model out of the test, make `createStewardCommand` take a second optional argument `runModel: ModelRunner = claudeRunner()` and pass it through to `fileIdea`. Update the call site accordingly. The test passes a stub runner returning a valid pick and asserts the printed line starts with `steward: filed DGS-900`.

- [ ] **Step 8: Run all steward and client tests, then the whole suite**

Run: `pnpm vitest run packages/cli packages/clickup-client && pnpm vitest run`
Expected: PASS.

- [ ] **Step 9: Live check (read-only plus one model call)**

Run a dry look at what the model would pick, without creating anything: write a throwaway call in the scratchpad, not in the repo, that builds the prompt for the idea "add retries to dg clickup writes" with the real `listTargets` and `findCandidates`, runs `claudeRunner()`, and prints `parsePick`'s result. Expected: a valid pick (a B or F list, type Task) or a clear parse error. Do not call `createTicket`. Report the pick in the commit body or the final report. If `listTargets` returns lists with empty descriptions only, say so: it limits the pick to list names.

- [ ] **Step 10: Commit**

```bash
git add packages/clickup-client/src/client.ts packages/clickup-client/src/client.test.ts packages/cli/src/steward
git commit -m "feat(dgs-549): add dg steward file with the small-model pick"
```

---

### Task 6: `dg clickup time-in-status` (D.3 task; its own ticket, independent of Tasks 1-5)

**Files:**
- Create: `packages/cli/src/clickup/time-in-status.ts`
- Modify: `packages/cli/src/clickup/index.ts` (import and `.command(timeInStatusCommand)`)
- Test: `packages/cli/src/clickup/time-in-status.test.ts`

**Interfaces:**
- Consumes: `createClient`, `resolveTaskId` (`./refs.ts`), `ClickUpClient.get`.
- Produces: `createTimeInStatusCommand(clientFactory?)`, `timeInStatusCommand`. Output: the raw JSON of `GET /task/{id}/time_in_status`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createTimeInStatusCommand } from "./time-in-status.ts";
import { handlerOf } from "./handler-of.test-util.ts";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

const reply = { current_status: { status: "refinement", total_time: { by_minute: 12 } }, status_history: [{ status: "concept", total_time: { by_minute: 30 } }] };
function client() {
  return { getTaskByRef: vi.fn().mockResolvedValue({ id: "abc" }), get: vi.fn().mockResolvedValue(reply) } as unknown as ClickUpClient;
}

describe("clickup time-in-status", () => {
  it("resolves the key and prints the time in each status", async () => {
    const c = client();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await handlerOf(createTimeInStatusCommand(() => c))({ task: "DGS-549" });
    expect(c.get).toHaveBeenCalledWith("/task/abc/time_in_status");
    expect(JSON.parse(log.mock.calls[0][0])).toEqual(reply);
    expect(process.exitCode).toBe(0);
  });
  it("prints the error and exits 1 when ClickUp refuses (for example the ClickApp is off)", async () => {
    const c = { getTaskByRef: vi.fn().mockResolvedValue({ id: "abc" }), get: vi.fn().mockRejectedValue(new Error("Time in Status is not enabled")) } as unknown as ClickUpClient;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await handlerOf(createTimeInStatusCommand(() => c))({ task: "DGS-549" });
    expect(err.mock.calls[0][0]).toBe("clickup time-in-status: Time in Status is not enabled");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/cli/src/clickup/time-in-status.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Write `time-in-status.ts`**

```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { resolveTaskId } from "./refs.ts";

export function createTimeInStatusCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "time-in-status <task>",
    describe: "read how long a ClickUp task spent in each status (Time in Status)",
    builder: (y) =>
      y.positional("task", { type: "string", demandOption: true, describe: "ClickUp task ID or key like DGS-549" }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const id = await resolveTaskId(client, argv.task as string);
        console.log(JSON.stringify(await client.get(`/task/${id}/time_in_status`), null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup time-in-status: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const timeInStatusCommand: CommandModule = createTimeInStatusCommand();
```

- [ ] **Step 4: Register it**

In `packages/cli/src/clickup/index.ts` add `import { timeInStatusCommand } from "./time-in-status.ts";` and `.command(timeInStatusCommand)` after `.command(getTaskCommand)`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/cli` — Expected: PASS.

- [ ] **Step 6: Live check (read-only)**

Run: `node --experimental-strip-types packages/cli/src/index.ts clickup time-in-status DGS-549`
Expected: JSON with `current_status` and `status_history`, or the one-line error with exit 1 if the ClickApp is not enabled on the workspace. Report which one happened.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/clickup/time-in-status.ts packages/cli/src/clickup/time-in-status.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(dgs-549): add dg clickup time-in-status"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| 1 Goal, version 1 scope | Tasks 1-5 |
| 2 Architecture: `rules.ts`, `state.ts`, `tracker.ts`, `event.ts`, `file.ts`, the `tracker` profile field | Tasks 1, 2, 3, 4, 5 |
| 3 Events, whole map, gates, done rules, release stage, dates, closing | Task 1 (rules), Task 4 (apply, dates, `closed_at`). The removal check is not built, as the spec says: the file stays |
| 4 State file, rebuild, lock, state log, bad file moved aside | Task 2, Task 4 (`rebuild`, log) |
| 5 Filing: gather, one model call, create, fallback to the Pavilion | Task 5 |
| 6 Callers are DGS-551 | no task, by design; the command contract is Task 4 |
| 7 Errors: failed write to pending, read back, status not on the list, ticket not found, bad state | Task 4 (tests for each). "Ticket not found" prints the client error and exits 0 through `guarded` |
| 8 Testing | each task carries its tests; a dry run is Task 4 Step 11 |
| 10 D.3 gaps: Time in Status, `tracker` and `release_stage` profile fields | Task 6, Task 2. The Sign-off field task is gone: DGS-552 made it |

Spec point not built, on purpose: the lock timeout puts nothing in `pending` (see "Deviation from the spec"). The removal of state files at close is also not built: the spec says the check returns false in version 1, and a check that always returns false is not code, so no code exists for it.

**2. Placeholder scan.** No TBD or TODO. Two steps depend on a fact the plan cannot know: Task 5 Step 1 reuses the client test file's own setup helper, and Task 5 Step 6 checks the `claude --tools` flag, with the exact fallback flags written out.

**3. Type consistency.** `EventInput`, `TicketView`, `Config`, `RuleResult` are defined in Task 1 and used unchanged in Tasks 2 and 4. `TicketSnapshot` (Task 3) feeds `rebuildState`'s `snap` parameter (Task 2) by shape, and the `FakeTracker` (Task 3) is used by Tasks 4 and 5. `PendingWrite` is `{ to, start?, due?, comment? }` in Task 2 and in Task 4's `pendingOf` and `write`. `LogEntry.outcome` values `applied | refused | noop | pending | recorded` match the calls in `event.ts` and `file.ts`. `createStewardCommand`'s second argument `runModel` is added in Task 5 Step 7; Task 4's tests call it with one argument, which still works.

**Execution handoff.** Six tasks, five of them touching the same package in sequence: use `digismith:subagent-driven-development` with Tasks 1-5 on this ticket's branch, in order. Task 6 touches different files and has no dependency, so it can be built in parallel as its own ticket.
