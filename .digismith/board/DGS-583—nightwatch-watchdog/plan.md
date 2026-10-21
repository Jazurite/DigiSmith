# Nightwatch watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plain-code watchdog reads the DGS-581 run record every 5 minutes, puts blocked, stalled and lost runs on an attention list, comments once on the ticket, and adds the circuit breaker, the failure causes and one bounded retry.

**Architecture:** `packages/cli/src/autonomous/` gets a pure `watchdog.ts` (`classify`, `phaseOf`, `decideRetry`) and small I/O modules around it: `budgets.ts`, `attention.ts`, `notify.ts`, `breaker.ts`, `causes.ts`, `pane.ts`, `watch.ts`. `dg autonomous watch|attention|resume` wrap them (yargs, in the DGS-486 group). One new `defineJob` entry runs `watch` every 5 minutes in the existing Nexus scheduler. No new service, no model tokens.

**Tech Stack:** Node 24 with `--experimental-strip-types`, TypeScript, yargs, vitest, pnpm.

Spec: `.digismith/board/DGS-583—nightwatch-watchdog/design.html`. Read it first.

## Global Constraints

- Classifier: `classify(run, events, pane, now, budgets) -> { state, cause, since }`, state `healthy | blocked | stalled | lost | ended`, no I/O, no clock of its own. `pane` is `present | gone | unknown`.
- Check order: `ended`, pane `gone` (lost), `blocked`, silence of 30 minutes (lost), `stalled`, else `healthy`. `pane: 'unknown'` alone never makes a run lost.
- `blocked` = the last `blocked` event has no later `tool` or `turn_end`.
- Review clock: it restarts at each new ticket-scope review pack (Maestro, 2026-10-22). The DGS-582 controller writes a new `phase` event (`data.phase: review`) per pack, and the latest one is the start, so a fix wave is not a stall. The watchdog does not detect packs itself.
- Phase: the latest `phase` event (`data.phase` is `building|review|merge`) sets phase and start; without one a `builder` run is `building` and a `reviewer` run is `review` from `started` (else `created_at`); `scout` and `other` have no phase and are never `stalled`. A builder's `review_ready` starts a new `building` clock at the next `tool` event. `merged` ends the merge phase.
- Budgets in `.digismith/config.yml` under `nightwatch.budgets` (minutes): defaults `building: 45`, `review: 60`, `merge: 20`. A bad value gives one attention item (kind `failed`, cause `bad-budget-config`, run `-`) and the default for that value. The watchdog is never turned off by it.
- Watch: every open run in `<depot>/runs/*/*/` (root `$DIGISMITH_DEPOT_DIR`, else `~/.digismith-depot`), not only autonomous ones; runs created more than 7 days ago with no `ended` are skipped. A broken run directory is skipped. Exit 0 unless the depot root cannot be read.
- Registry entry: name `nightwatch-watchdog`, `atUtc7: '00:00'`, `windowEndUtc7: '23:59'`, `everyMinutes: 5`, `catchUp: 'skip'`, `manualOutsideWindow: 'allowed'`, `timeoutMs` 2 minutes, `notify: 'failures'`, `order: 40`.
- Attention file: `<autonomousDir>/attention.jsonl` (`AUTONOMOUS_DIR` overrides). Append only. Open line: `{schema:"nightwatch-attention/v1", id:"<run>.<kind>.<n>", ts, ticket, run, kind, cause, since}` plus, when known, `causeClass` and `retryEligible`, kind `blocked|stalled|lost|refused|failed|unknown`. Resolved line: `{schema, id, ts, resolved:true, by:"watchdog"|"jack", note}`. One open item per (run, kind); `n` counts earlier resolved items of that pair. The watchdog auto-resolves only `blocked` and `stalled`.
- Notify: one `dg clickup add-comment --task <ticket> --text .. --yes` per new item; at most one per ticket and kind per hour and 10 per pass; state in `<autonomousDir>/notify-state.json` (temp file and rename). A failed or limited comment stays unsent and is retried. No comment for a ticket-less item.
- Breaker: `<autonomousDir>/breaker.json` `{open, streak, failed, openedAt}`. `release --result failed` adds 1; `merged` resets to 0; `stopped` and `awaiting-jack` change nothing; every failed release counts. Streak 2 opens it. `autonomous-scan` exits `breaker` (no claim, no ClickUp call) while open; a malformed file counts as open. `dg autonomous back` and `dg autonomous resume` close it.
- Causes (`causes.ts`): transient `gateway-5xx`, `gateway-timeout`, `rate-limited`, `pane-died`, `tab-lost`; durable `classifier-block`, `merge-refused`, `test-red`, `review-rejected`, `spec-gap`; unknown `unknown`. A code outside the list, or none, is recorded as `unknown` with a warning; the release never fails because of it.
- Retry (decided by the Maestro, 2026-10-22): there is **no automatic retry in DGS-583** and **no journal write** from the watchdog or from `release` (an open planned line that nothing consumes would make the DGS-582 reconcile raise attention on every tick). The retry is the follow-up DGS-588. `decideRetry(kind, causeClass, retriesUsed)` stays as a pure function (Task 2 built it); the attention item records `retryEligible` (`decideRetry(kind, class, 0) === 'retry'`) and `causeClass`, so DGS-588 can act on them. A `lost` run is retry-eligible; so is a `failed` release with a transient cause.
- The watchdog never answers a prompt, never sends keys to a pane, never kills a process, never deletes or rewrites a file. Herdr access is one read-only `herdr-ws pane list` per workspace.
- Write only inside this worktree and the board folder. No push, no merge, no ClickUp write in tests (a fake `dg` records comments), no sudo, no launchctl, no new service. pnpm only. Never read or print a token, key or `.env` value.
- Style: double quotes and semicolons in `packages/cli`, single quotes and no semicolons in `scripts/nexus-api` (follow each file's own style). Commits are title-only, conventional, no AI attribution.
- Out of scope: the night mandate hook (DGS-584), merge and cleanup safety (DGS-585), the UI (DGS-586), push and email (DGS-448).

## Files

```
packages/cli/src/autonomous/
  watchdog.ts        classify(), phaseOf(), decideRetry()   (pure)
  budgets.ts         readBudgets() -> { budgets, problems }
  attention.ts       appendOpen(), appendResolved(), readOpen(), formatOpen()
  notify.ts          notifyNew()
  breaker.ts         readBreaker(), recordRelease(), closeBreaker(), isOpen()
  causes.ts          CAUSES, classOfCause(), normalizeCause()
  pane.ts            panesByWorkspace()  (the one herdr call)
  watch.ts           runWatch()
  index.ts           (DGS-486 file) add: watch, attention, attention resolve, resume; release --cause
  scan.ts, release.ts, report.ts   (DGS-486 files) breaker check, cause handling, Attention block
  *.test.ts
scripts/conductor/attention-section.ts (+test)   the catch-up block
scripts/conductor/cli.ts                          append the block to the consult output
scripts/nexus-api/src/scheduler/registry.ts       one entry
.digismith/board/DGS-583—nightwatch-watchdog/preflight.md   Task 1 findings
.digismith/board/DGS-583—nightwatch-watchdog/runbook-text.md  conductor text (the Maestro applies it)
```

Run tests with `pnpm vitest run packages/cli/src/autonomous`.

### Task 1: Preflight (read only)

**Files:**
- Create: `.digismith/board/DGS-583—nightwatch-watchdog/preflight.md`

**Interfaces:**
- Produces: the three facts every later task relies on. If any answer is "no", stop and tell the conductor; do not guess.

- [ ] **Step 1: Check the three inputs are on `main` (or in the branch you build on)**

Run, read only:
```bash
git log --oneline -3 -- packages/cli/src/run packages/cli/src/autonomous
test -f packages/cli/src/run/read.ts && echo run-ok
grep -n '"phase"' packages/cli/src/run/events.ts
test -f packages/cli/src/autonomous/release.ts && echo autonomous-ok
ls packages/cli/src/autonomous | head -40
```
Expected: `run-ok` (DGS-581: `listRuns`, `readEvents`, `readRun`, `depotDir`), a line naming the `phase` event type (DGS-581 Task 7), `autonomous-ok` (DGS-486: `scan.ts`, `release.ts`, `report.ts`, `index.ts`, `state.ts` with `autonomousDir`, `appendEvent`). DGS-582 must also be merged: find its journal module (`ls packages/cli/src/autonomous packages/cli/src/nightwatch 2>/dev/null`, read its spec in `.digismith/board/DGS-582—*/design.html`) and note the exact path and the two functions that (a) count the retries of a ticket and (b) append a `planned` entry for a retry.

- [ ] **Step 2: Check the herdr pane list shape**

Run: `HERDR_WS=w2 ~/.digismith-depot/bin/herdr-ws pane list | head -c 600`
Expected: JSON `{"id":..,"result":{"panes":[{"pane_id":"w2:p1",...}]},"type":"pane_list"}`. A pane id in `run.json` `herdr.pane` is that same `pane_id` form (check with `dg run show <a real run id>` if a run exists; else DGS-581's `design.html` says `"pane":"<id>"`). Record the finding. Read only: no send, no kill, no other verb.

- [ ] **Step 3: Write `preflight.md` and commit**

Content: a table (item, answer, source command): DGS-581 on main with `phase`; DGS-486 on main; the pane list shape; the `dg` entry path used by the registry (`grep -n "DG\b" scripts/nexus-api/src/scheduler/registry.ts`). No token, key or `.env` value.
```bash
git add ".digismith/board/DGS-583—nightwatch-watchdog/preflight.md"
git commit -m "docs(dgs-583): record the preflight findings" -- ".digismith/board/DGS-583—nightwatch-watchdog/preflight.md"
```
If DGS-581, DGS-486 or DGS-582 is not merged: **stop and tell the conductor.** Task 2 and later write code on top of them.

### Task 2: The pure classifier

**Files:**
- Create: `packages/cli/src/autonomous/watchdog.ts`
- Test: `packages/cli/src/autonomous/watchdog.test.ts`

**Interfaces:**
- Consumes: `RunRecord` and `EventLine` types from `packages/cli/src/run/record.ts` and `events.ts` (DGS-581).
- Produces:
```ts
export type Pane = "present" | "gone" | "unknown";
export type State = "healthy" | "blocked" | "stalled" | "lost" | "ended";
export interface Budgets { building: number; review: number; merge: number } // minutes
export interface Verdict { state: State; cause: string; since: string } // since: ISO UTC; "" when healthy or ended
export const SILENCE_MS = 30 * 60_000;
export const DEFAULT_BUDGETS: Budgets = { building: 45, review: 60, merge: 20 };
export function phaseOf(run: RunRecord, events: EventLine[]): { phase: "building" | "review" | "merge"; since: string } | null;
export function classify(run: RunRecord, events: EventLine[], pane: Pane, now: number, budgets: Budgets): Verdict;
export type CauseClass = "transient" | "durable" | "unknown";
export function decideRetry(kind: string, causeClass: CauseClass, retriesUsed: number): "retry" | "attention";
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { classify, decideRetry, DEFAULT_BUDGETS, phaseOf } from "./watchdog.ts";

const T0 = Date.parse("2026-10-21T10:00:00Z");
const min = (m: number) => new Date(T0 + m * 60_000).toISOString();
const run = (role = "builder") => ({
  schema: "nightwatch-run/v1", run: "builder-x", ticket: "DGS-1", role, order: null, seat: null, model: null,
  plugin_version: null, base_sha: null, branch: null, worktree: null,
  herdr: { workspace: "w2", tab: null, pane: "w2:p1" }, budget: null, created_at: min(0),
}) as never;
let seq = 0;
const ev = (type: string, m: number, data: Record<string, unknown> = {}) =>
  ({ schema: "nightwatch-event/v1", seq: ++seq, ts: min(m), run: "builder-x", type, data }) as never;
const at = (m: number) => T0 + m * 60_000;

describe("classify", () => {
  it("ended wins over everything", () => {
    expect(classify(run(), [ev("started", 0), ev("ended", 5)], "gone", at(500), DEFAULT_BUDGETS).state).toBe("ended");
  });
  it("a gone pane is lost, even when blocked", () => {
    const v = classify(run(), [ev("started", 0), ev("blocked", 1)], "gone", at(2), DEFAULT_BUDGETS);
    expect(v.state).toBe("lost");
    expect(v.cause).toBe("pane-gone");
  });
  it("blocked beats silence", () => {
    const v = classify(run(), [ev("started", 0), ev("blocked", 1)], "present", at(120), DEFAULT_BUDGETS);
    expect(v.state).toBe("blocked");
    expect(v.since).toBe(min(1));
  });
  it("a later tool or turn_end ends the blocked state", () => {
    for (const t of ["tool", "turn_end"]) {
      expect(classify(run(), [ev("started", 0), ev("blocked", 1), ev(t, 2)], "present", at(3), DEFAULT_BUDGETS).state).toBe("healthy");
    }
  });
  it("silence: 29:59 is healthy, 30:00 is lost", () => {
    const e = [ev("started", 0), ev("tool", 1)];
    expect(classify(run(), e, "present", at(1) + 30 * 60_000 - 1000, DEFAULT_BUDGETS).state).toBe("healthy");
    const v = classify(run(), e, "present", at(1) + 30 * 60_000, DEFAULT_BUDGETS);
    expect(v.state).toBe("lost");
    expect(v.cause).toBe("silent-30-min");
  });
  it("an unknown pane never makes a run lost by itself", () => {
    expect(classify(run(), [ev("started", 0), ev("tool", 1)], "unknown", at(2), DEFAULT_BUDGETS).state).toBe("healthy");
  });
  it("no events: silence counts from created_at", () => {
    expect(classify(run(), [], "present", at(29), DEFAULT_BUDGETS).state).toBe("healthy");
    expect(classify(run(), [], "present", at(31), DEFAULT_BUDGETS).state).toBe("lost");
  });
  it("stalled at the building budget edge (45 min), kept alive by tool events", () => {
    const e = [ev("started", 0), ev("tool", 44)];
    expect(classify(run(), e, "present", at(45), DEFAULT_BUDGETS).state).toBe("healthy");
    const v = classify(run(), [ev("started", 0), ev("tool", 44)], "present", at(46), DEFAULT_BUDGETS);
    expect(v.state).toBe("stalled");
    expect(v.cause).toBe("building-over-45-min");
  });
  it("a reviewer uses the review budget (60 min)", () => {
    const e = [ev("started", 0), ev("tool", 59)];
    expect(classify(run("reviewer"), e, "present", at(60), DEFAULT_BUDGETS).state).toBe("healthy");
    expect(classify(run("reviewer"), e, "present", at(61), DEFAULT_BUDGETS).state).toBe("stalled");
  });
  it("a phase event sets the phase and its start (merge, 20 min)", () => {
    const e = [ev("started", 0), ev("phase", 10, { phase: "merge" }), ev("tool", 29)];
    expect(classify(run(), e, "present", at(30), DEFAULT_BUDGETS).state).toBe("healthy");
    const v = classify(run(), e, "present", at(31), DEFAULT_BUDGETS);
    expect(v.state).toBe("stalled");
    expect(v.cause).toBe("merge-over-20-min");
  });
  it("merged ends the merge phase", () => {
    const e = [ev("started", 0), ev("phase", 10, { phase: "merge" }), ev("merged", 12), ev("tool", 50)];
    expect(classify(run(), e, "present", at(51), DEFAULT_BUDGETS).state).toBe("healthy");
  });
  it("a builder review_ready restarts the building clock at the next tool event", () => {
    const e = [ev("started", 0), ev("review_ready", 40), ev("tool", 70)];
    expect(classify(run(), e, "present", at(99), { ...DEFAULT_BUDGETS }).state).toBe("healthy");
    expect(phaseOf(run(), e)?.since).toBe(min(70));
  });
  it("a scout and an other run are never stalled", () => {
    for (const r of ["scout", "other"]) {
      expect(classify(run(r), [ev("started", 0), ev("tool", 600)], "present", at(601), DEFAULT_BUDGETS).state).toBe("healthy");
    }
  });
  it("a new review phase event restarts the review clock (fix wave is not a stall)", () => {
    const e = [ev("started", 0), ev("phase", 1, { phase: "review" }), ev("tool", 59), ev("phase", 70, { phase: "review", scope: "ticket" }), ev("tool", 125)];
    expect(classify(run(), e, "present", at(126), DEFAULT_BUDGETS).state).toBe("healthy");   // 56 min after the second pack
    expect(classify(run(), e, "present", at(131), DEFAULT_BUDGETS).state).toBe("stalled");   // 61 min after it
    expect(phaseOf(run(), e)?.since).toBe(min(70));
  });
  it("a custom budget is used", () => {
    expect(classify(run(), [ev("started", 0), ev("tool", 5)], "present", at(6), { building: 5, review: 60, merge: 20 }).state).toBe("stalled");
  });
});

describe("decideRetry", () => {
  it("retries once for transient or lost, never for durable, unknown, blocked or stalled", () => {
    expect(decideRetry("failed", "transient", 0)).toBe("retry");
    expect(decideRetry("lost", "unknown", 0)).toBe("retry");
    expect(decideRetry("failed", "transient", 1)).toBe("attention");
    expect(decideRetry("lost", "unknown", 1)).toBe("attention");
    expect(decideRetry("failed", "durable", 0)).toBe("attention");
    expect(decideRetry("failed", "unknown", 0)).toBe("attention");
    expect(decideRetry("blocked", "transient", 0)).toBe("attention");
    expect(decideRetry("stalled", "transient", 0)).toBe("attention");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/cli/src/autonomous/watchdog.test.ts`
Expected: FAIL (`./watchdog.ts` not found).

- [ ] **Step 3: Write the implementation**

```ts
import type { EventLine } from "../run/events.ts";
import type { RunRecord } from "../run/record.ts";

export type Pane = "present" | "gone" | "unknown";
export type State = "healthy" | "blocked" | "stalled" | "lost" | "ended";
export type CauseClass = "transient" | "durable" | "unknown";
export interface Budgets { building: number; review: number; merge: number }
export interface Verdict { state: State; cause: string; since: string }

export const SILENCE_MS = 30 * 60_000;
export const DEFAULT_BUDGETS: Budgets = { building: 45, review: 60, merge: 20 };

type Phase = "building" | "review" | "merge";
const PHASES: readonly string[] = ["building", "review", "merge"];

const ms = (iso: string): number => Date.parse(iso);

/** The phase and when it started, from the events; null when the run has no phase (scout, other). */
export function phaseOf(run: RunRecord, events: EventLine[]): { phase: Phase; since: string } | null {
  let phase: Phase | null = null;
  let since = "";
  let explicit = false;
  const started = events.find((e) => e.type === "started");
  if (run.role === "builder") { phase = "building"; since = started?.ts ?? run.created_at; }
  else if (run.role === "reviewer") { phase = "review"; since = started?.ts ?? run.created_at; }
  let afterReadyTool = false;
  for (const e of events) {
    if (e.type === "phase" && typeof e.data.phase === "string" && PHASES.includes(e.data.phase)) {
      phase = e.data.phase as Phase; since = e.ts; explicit = true; afterReadyTool = false;
    } else if (e.type === "merged" && phase === "merge") {
      phase = null;
    } else if (e.type === "review_ready" && run.role === "builder" && !explicit) {
      afterReadyTool = true;
    } else if (e.type === "tool" && afterReadyTool) {
      phase = "building"; since = e.ts; afterReadyTool = false;
    }
  }
  return phase ? { phase, since } : null;
}

export function classify(run: RunRecord, events: EventLine[], pane: Pane, now: number, budgets: Budgets): Verdict {
  if (events.some((e) => e.type === "ended")) return { state: "ended", cause: "", since: "" };
  const last = events.length ? events[events.length - 1] : null;
  const lastTs = last ? ms(last.ts) : ms(run.created_at);
  if (pane === "gone") return { state: "lost", cause: "pane-gone", since: last?.ts ?? run.created_at };

  let lastBlocked = -1;
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === "blocked") { lastBlocked = i; break; }
  if (lastBlocked >= 0 && !events.slice(lastBlocked + 1).some((e) => e.type === "tool" || e.type === "turn_end")) {
    return { state: "blocked", cause: "waiting-for-answer", since: events[lastBlocked].ts };
  }

  if (now - lastTs >= SILENCE_MS) return { state: "lost", cause: "silent-30-min", since: last?.ts ?? run.created_at };

  const p = phaseOf(run, events);
  if (p && now - ms(p.since) > budgets[p.phase] * 60_000) {
    return { state: "stalled", cause: `${p.phase}-over-${budgets[p.phase]}-min`, since: p.since };
  }
  return { state: "healthy", cause: "", since: "" };
}

/** Whether a run or release is eligible for one retry. DGS-583 only records the answer (retryEligible); DGS-588 acts on it and supplies retriesUsed. */
export function decideRetry(kind: string, causeClass: CauseClass, retriesUsed: number): "retry" | "attention" {
  if (retriesUsed > 0) return "attention";
  return (kind === "failed" && causeClass === "transient") || kind === "lost" ? "retry" : "attention";
}
```

Note the `"phase"` event type is typed `string` on `EventLine.type`, so no cast is needed.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/cli/src/autonomous/watchdog.test.ts`
Expected: PASS. If the "stalled at 45 min" case fails because `tool` at minute 44 keeps the run alive, remember: the phase clock is the phase start, not the last event; the test is right, check `since`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/watchdog.ts packages/cli/src/autonomous/watchdog.test.ts
git commit -m "feat(dgs-583): add the pure watchdog classifier"
```

### Task 3: Budgets from the config file

**Files:**
- Create: `packages/cli/src/autonomous/budgets.ts`
- Test: `packages/cli/src/autonomous/budgets.test.ts`

**Interfaces:**
- Consumes: `Budgets`, `DEFAULT_BUDGETS` from `watchdog.ts`.
- Produces:
```ts
export function readBudgets(cwd: string): { budgets: Budgets; problems: string[] };
```
`problems` has one short sentence per bad value (or one for a block that cannot be read). The function never throws and never returns less than the three defaults.

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBudgets } from "./budgets.ts";
import { DEFAULT_BUDGETS } from "./watchdog.ts";

function repo(config: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), "nw-budgets-"));
  mkdirSync(join(dir, ".digismith"));
  if (config !== null) writeFileSync(join(dir, ".digismith", "config.yml"), config);
  return dir;
}

describe("readBudgets", () => {
  it("no file, no block: the defaults and no problem", () => {
    expect(readBudgets(repo(null))).toEqual({ budgets: DEFAULT_BUDGETS, problems: [] });
    expect(readBudgets(repo("profile: x\n"))).toEqual({ budgets: DEFAULT_BUDGETS, problems: [] });
  });
  it("overrides one value", () => {
    const r = readBudgets(repo("profile: x\nnightwatch:\n  budgets:\n    merge: 30\n"));
    expect(r.budgets).toEqual({ building: 45, review: 60, merge: 30 });
    expect(r.problems).toEqual([]);
  });
  it("a bad value gives one problem and the default", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    building: abc\n    review: -5\n    merge: 15\n"));
    expect(r.budgets).toEqual({ building: 45, review: 60, merge: 15 });
    expect(r.problems).toHaveLength(2);
  });
  it("a key that is not building, review or merge is a problem", () => {
    const r = readBudgets(repo("nightwatch:\n  budgets:\n    deploy: 5\n"));
    expect(r.budgets).toEqual(DEFAULT_BUDGETS);
    expect(r.problems).toHaveLength(1);
  });
  it("a config that cannot be read gives the defaults", () => {
    expect(readBudgets("/no/such/dir")).toEqual({ budgets: DEFAULT_BUDGETS, problems: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/cli/src/autonomous/budgets.test.ts`
Expected: FAIL (`./budgets.ts` not found).

- [ ] **Step 3: Write the implementation**

The repo has no YAML library in `packages/cli`; read the block by indentation, like `steward/profile.ts` reads its scalars.

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BUDGETS, type Budgets } from "./watchdog.ts";

const KEYS = ["building", "review", "merge"] as const;

export function readBudgets(cwd: string): { budgets: Budgets; problems: string[] } {
  const budgets: Budgets = { ...DEFAULT_BUDGETS };
  const problems: string[] = [];
  let text: string;
  try { text = readFileSync(join(cwd, ".digismith", "config.yml"), "utf-8"); } catch { return { budgets, problems }; }
  const lines = text.split(/\r?\n/);
  const nw = lines.findIndex((l) => /^nightwatch:\s*(#.*)?$/.test(l));
  if (nw < 0) return { budgets, problems };
  let i = nw + 1;
  while (i < lines.length && !/^\s+budgets:\s*(#.*)?$/.test(lines[i])) {
    if (/^\S/.test(lines[i])) return { budgets, problems };
    i++;
  }
  for (i++; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(#.*)?$/.test(l)) continue;
    if (!/^\s{4,}\S/.test(l)) break;
    const m = /^\s+([A-Za-z_]+):[ \t]*([^#\r\n]*?)[ \t]*(#.*)?$/.exec(l);
    if (!m) { problems.push(`nightwatch.budgets: line "${l.trim()}" is not "key: minutes"; defaults kept`); continue; }
    const [, key, raw] = m;
    if (!(KEYS as readonly string[]).includes(key)) { problems.push(`nightwatch.budgets.${key}: not a phase (building, review, merge); ignored`); continue; }
    if (!/^[1-9]\d*$/.test(raw)) { problems.push(`nightwatch.budgets.${key}: "${raw}" is not a positive whole number of minutes; default ${DEFAULT_BUDGETS[key as keyof Budgets]} used`); continue; }
    budgets[key as keyof Budgets] = Number(raw);
  }
  return { budgets, problems };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/cli/src/autonomous/budgets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/budgets.ts packages/cli/src/autonomous/budgets.test.ts
git commit -m "feat(dgs-583): read the phase budgets from the config"
```

### Task 4: Attention list and notify

**Extend, do not fork (Maestro, 2026-10-22).** DGS-582 already writes `attention.jsonl` through `appendAttention` in `attention-write.ts`. Widen that file: its `kind` accepts all six `AttentionKind` values, it takes an optional `since`, `causeClass` and `retryEligible` (written only when given), and it takes `ticket: string | null`. Add `appendResolved` there too. Existing `attention-write.test.ts` cases stay green and unchanged. `attention.ts` below keeps `appendOpen` as a thin wrapper over `appendAttention` (the single writer of open lines) and owns reading and formatting. `appendOpen` returns the new item, or null when `appendAttention` answered `exists`.

**Files:**
- Create: `packages/cli/src/autonomous/attention.ts`, `packages/cli/src/autonomous/notify.ts`
- Test: `packages/cli/src/autonomous/attention.test.ts`, `packages/cli/src/autonomous/notify.test.ts`

**Interfaces:**
- Consumes: `autonomousDir(env)` from `state.ts` (DGS-486).
- Produces:
```ts
// attention.ts
export type AttentionKind = "blocked" | "stalled" | "lost" | "refused" | "failed" | "unknown";
export interface OpenItem { id: string; ts: string; ticket: string | null; run: string; kind: AttentionKind; cause: string; since: string; causeClass?: "transient" | "durable" | "unknown"; retryEligible?: boolean }
export function attentionFile(dir: string): string;
export function readOpen(dir: string): OpenItem[];                       // open = no later resolved line with the same id; oldest first; bad lines skipped
export function appendOpen(dir: string, i: Omit<OpenItem, "id" | "ts"> & { ts: string }): OpenItem | null;  // null when (run, kind) is already open
export function appendResolved(dir: string, id: string, by: "watchdog" | "jack", ts: string, note?: string): boolean;  // false when the id is not open
export function formatOpen(items: OpenItem[], now: number): string;      // "none" or one line per item with since in UTC+7 and age
// notify.ts
export type RunDg = (args: string[]) => Promise<{ ok: boolean }>;
export interface NotifyDeps { dir: string; now: () => number; runDg: RunDg }
export async function notifyNew(d: NotifyDeps, items: OpenItem[]): Promise<{ sent: number; pending: number }>;
```

- [ ] **Step 1: Write the failing tests**

`attention.test.ts`:
```ts
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendOpen, appendResolved, attentionFile, formatOpen, readOpen } from "./attention.ts";

const dir = () => mkdtempSync(join(tmpdir(), "nw-att-"));
const base = { ticket: "DGS-1", run: "builder-a", kind: "blocked" as const, cause: "waiting-for-answer", since: "2026-10-21T10:00:00.000Z", ts: "2026-10-21T10:05:00.000Z" };

describe("attention", () => {
  it("opens one item per (run, kind): a second append returns null and writes nothing", () => {
    const d = dir();
    expect(appendOpen(d, base)?.id).toBe("builder-a.blocked.0");
    expect(appendOpen(d, base)).toBeNull();
    expect(readFileSync(attentionFile(d), "utf-8").trim().split("\n")).toHaveLength(1);
    expect(readOpen(d)).toHaveLength(1);
  });
  it("a resolved item is closed, and a reopened problem gets the next n", () => {
    const d = dir();
    const a = appendOpen(d, base)!;
    expect(appendResolved(d, a.id, "watchdog", "2026-10-21T10:10:00.000Z")).toBe(true);
    expect(readOpen(d)).toHaveLength(0);
    expect(appendOpen(d, { ...base, ts: "2026-10-21T11:00:00.000Z" })?.id).toBe("builder-a.blocked.1");
  });
  it("resolving an unknown or closed id returns false and writes nothing", () => {
    const d = dir();
    expect(appendResolved(d, "nope.lost.0", "jack", "2026-10-21T10:00:00.000Z")).toBe(false);
    const a = appendOpen(d, base)!;
    appendResolved(d, a.id, "jack", "2026-10-21T10:01:00.000Z");
    const before = readFileSync(attentionFile(d), "utf-8");
    expect(appendResolved(d, a.id, "jack", "2026-10-21T10:02:00.000Z")).toBe(false);
    expect(readFileSync(attentionFile(d), "utf-8")).toBe(before);
  });
  it("skips a line that does not parse and keeps the rest", () => {
    const d = dir();
    appendOpen(d, base);
    appendFileSync(attentionFile(d), "{not json\n");
    appendOpen(d, { ...base, run: "builder-b" });
    expect(readOpen(d).map((i) => i.run)).toEqual(["builder-a", "builder-b"]);
  });
  it("a ticket-less item is allowed", () => {
    const d = dir();
    expect(appendOpen(d, { ...base, ticket: null, run: "-", kind: "failed", cause: "bad-budget-config" })?.ticket).toBeNull();
  });
  it("formatOpen prints none, or one line per item with UTC+7 time", () => {
    const d = dir();
    expect(formatOpen([], Date.now())).toBe("none");
    appendOpen(d, base);
    const out = formatOpen(readOpen(d), Date.parse("2026-10-21T10:30:00Z"));
    expect(out).toContain("builder-a.blocked.0");
    expect(out).toContain("2026-10-21 17:00");  // 10:00 UTC is 17:00 UTC+7
    expect(out).toContain("30m");
  });
  it("never rewrites the file: earlier bytes stay", () => {
    const d = dir();
    appendOpen(d, base);
    const first = readFileSync(attentionFile(d), "utf-8");
    appendOpen(d, { ...base, run: "builder-z" });
    expect(readFileSync(attentionFile(d), "utf-8").startsWith(first)).toBe(true);
  });
});
```

`notify.test.ts`:
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenItem } from "./attention.ts";
import { notifyNew } from "./notify.ts";

const item = (n: number, over: Partial<OpenItem> = {}): OpenItem => ({
  id: `r${n}.lost.0`, ts: "2026-10-21T10:00:00.000Z", ticket: `DGS-${n}`, run: `r${n}`, kind: "lost", cause: "pane-gone", since: "2026-10-21T10:00:00.000Z", ...over,
});
const setup = (ok = true) => {
  const calls: string[][] = [];
  const t = { now: Date.parse("2026-10-21T10:05:00Z") };
  const d = { dir: mkdtempSync(join(tmpdir(), "nw-notify-")), now: () => t.now, runDg: async (a: string[]) => { calls.push(a); return { ok }; } };
  return { d, calls, t };
};

describe("notifyNew", () => {
  it("one add-comment per new item with the ticket, UTC+7 time and --yes", async () => {
    const { d, calls } = setup();
    expect(await notifyNew(d, [item(1)])).toEqual({ sent: 1, pending: 0 });
    expect(calls[0].slice(0, 4)).toEqual(["clickup", "add-comment", "--task", "DGS-1"]);
    expect(calls[0]).toContain("--yes");
    expect(calls[0].join(" ")).toContain("17:00");
  });
  it("the same item is not sent twice", async () => {
    const { d, calls } = setup();
    await notifyNew(d, [item(1)]);
    await notifyNew(d, [item(1)]);
    expect(calls).toHaveLength(1);
  });
  it("one per ticket and kind per hour; a limited item stays pending and goes out after the hour", async () => {
    const { d, calls, t } = setup();
    await notifyNew(d, [item(1)]);
    expect(await notifyNew(d, [item(1, { id: "r9.lost.0", run: "r9" })])).toEqual({ sent: 0, pending: 1 });
    t.now += 3601_000;
    expect(await notifyNew(d, [item(1, { id: "r9.lost.0", run: "r9" })])).toEqual({ sent: 1, pending: 0 });
    expect(calls).toHaveLength(2);
  });
  it("at most 10 comments in one pass", async () => {
    const { d, calls } = setup();
    const r = await notifyNew(d, Array.from({ length: 12 }, (_, i) => item(i + 1)));
    expect(r).toEqual({ sent: 10, pending: 2 });
    expect(calls).toHaveLength(10);
  });
  it("a failing dg keeps the item pending and it is retried next pass", async () => {
    const bad = setup(false);
    expect(await notifyNew(bad.d, [item(1)])).toEqual({ sent: 0, pending: 1 });
    const good = { ...bad.d, runDg: async () => ({ ok: true }) };
    expect(await notifyNew(good, [item(1)])).toEqual({ sent: 1, pending: 0 });
  });
  it("a ticket-less item gets no comment and is not pending", async () => {
    const { d, calls } = setup();
    expect(await notifyNew(d, [item(1, { ticket: null, run: "-", kind: "failed" })])).toEqual({ sent: 0, pending: 0 });
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run packages/cli/src/autonomous/attention.test.ts packages/cli/src/autonomous/notify.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `attention.ts`**

```ts
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type AttentionKind = "blocked" | "stalled" | "lost" | "refused" | "failed" | "unknown";
export interface OpenItem { id: string; ts: string; ticket: string | null; run: string; kind: AttentionKind; cause: string; since: string }
const SCHEMA = "nightwatch-attention/v1";

export const attentionFile = (dir: string): string => join(dir, "attention.jsonl");

interface Line { id?: string; resolved?: boolean; [k: string]: unknown }

function lines(dir: string): Line[] {
  let text: string;
  try { text = readFileSync(attentionFile(dir), "utf-8"); } catch { return []; }
  const out: Line[] = [];
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    try { const o = JSON.parse(l) as Line; if (o && typeof o.id === "string") out.push(o); } catch { /* skip a line that does not parse */ }
  }
  return out;
}

export function readOpen(dir: string): OpenItem[] {
  const all = lines(dir);
  const closed = new Set(all.filter((l) => l.resolved === true).map((l) => l.id));
  return all.filter((l) => l.resolved !== true && !closed.has(l.id)) as unknown as OpenItem[];
}

function write(dir: string, o: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(attentionFile(dir), JSON.stringify({ schema: SCHEMA, ...o }) + "\n");
}

export function appendOpen(dir: string, i: Omit<OpenItem, "id" | "ts"> & { ts: string }): OpenItem | null {
  if (readOpen(dir).some((o) => o.run === i.run && o.kind === i.kind)) return null;
  const n = lines(dir).filter((l) => l.resolved !== true && l.run === i.run && l.kind === i.kind).length;
  const item: OpenItem = { id: `${i.run}.${i.kind}.${n}`, ts: i.ts, ticket: i.ticket, run: i.run, kind: i.kind, cause: i.cause, since: i.since };
  write(dir, { ...item });
  return item;
}

export function appendResolved(dir: string, id: string, by: "watchdog" | "jack", ts: string, note = ""): boolean {
  if (!readOpen(dir).some((o) => o.id === id)) return false;
  write(dir, { id, ts, resolved: true, by, note });
  return true;
}

const utc7 = (ms: number): string => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

export function formatOpen(items: OpenItem[], now: number): string {
  if (!items.length) return "none";
  return items
    .map((i) => {
      const age = Math.max(0, Math.round((now - Date.parse(i.since)) / 60_000));
      const ageText = age >= 60 ? `${Math.floor(age / 60)}h${String(age % 60).padStart(2, "0")}m` : `${age}m`;
      return `${i.id}  ${i.ticket ?? "-"}  ${i.kind}  ${i.cause}  since ${utc7(Date.parse(i.since))} (UTC+7)  ${ageText}`;
    })
    .join("\n");
}
```

- [ ] **Step 4: Write `notify.ts`**

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenItem } from "./attention.ts";

export type RunDg = (args: string[]) => Promise<{ ok: boolean }>;
export interface NotifyDeps { dir: string; now: () => number; runDg: RunDg }

const HOUR_MS = 3600_000;
const MAX_PER_PASS = 10;

interface State { sent: string[]; last: Record<string, number> }

function load(dir: string): State {
  try {
    const s = JSON.parse(readFileSync(join(dir, "notify-state.json"), "utf-8")) as State;
    return { sent: Array.isArray(s.sent) ? s.sent : [], last: s.last && typeof s.last === "object" ? s.last : {} };
  } catch { return { sent: [], last: {} }; }
}

function save(dir: string, s: State): void {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `notify-state.json.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(s));
  renameSync(tmp, join(dir, "notify-state.json"));
}

const utc7 = (ms: number): string => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

export async function notifyNew(d: NotifyDeps, items: OpenItem[]): Promise<{ sent: number; pending: number }> {
  const st = load(d.dir);
  let sent = 0;
  let pending = 0;
  for (const it of items) {
    if (it.ticket === null || st.sent.includes(it.id)) continue;
    const key = `${it.ticket}:${it.kind}`;
    const limited = d.now() - (st.last[key] ?? -Infinity) < HOUR_MS;
    if (limited || sent >= MAX_PER_PASS) { pending++; continue; }
    const text = `Nightwatch ${it.kind}: run ${it.run}, ${it.cause}, since ${utc7(Date.parse(it.since))} (UTC+7). Needs Jack.`;
    let ok = false;
    try { ok = (await d.runDg(["clickup", "add-comment", "--task", it.ticket, "--text", text, "--yes"])).ok; } catch { ok = false; }
    if (!ok) { pending++; continue; }
    st.sent.push(it.id);
    st.last[key] = d.now();
    sent++;
  }
  save(d.dir, st);
  return { sent, pending };
}
```

- [ ] **Step 5: Run to verify they pass, then commit**

Run: `pnpm vitest run packages/cli/src/autonomous/attention.test.ts packages/cli/src/autonomous/notify.test.ts`
Expected: PASS.
```bash
git add packages/cli/src/autonomous/attention.ts packages/cli/src/autonomous/attention.test.ts packages/cli/src/autonomous/notify.ts packages/cli/src/autonomous/notify.test.ts
git commit -m "feat(dgs-583): add the attention list and ticket notify"
```

### Task 5: Failure causes and the breaker

**Files:**
- Create: `packages/cli/src/autonomous/causes.ts`, `breaker.ts`
- Test: `causes.test.ts`, `breaker.test.ts`

**Interfaces:**
- Consumes: `CauseClass` from `watchdog.ts`.
- Produces:
```ts
// causes.ts
export const CAUSES: Record<string, CauseClass>;               // the fixed list
export function classOfCause(code: string): CauseClass;        // a code not in the list: "unknown"
export function normalizeCause(code: string | undefined): { code: string; warning: string | null };  // outside the list or missing: { code: "unknown", warning }
// breaker.ts
export interface Breaker { open: boolean; streak: number; failed: string[]; openedAt: string | null }
export function readBreaker(dir: string): Breaker;             // no file: closed, streak 0; a file that does not parse: open (fail closed)
export function isOpen(dir: string): boolean;
export function recordRelease(dir: string, a: { ticket: string; result: "merged" | "failed" | "stopped" | "awaiting-jack" }, now: Date): { opened: boolean; breaker: Breaker };
export function closeBreaker(dir: string): void;               // open false, streak 0, failed []
```

- [ ] **Step 1: Write the failing tests**

`causes.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CAUSES, classOfCause, normalizeCause } from "./causes.ts";

describe("causes", () => {
  it("the fixed list has the spec codes in the right classes", () => {
    for (const c of ["gateway-5xx", "gateway-timeout", "rate-limited", "pane-died", "tab-lost"]) expect(CAUSES[c]).toBe("transient");
    for (const c of ["classifier-block", "merge-refused", "test-red", "review-rejected", "spec-gap"]) expect(CAUSES[c]).toBe("durable");
    expect(CAUSES["unknown"]).toBe("unknown");
    expect(Object.keys(CAUSES)).toHaveLength(11);
  });
  it("a classifier block is durable", () => expect(classOfCause("classifier-block")).toBe("durable"));
  it("a code outside the list, or none, is unknown with a warning", () => {
    expect(normalizeCause("weird")).toEqual({ code: "unknown", warning: expect.stringContaining("weird") });
    expect(normalizeCause(undefined).code).toBe("unknown");
    expect(normalizeCause("test-red")).toEqual({ code: "test-red", warning: null });
    expect(classOfCause("weird")).toBe("unknown");
  });
});
```

`breaker.test.ts`:
```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closeBreaker, isOpen, readBreaker, recordRelease } from "./breaker.ts";

const dir = () => mkdtempSync(join(tmpdir(), "nw-brk-"));
const now = new Date("2026-10-21T10:00:00Z");
const fail = (d: string, t: string) => recordRelease(d, { ticket: t, result: "failed" }, now);

describe("breaker", () => {
  it("no file: closed", () => expect(readBreaker(dir())).toEqual({ open: false, streak: 0, failed: [], openedAt: null }));
  it("two failures in sequence open it and say so once", () => {
    const d = dir();
    expect(fail(d, "DGS-1").opened).toBe(false);
    const r = fail(d, "DGS-2");
    expect(r.opened).toBe(true);
    expect(isOpen(d)).toBe(true);
    expect(readBreaker(d).failed).toEqual(["DGS-1", "DGS-2"]);
    expect(fail(d, "DGS-3").opened).toBe(false);   // already open: not announced again
  });
  it("a merged release resets the streak", () => {
    const d = dir();
    fail(d, "DGS-1");
    recordRelease(d, { ticket: "DGS-2", result: "merged" }, now);
    fail(d, "DGS-3");
    expect(isOpen(d)).toBe(false);
  });
  it("stopped and awaiting-jack change nothing", () => {
    const d = dir();
    fail(d, "DGS-1");
    recordRelease(d, { ticket: "DGS-2", result: "stopped" }, now);
    recordRelease(d, { ticket: "DGS-3", result: "awaiting-jack" }, now);
    expect(readBreaker(d).streak).toBe(1);
  });
  it("a file that does not parse is open (fail closed)", () => {
    const d = dir();
    writeFileSync(join(d, "breaker.json"), "{oops");
    expect(isOpen(d)).toBe(true);
  });
  it("closeBreaker closes it and clears the streak", () => {
    const d = dir();
    fail(d, "DGS-1"); fail(d, "DGS-2");
    closeBreaker(d);
    expect(readBreaker(d)).toEqual({ open: false, streak: 0, failed: [], openedAt: null });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run packages/cli/src/autonomous/causes.test.ts packages/cli/src/autonomous/breaker.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `causes.ts`**

```ts
import type { CauseClass } from "./watchdog.ts";

/** The fixed list. A classifier block is durable by rule: only Jack can fix it. */
export const CAUSES: Record<string, CauseClass> = {
  "gateway-5xx": "transient",
  "gateway-timeout": "transient",
  "rate-limited": "transient",
  "pane-died": "transient",
  "tab-lost": "transient",
  "classifier-block": "durable",
  "merge-refused": "durable",
  "test-red": "durable",
  "review-rejected": "durable",
  "spec-gap": "durable",
  unknown: "unknown",
};

export const classOfCause = (code: string): CauseClass => (Object.hasOwn(CAUSES, code) ? CAUSES[code] : "unknown");

export function normalizeCause(code: string | undefined): { code: string; warning: string | null } {
  if (code === undefined || code === "") return { code: "unknown", warning: "no --cause given; recorded as unknown" };
  if (!Object.hasOwn(CAUSES, code)) return { code: "unknown", warning: `cause "${code}" is not in the list (${Object.keys(CAUSES).join(", ")}); recorded as unknown` };
  return { code, warning: null };
}
```

- [ ] **Step 4: Write `breaker.ts`**

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Breaker { open: boolean; streak: number; failed: string[]; openedAt: string | null }
const CLOSED = (): Breaker => ({ open: false, streak: 0, failed: [], openedAt: null });
const file = (dir: string): string => join(dir, "breaker.json");

export function readBreaker(dir: string): Breaker {
  let text: string;
  try { text = readFileSync(file(dir), "utf-8"); } catch { return CLOSED(); }
  try {
    const b = JSON.parse(text) as Breaker;
    if (typeof b.open !== "boolean" || typeof b.streak !== "number" || !Array.isArray(b.failed)) throw new Error("shape");
    return { open: b.open, streak: b.streak, failed: b.failed.map(String), openedAt: b.openedAt ?? null };
  } catch {
    return { open: true, streak: 0, failed: [], openedAt: null };   // a file that does not parse fails closed
  }
}

export const isOpen = (dir: string): boolean => readBreaker(dir).open;

function write(dir: string, b: Breaker): void {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `breaker.json.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(b));
  renameSync(tmp, file(dir));
}

export function recordRelease(
  dir: string,
  a: { ticket: string; result: "merged" | "failed" | "stopped" | "awaiting-jack" },
  now: Date,
): { opened: boolean; breaker: Breaker } {
  const b = readBreaker(dir);
  if (a.result === "merged") { const n = { ...b, streak: 0, failed: [] }; write(dir, n); return { opened: false, breaker: n }; }
  if (a.result !== "failed") return { opened: false, breaker: b };
  const n: Breaker = { ...b, streak: b.streak + 1, failed: [...b.failed, a.ticket] };
  let opened = false;
  if (n.streak >= 2 && !n.open) { n.open = true; n.openedAt = now.toISOString(); opened = true; }
  write(dir, n);
  return { opened, breaker: n };
}

export function closeBreaker(dir: string): void {
  write(dir, CLOSED());
}
```

- [ ] **Step 5: Run, then commit**

Run: `pnpm vitest run packages/cli/src/autonomous/causes.test.ts packages/cli/src/autonomous/breaker.test.ts`
Expected: PASS.
```bash
git add packages/cli/src/autonomous/causes.ts packages/cli/src/autonomous/causes.test.ts packages/cli/src/autonomous/breaker.ts packages/cli/src/autonomous/breaker.test.ts
git commit -m "feat(dgs-583): add failure causes and the breaker"
```

### Task 6: The watch pass

**Files:**
- Create: `packages/cli/src/autonomous/pane.ts`, `packages/cli/src/autonomous/watch.ts`
- Test: `packages/cli/src/autonomous/pane.test.ts`, `packages/cli/src/autonomous/watch.test.ts`

**Interfaces:**
- Consumes: `listRuns(env, ticket?)` and `readEvents(runDir)` from `run/read.ts` and `run/events.ts` (DGS-581; check in preflight whether `RunRow` carries the run directory, and if not use `findRunDir(runId, env)` from `run/paths.ts`), `classify`, `decideRetry`, `Budgets` (Task 2), `readBudgets` (Task 3), attention and notify (Task 4), `classOfCause` (Task 5).
- Produces:
```ts
// pane.ts
export type PaneLookup = (workspace: string) => Promise<Set<string> | null>;   // null: herdr did not answer
export function herdrPaneLookup(exec?: (workspace: string) => Promise<{ code: number; stdout: string }>): PaneLookup;
// watch.ts
export interface WatchDeps {
  env: NodeJS.ProcessEnv; dir: string; cwd: string; now: () => number;
  panes: PaneLookup; runDg: RunDg; dryRun: boolean;
}
export interface WatchResult { lines: string[]; opened: number; resolved: number; commented: number }
export async function runWatch(d: WatchDeps): Promise<WatchResult>;
```

- [ ] **Step 1: Write the failing tests**

`pane.test.ts`: `herdrPaneLookup` with a fake `exec` returning `{ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1"},{"pane_id":"w2:p7P"}]}}' }` gives a Set with both ids; a non-zero code, non-JSON stdout, and a throwing exec each give `null`; the real default exec is `execFile` of `/Users/workbox/.digismith-depot/bin/herdr-ws` with args `["pane","list"]` and env `HERDR_WS=<workspace>` (assert the args and env the injected `execFile` stub receives by testing a small exported `buildHerdrCall(workspace)` returning `{ file, args, env }`).

`watch.test.ts` builds a temp depot with `DIGISMITH_DEPOT_DIR` and `AUTONOMOUS_DIR` pointed at temp dirs, writes `run.json` and `events.jsonl` by hand (use DGS-581's `createRun` and `appendEvent` from `run/record.ts` and `run/events.ts` if they accept a custom `now`; otherwise write the JSON directly, matching the `nightwatch-run/v1` and `nightwatch-event/v1` shapes), and checks, with a fake clock and a fake `PaneLookup`:
- A depot with one healthy, one blocked, one stalled (builder, `started` 50 min ago, a `tool` 1 min ago), one lost (pane absent from the lookup) and one ended run gives **4 open items** (blocked, stalled, lost; the healthy and ended runs give none), then exactly **3** comments (one per ticket and kind; give each run its own ticket), and a **second pass adds no item and no comment**.
- A blocked run that gets a `tool` event: the next pass writes a `resolved` line (by `watchdog`) and `opened` is 0, `resolved` is 1. A `lost` item is **not** auto-resolved when the run later looks healthy.
- `dryRun: true`: prints the same lines, writes no file in `dir` and calls `runDg` zero times.
- A run created 8 days ago with no `ended` is skipped. A run directory with a broken `run.json` is skipped and the pass goes on.
- `panes` returning `null` for a workspace: runs of that workspace get `pane: "unknown"`; a healthy run stays healthy.
- A run with `herdr.workspace` `null` gets `pane: "unknown"`.
- A bad budget block in `<cwd>/.digismith/config.yml`: one open item (kind `failed`, cause `bad-budget-config`, run `-`, ticket `null`, **no comment**); the pass still classifies with defaults; a second pass adds no second item.
- Retry: no journal read and no journal write. A `lost` item has `retryEligible: true` and `causeClass: "unknown"`; `blocked` and `stalled` items have `retryEligible: false`. The watchdog starts no worker: the fake `runDg` only ever receives `clickup add-comment` calls (assert on every call's first two args). A test asserts the pass creates no `journal.jsonl` in the dir.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run packages/cli/src/autonomous/pane.test.ts packages/cli/src/autonomous/watch.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `pane.ts`**

```ts
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export type PaneLookup = (workspace: string) => Promise<Set<string> | null>;
type Exec = (workspace: string) => Promise<{ code: number; stdout: string }>;

export function buildHerdrCall(workspace: string, env: NodeJS.ProcessEnv = process.env): { file: string; args: string[]; env: NodeJS.ProcessEnv } {
  return { file: join(homedir(), ".digismith-depot", "bin", "herdr-ws"), args: ["pane", "list"], env: { ...env, HERDR_WS: workspace } };
}

const realExec: Exec = (workspace) =>
  new Promise((resolve) => {
    const c = buildHerdrCall(workspace);
    execFile(c.file, c.args, { env: c.env, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const code = err && typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : err ? 1 : 0;
      resolve({ code, stdout: String(stdout ?? "") });
    });
  });

/** One read-only `pane list` per workspace. null means herdr did not answer, never "the pane is gone". */
export function herdrPaneLookup(exec: Exec = realExec): PaneLookup {
  return async (workspace) => {
    try {
      const r = await exec(workspace);
      if (r.code !== 0) return null;
      const j = JSON.parse(r.stdout) as { result?: { panes?: { pane_id?: unknown }[] } };
      const panes = j.result?.panes;
      if (!Array.isArray(panes)) return null;
      return new Set(panes.map((p) => String(p.pane_id)));
    } catch { return null; }
  };
}
```

- [ ] **Step 4: Write `watch.ts`**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listRuns } from "../run/read.ts";
import { appendOpen, appendResolved, readOpen, type AttentionKind, type OpenItem } from "./attention.ts";
import { readBudgets } from "./budgets.ts";
import { classOfCause } from "./causes.ts";
import { notifyNew, type RunDg } from "./notify.ts";
import type { PaneLookup } from "./pane.ts";
import { classify, decideRetry, type Pane } from "./watchdog.ts";

export interface WatchDeps {
  env: NodeJS.ProcessEnv; dir: string; cwd: string; now: () => number;
  panes: PaneLookup; runDg: RunDg; dryRun: boolean;
}
export interface WatchResult { lines: string[]; opened: number; resolved: number; commented: number }

const RETENTION_MS = 7 * 24 * 3600_000;
const AUTO: AttentionKind[] = ["blocked", "stalled"];

export async function runWatch(d: WatchDeps): Promise<WatchResult> {
  const res: WatchResult = { lines: [], opened: 0, resolved: 0, commented: 0 };
  const nowMs = d.now();
  const nowIso = new Date(nowMs).toISOString();
  const { budgets, problems } = readBudgets(d.cwd);
  const newItems: OpenItem[] = [];
  const open = (i: Omit<OpenItem, "id" | "ts">): void => {
    if (d.dryRun) { if (!readOpen(d.dir).some((o) => o.run === i.run && o.kind === i.kind)) res.opened++; return; }
    const item = appendOpen(d.dir, { ...i, ts: nowIso });
    if (item) { res.opened++; newItems.push(item); }
  };

  for (const p of problems) {
    res.lines.push(`config: ${p}`);
    open({ ticket: null, run: "-", kind: "failed", cause: "bad-budget-config", since: nowIso });
  }

  const paneCache = new Map<string, Set<string> | null>();
  const paneOf = async (ws: string | null, pane: string | null): Promise<Pane> => {
    if (!ws || !pane) return "unknown";
    if (!paneCache.has(ws)) paneCache.set(ws, await d.panes(ws));
    const set = paneCache.get(ws);
    return set ? (set.has(pane) ? "present" : "gone") : "unknown";
  };

  const rows = listRuns(d.env);   // newest first; a broken run directory is already skipped by the reader
  for (const { record, events } of rowsWithEvents(rows)) {
    if (nowMs - Date.parse(record.created_at) > RETENTION_MS && !events.some((e) => e.type === "ended")) continue;
    const pane = await paneOf(record.herdr.workspace, record.herdr.pane);
    const v = classify(record, events, pane, nowMs, budgets);
    const openItems = readOpen(d.dir);
    if (v.state === "ended" || v.state === "healthy") {
      for (const it of openItems.filter((o) => o.run === record.run && AUTO.includes(o.kind))) {
        if (!d.dryRun) appendResolved(d.dir, it.id, "watchdog", nowIso, `run is ${v.state} again`);
        res.resolved++;
      }
      continue;
    }
    // blocked or stalled that moved on: close the other auto kind
    for (const it of openItems.filter((o) => o.run === record.run && AUTO.includes(o.kind) && o.kind !== v.state)) {
      if (!d.dryRun) appendResolved(d.dir, it.id, "watchdog", nowIso, `run is ${v.state} now`);
      res.resolved++;
    }
    open({ ticket: record.ticket, run: record.run, kind: v.state as AttentionKind, cause: v.cause, since: v.since, retryEligible: decideRetry(v.state, "unknown", 0) === "retry", causeClass: "unknown" });
    res.lines.push(`${record.run}  ${record.ticket}  ${v.state}  ${v.cause}`);
  }

  if (!d.dryRun) {
    // retry sends of earlier passes: every open item that was never commented is offered again
    const pending = readOpen(d.dir);
    const n = await notifyNew({ dir: d.dir, now: d.now, runDg: d.runDg }, pending);
    res.commented = n.sent;
  }
  res.lines.push(`watch: ${rows.length} runs, ${res.opened} opened, ${res.resolved} resolved, ${res.commented} commented${d.dryRun ? " (dry run, nothing written)" : ""}`);
  return res;
}
```

`rowsWithEvents(rows)` is a small local helper: for each `RunRow` from `listRuns`, read that run's events with `readEvents(runDir)` (see the Task 1 note on where the run directory comes from; wrap each read in try/catch and skip the run on a throw). `listRuns`' `RunRow` has `record` and a `summary` only, so the helper finds the directory with `findRunDir(record.run, d.env)`. Remove the unused `readdirSync`, `readFileSync` and `join` imports if the helper does not need them. Write the helper in `watch.ts` and keep `runWatch` as the only export besides the types.


- [ ] **Step 5: Run to verify they pass**

Run: `pnpm vitest run packages/cli/src/autonomous/pane.test.ts packages/cli/src/autonomous/watch.test.ts`
Expected: PASS. Debug order first if a count is off: classify one run alone, then the pass.

- [ ] **Step 6: Add the source test for the "never" rules**

In `watch.test.ts`, add:
```ts
it("never answers, sends keys, kills or deletes: the source has none of those verbs", () => {
  for (const f of ["watchdog.ts", "watch.ts", "pane.ts", "attention.ts", "notify.ts", "breaker.ts"]) {
    const src = readFileSync(join(__dirname, f), "utf-8");
    expect(src, f).not.toMatch(/\b(unlinkSync|rmSync|rmdirSync|process\.kill|\.kill\()/);
    expect(src, f).not.toMatch(/["'`](send|send-keys|keys|kill|close|answer|stop)["'`]/);
  }
  const pane = readFileSync(join(__dirname, "pane.ts"), "utf-8");
  expect(pane.match(/args: \[([^\]]*)\]/)?.[1]).toBe('"pane", "list"');
});
```
Add `import { readFileSync } from "node:fs"; import { join } from "node:path";` at the top of the test file if missing, and use `import.meta.dirname` in place of `__dirname` (ESM).
Run the file again. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/autonomous/pane.ts packages/cli/src/autonomous/pane.test.ts packages/cli/src/autonomous/watch.ts packages/cli/src/autonomous/watch.test.ts
git commit -m "feat(dgs-583): add the watch pass and the pane lookup"
```

### Task 7: Commands, release with cause, breaker in the scan

**Files:**
- Modify: `packages/cli/src/autonomous/index.ts` (add `watch`, `attention`, `attention resolve`, `resume`; add `--cause` to `release`), `scan.ts` (breaker check), `release.ts` (cause, breaker record, one retry), `switch.ts` (`runBack` also closes the breaker), `types.ts` (`EventKind` gains `"breaker"`)
- Test: `index.test.ts`, `scan.test.ts`, `release.test.ts`, `switch.test.ts` (add cases; the existing cases stay green and unchanged)

**Interfaces:**
- Consumes: DGS-486 `runScan`, `runRelease`, `runBack` as in its plan (read the merged files first; the line numbers below are for the DGS-486 plan, not the code); Tasks 2 to 6.
- Produces: `runRelease` args gain `cause?: string` and return `{ lockCleared, runNow, cause: string | null, retryEligible: boolean, breakerOpened: boolean, warning: string | null }`; `ScanResult.outcome` gains `"breaker"`; yargs: `dg autonomous watch [--dry-run]`, `dg autonomous attention [--json]`, `dg autonomous attention resolve <id> [--note ..]`, `dg autonomous resume`, `dg autonomous release ... [--cause <code>]`.

- [ ] **Step 1: Write the failing tests**

`scan.test.ts` (use the file's existing fake tracker and temp dir setup):
- With `breaker.json` open (`recordRelease` twice failed): `runScan` returns `outcome: "breaker"`, the fake tracker's `calls` is empty, no lock is written, no order file, and one `breaker` event is appended. This check runs **after** the `off` check and **before** the lock read, and a dry run ignores the breaker (it prints candidates and writes nothing).
- A malformed `breaker.json` gives `breaker`.
- With the breaker closed, existing behaviour is unchanged (the existing tests cover it).

`release.test.ts`:
- `--result failed --cause test-red` (durable): one `refused`-or-`failed` open item per `kindOf` (here `failed`; run `-`, ticket the key, cause `test-red`, `causeClass: "durable"`, `retryEligible: false`), one comment (the existing release comment), breaker streak 1.
- `--result failed --cause gateway-5xx` (transient): the item has `causeClass: "transient"` and `retryEligible: true`; `retryEligible: true` is returned; the breaker streak still goes up by 1 (every failed release counts); no journal file is created.
- `--cause weird`: recorded as `unknown`, `warning` set, the release still clears the lock and returns normally; `retryEligible: false`.
- `--result failed` with no cause: `unknown`, `retryEligible: false`.
- Two failed releases: `breakerOpened` true on the second, one `failed` item with cause `circuit-breaker-open` (ticket the second key, run `-`).
- `merged` resets the streak. `stopped` and `awaiting-jack` do not change it and write no attention item.
- A lock for another ticket still throws and changes nothing (the existing test stays green).

`switch.test.ts`: `runBack` closes an open breaker and resolves the open `circuit-breaker-open` item (`by: jack`), still calls run-now.

`index.test.ts`: `attention` on an empty dir prints `none`, exit 0; with two open items prints both and `--json` prints a JSON array of the open items; `attention resolve <id>` appends a `resolved` line (`by: jack`) and prints `resolved <id>`; an unknown id exits 1 and writes nothing; `resume` on an open breaker prints `breaker closed` and the file says `open: false`, on a closed one prints `breaker was not open` and exits 0; `release --cause` appears in `release --help`; `watch --dry-run` on a temp depot with `DIGISMITH_DEPOT_DIR` prints the summary line and writes nothing; `buildCli(["autonomous","--help"])` lists `watch`, `attention`, `resume`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run packages/cli/src/autonomous/scan.test.ts packages/cli/src/autonomous/release.test.ts packages/cli/src/autonomous/switch.test.ts packages/cli/src/autonomous/index.test.ts`
Expected: FAIL on the new cases only.

- [ ] **Step 3: Implement**

`scan.ts`: after the `off` return and before the lock read, add
```ts
if (!d.dryRun && isOpen(d.dir)) {
  appendEvent(d.dir, d.now(), "breaker");
  return { outcome: "breaker", candidates: 0, skipped: [] };
}
```
(import `isOpen` from `./breaker.ts`; add `"breaker"` to `EventKind` in `types.ts` and to `ScanResult.outcome`).

`release.ts`: after reading and checking the lock, and before `clearLock`, when `a.result === "failed"`:
```ts
const { code, warning } = normalizeCause(a.cause);
const klass = classOfCause(code);
const retryEligible = decideRetry("failed", klass, 0) === "retry";
appendOpen(attDir, { ticket: a.ticket, run: "-", kind: kindOf(code), cause: code, causeClass: klass, retryEligible, since: now.toISOString(), ts: now.toISOString() });
const b = recordRelease(d.dir, { ticket: a.ticket, result: "failed" }, now);
```
Call `recordRelease` for the other three results too (merged resets; the others do nothing). Release writes nothing to the journal. When `b.opened`, `appendOpen` a `failed` item `{ ticket: a.ticket, run: "-", cause: "circuit-breaker-open" }` and post one comment on the ticket (`Autonomous Operation stopped scanning: 2 failed tickets in a row (<list>). Run dg autonomous resume when you are back.`). The existing `appendEvent("release", ...)` gets `cause: code` in its fields. `kindOf(code)`: `merge-refused` and `classifier-block` give kind `refused`; `unknown` gives kind `unknown`; every other code gives kind `failed` (write this as a small `kindOf(code)` function next to `normalizeCause` use, and test both). Cause warnings go to the returned `warning`; the command prints them to stderr.

`switch.ts`: in `runBack`, call `closeBreaker(d.dir)` and `appendResolved` on the open `circuit-breaker-open` item (if any, `by: "jack"`), both inside try/catch so `back` never fails because of the breaker.

`index.ts`: add the four commands with the same handler style as the existing ones. `watch` builds `WatchDeps` with `env: process.env`, `dir: autonomousDir()`, `cwd: process.cwd()`, `now: Date.now`, `panes: herdrPaneLookup()`, and a `runDg` that runs `execFile(process.execPath, [<the dg entry>, ...args])` (the same entry the registry uses; take it from the same helper the DGS-486 index uses for run-now, or from `process.argv[1]`). `watch` exits 0 unless the depot root cannot be read. `attention` prints `formatOpen(readOpen(dir), Date.now())` or `JSON.stringify(items, null, 2)`. `resume` closes the breaker and the item.

- [ ] **Step 4: Run, then the whole group**

Run: `pnpm vitest run packages/cli/src/autonomous packages/cli/src/index.test.ts`
Expected: PASS, with every DGS-486 test still green and unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous
git commit -m "feat(dgs-583): add watch, attention, resume and release causes"
```

### Task 8: Registry entry, catch-up block, report block

**Files:**
- Modify: `scripts/nexus-api/src/scheduler/registry.ts` (one entry), `registry.test.ts`, `scripts/conductor/cli.ts`, `packages/cli/src/autonomous/report.ts`, `report.test.ts`
- Create: `scripts/conductor/attention-section.ts`, `scripts/conductor/attention-section.test.ts`

**Interfaces:**
- Consumes: `readOpen`, `formatOpen` (Task 4); the `DG` constant and `MAIN_CHECKOUT` already in `registry.ts` from DGS-486.
- Produces: `export function attentionSection(dir: string, now: number): string`: `""` when `attention.jsonl` does not exist; otherwise `"\n## Needs Jack, Nightwatch\n" + formatOpen(...)` (with `none` when every item is resolved). `buildReport` gets an `Attention:` block.

- [ ] **Step 1: Write the failing tests**

`registry.test.ts`: the `nightwatch-watchdog` entry exists; `validateJobs(JOBS)` passes; `schedule` is `{ atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 }`; `catchUp` is `skip`; `timeoutMs` is 120000; `order` is 40; `command.args` ends with `autonomous`, `watch`; `command.file` is `process.execPath`; the entry sits in the window all day: with `clock.ts` `slotsOfNight`/`currentSlot`, 10:00 and 23:55 UTC+7 are slots.

`attention-section.test.ts`: no file gives `""`; one open item gives the heading and its id; all resolved gives the heading and `none`; a corrupt line is skipped. `cli.test.ts` (existing file): the consult output without an attention file stays byte-identical (the existing tests stay green); with one open item in a temp `AUTONOMOUS_DIR` the output ends with the block.

`report.test.ts` (DGS-486 file): `buildReport` takes the open items and renders `Attention:` with each item or `none`; an empty period still renders `Attention: none`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run scripts/nexus-api/src/scheduler/registry.test.ts scripts/conductor packages/cli/src/autonomous/report.test.ts`
Expected: FAIL on the new cases only.

- [ ] **Step 3: Implement**

`registry.ts` (single quotes, no semicolons; add the entry next to the DGS-486 ones, before `validateJobs(JOBS)`):
```ts
defineJob({
  name: 'nightwatch-watchdog',
  description: 'Watches every open run for blocked, stalled and lost; writes the attention list. No model tokens.',
  schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 },
  command: { file: process.execPath, args: [...DG, 'autonomous', 'watch'] },
  timeoutMs: 2 * 60 * 1000,
  catchUp: 'skip',
  order: 40,
  notify: 'failures',
  manualOutsideWindow: 'allowed',
}),
```
`attention-section.ts` (double quotes, as the other conductor scripts): read through `readOpen(dir)` and `formatOpen`, `dir` from `autonomousDir()`. `cli.ts`: append `attentionSection(autonomousDir(), Date.now())` after the existing autonomous section for `consult`; every other output stays byte-identical. `report.ts`: `runReport` reads `readOpen(d.dir)` and passes it to `buildReport` as a new last argument `attention: OpenItem[] = []` (a default keeps the existing tests green); the block goes after `Still building`.

- [ ] **Step 4: Run the full suites**

Run: `pnpm vitest run packages/cli scripts/conductor scripts/nexus-api`
Expected: PASS. Then `pnpm tsc -p packages/cli --noEmit` (use the repo's own typecheck script if `pnpm run` lists one). Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/nexus-api/src/scheduler scripts/conductor packages/cli/src/autonomous/report.ts packages/cli/src/autonomous/report.test.ts
git commit -m "feat(dgs-583): schedule the watchdog and show attention in the catch-up"
```

### Task 9: Whole-ticket check, runbook text and docs

**Files:**
- Create: `.digismith/board/DGS-583—nightwatch-watchdog/runbook-text.md`, `packages/cli/src/autonomous/WATCHDOG.md`
- Modify: none

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Hand mutation checks (restore each one)**

Do each by hand once, note the failing test in the report, restore: (1) make `classify` check silence before blocked: the "blocked beats silence" test fails; (2) change `SILENCE_MS` to 31 minutes: the 30:00 edge test fails; (3) drop `appendOpen`'s duplicate check: the "one item per (run, kind)" test fails; (4) let `notifyNew` skip the `sent` list: the "not sent twice" test fails; (5) make `recordRelease` ignore a failed release: the streak test fails; (6) make `isOpen` return false on a bad file: the fail-closed test fails; (7) let `decideRetry` return `retry` for a `blocked` kind: the decideRetry table test fails; (8) make the scan check the breaker after the lock read: the zero-tracker-call test fails; (9) auto-resolve `lost` items: the "lost stays open" test fails; (10) add `"send"` as an arg in `buildHerdrCall`: the source test fails.

- [ ] **Step 2: Whole checks**

Run: `pnpm vitest run packages/cli scripts/conductor scripts/nexus-api` and the typecheck. Expected: PASS. Run `dg autonomous watch --dry-run` once against a temp depot (`DIGISMITH_DEPOT_DIR=$(mktemp -d)`): it prints `watch: 0 runs, 0 opened ...` and exits 0.

- [ ] **Step 3: Write `runbook-text.md` and `WATCHDOG.md`**

`runbook-text.md` (for the conductor to apply; plain short sentences): (a) the worker-start step stays as DGS-581 says; (b) the manual-run line: when a run changes phase by hand, send `dg run event <id> phase --data '{"phase":"merge"}'` (and `building`, `review`); (c) `dg autonomous attention` lists what needs Jack, `dg autonomous attention resolve <id>` closes an item, `dg autonomous resume` closes the breaker; (d) every failed release names a cause: `dg autonomous release --ticket K --result failed --cause <code>` with the list of eleven codes and their classes; a classifier block is `classifier-block`; (e) the watchdog never answers a prompt: a `blocked` item means a human (or the conductor) answers it in the pane.
`WATCHDOG.md`: the five states, the check order, the files in the depot (`attention.jsonl`, `notify-state.json`, `breaker.json`), the budgets config block with its defaults, and the three commands. Short plain sentences.

- [ ] **Step 4: Commit**

```bash
git add ".digismith/board/DGS-583—nightwatch-watchdog/runbook-text.md" packages/cli/src/autonomous/WATCHDOG.md
git commit -m "docs(dgs-583): add the runbook text and the watchdog notes"
```

## First use (after DGS-582 and this ticket are merged, the plugin updated and the Nexus API restarted once)

The conductor, not Jack: (1) `dg autonomous watch --dry-run` on the real depot: only real runs, nothing written. (2) Start a throwaway worker through the runbook, trigger one permission prompt and leave it unanswered: within 5 to 10 minutes `dg autonomous attention` shows one `blocked` item and the ticket has one comment. (3) Answer the prompt: the item resolves itself at the next pass. (4) Close the tab with no `ended` event: the run is `lost` after its pane is gone, one `lost` item, one retry planned in the journal (and, with the controller running, one re-dispatch). (5) Two `release --result failed --cause test-red` in a row open the breaker; `dg autonomous scan` says `breaker`; `dg autonomous resume` closes it. Jack's own check is the morning catch-up: it shows `Needs Jack, Nightwatch` and `none` on a quiet night.
