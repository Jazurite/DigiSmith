# Autonomous Operation scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dg autonomous scan | away | back | release | report | status` plus two Nexus scheduler jobs, so that at night or while Jack is away an hourly scan claims one ready `to do` ticket, hands it to the digismith-conductor, and reports when Jack is back.

**Architecture:** Plain TypeScript in `packages/cli/src/autonomous/`, one unit per file, every outside effect (ClickUp, herdr, Nexus, clock, depot folder) passed in as a dependency so tests use fakes. State is files in the depot (`away.json`, `lock.json`, `notes.json`, `last-report.json`, day event files, reports). The scan never starts a worker; it writes an order and prompts the conductor. Rev 2 (2026-10-19): renamed from Lights-Out, plus the away switch.

**Tech Stack:** Node 22 with `--experimental-strip-types`, TypeScript, yargs (as in `packages/cli/src/steward/index.ts`), Vitest from the repo root, `@digismith/clickup-client`. pnpm only.

## Global Constraints
Design: `design.md` (same folder), rev 2.
- **Work rule:** a scan works only inside the night window `23:00` (inclusive) to `06:00` (exclusive) UTC+7, or while away is on (`isAway`). Any other time: event `off`, exit 0, **before any ClickUp call and before any lock read**. Fixed +7 h offset on UTC milliseconds, one injectable `now()`.
- **Away:** `away.json` = `{ away, since, until, endedAt }`, never deleted, rewritten atomically. `away [--until HH:MM]` (UTC+7, the next time that clock reads it) writes it, then run-now `autonomous-scan`. `back` rewrites `away: false`, then run-now `autonomous-report`. A passed `until` counts as back: the first scan that sees it does what `back` does (log `away-expired`).
- DigiSmith space id `1301150000001271` (`DIGISMITH_SPACE_ID` in `packages/cli/src/clickup/lib.ts`). Starter status `to do`; claim status `in progress`. Candidate types: Task and Bug only (Epic, Initiative, Spike are skipped, never commented).
- Order: priority (urgent first, none last), due date (earliest first, none last), created (oldest first). One ticket per scan.
- Lock `~/.digismith-depot/autonomous/lock.json`, created with flag `wx`. A scan never clears a lock. Claim order: lock, `in progress`, read back, order file, conductor prompt. Any failure: remove lock, set the ticket back to `to do`, log `claim-failed`.
- One comment per distinct set of Definition of Ready reasons (`notes.json` hash); never one per hour.
- Reports: at 06:00 and on `back`; each covers the time since the previous report (`last-report.json`).
- Mandate text in every order: allowed merge, push, restart an installed service; never `sudo`, a new background service or LaunchAgent, a delete, a Caddy or Tailscale change.
- No test touches the real ClickUp, the real depot, Nexus (4300), herdr or a conductor. `AUTONOMOUS_DIR` overrides the state folder; `DIGISMITH_DEPOT_DIR` the depot (`depotDir()` in `scripts/depot-dir.ts` and `stewardDir()` in `packages/cli/src/steward/state.ts` show the pattern).
- herdr only through `~/.digismith-depot/bin/herdr-ws`. No AI attribution in commits; title-only conventional commits; commit by named paths.
- **No build before the Maestro's order.** DGS-456 is on main (this branch was rebased onto it on 2026-10-19), so Task 14 can be built; it edits `scripts/nexus-api/src/scheduler/registry.ts` and `registry.test.ts`.

## DGS-456 as built on main (read 2026-10-19)
`JobDef = { name, description, schedule?: { atUtc7, windowEndUtc7, everyMinutes? }, command: { file, args }, timeoutMs, catchUp, order, notify, manualOutsideWindow }`, made with `defineJob({...})` (defaults: order 100, notify `failures`, manualOutsideWindow `allowed`, catchUp `run-once-in-window`, timeout 10 min) and checked by `validateJobs`. The existing entry uses `file: process.execPath`. A window with end equal to start is refused; `HH:MM` stops at `23:59`; `everyMinutes` is 5 to 720. `clock.ts` exports `slotsOfNight(night, schedule): Slot[]`, `inWindow`, `currentSlot`, `nextRunAt`. Run-now: `POST http://127.0.0.1:4300/api/v1/jobs/<name>/run`, `Content-Type: application/json`, `X-Nexus-Token` from `$NEXUS_STATE_DIR/token` (default `~/.digismith-depot/nexus/scheduler/token`), body `{"confirm":"<name>"}`; 202 accepted, 409 `already_running`, 403 `forbidden`.
**Closest fit for "every 60 min over the whole day":** `atUtc7: "00:00", windowEndUtc7: "23:59", everyMinutes: 60` gives 24 slots (00:00 to 23:00). A true 24 h window cannot be written; the command's own work rule does the rest.

## Files
```
packages/cli/src/autonomous/
  types.ts           LoTask, Tracker, Event, Lock, Away
  clock.ts           inNightWindow(), dayOf(), stampOf(), fmtUtc7(), nextClock()
  state.ts           autonomousDir(), lock, notes, events by day, last-report
  away.ts            readAway(), writeAway(), isAway(), awayExpired()
  rank.ts            rankTasks()
  ready.ts           checkReady()  -> string[] of failed-check reasons
  order.ts           renderOrder(), orderPath()
  conductor.ts       promptConductor() through herdr-ws (injectable exec)
  nexus.ts           runNow()
  switch.ts          runAway(), runBack()
  tracker-clickup.ts the real Tracker (ClickUpClient)
  fake-tracker.test-util.ts   in-memory Tracker for tests
  scan.ts            runScan()
  release.ts         runRelease()
  report.ts          buildReport(), runReport()
  index.ts           yargs group `autonomous`
  *.test.ts
packages/cli/src/index.ts                      register autonomousCommand (one import, one .command line)
scripts/conductor/autonomous-section.ts (+test) the catch-up section
scripts/conductor/cli.ts                       append the section to the consult output
scripts/nexus-api/src/scheduler/registry.ts    two entries
.digismith/board/DGS-486—autonomous-scan/probe.md          task 1 findings
.digismith/board/DGS-486—autonomous-scan/runbook-text.md   the conductor runbook section (the Maestro applies it)
```

## Tasks (all test first; run tests with `pnpm vitest run packages/cli/src/autonomous`)

### Task 1: Probe the real ticket shape (read only)
**Files:** Create `.digismith/board/DGS-486—autonomous-scan/probe.md`.
**Produces:** the exact answers Tasks 5, 8 and 11 need: (a) where the milestone lives on a ticket; (b) the shape of `dependencies` on a ticket that is blocked; (c) the `attachments` item shape; (d) the `custom_item_id` of Task, Bug, Epic, Initiative, Spike; (e) the `Sign-off` field id and option ids; (f) whether `searchTeamTasks` returns `attachments` and `dependencies` (it may omit them, then the tracker fetches `getTaskByRef` for the few tickets that reach the Definition of Ready check).
- [ ] **Step 1:** Run, read only: `dg clickup list-task-types`; `dg clickup get-task DGS-469` (a done ticket, find the milestone: a custom field, a link to a milestone task, or a parent); `dg clickup get-task DGS-548` (milestone and initiative links); `dg clickup list-fields --list 1301150000004127 --json` (Sign-off ids). For (b) find a blocked ticket with `dg clickup list-tasks --list 1301150000004127` and `get-task` on one with a dependency; if none exists, read `packages/clickup-client/src/types.ts` `DependencyRelation` and the `add-dependency` command's API path and record the documented shape from there.
- [ ] **Step 2:** Write the five answers into `probe.md` as a table (item, answer, source command). No token, key or `.env` value in it.
- [ ] **Step 3:** Commit: `git add ".digismith/board/DGS-486—autonomous-scan/probe.md" && git commit -m "docs(dgs-486): record the ticket shape probe" -- ".digismith/board/DGS-486—autonomous-scan/probe.md"`.
If the milestone cannot be found as a field, link or parent, **stop and tell the conductor**; Task 5 (and Task 11) do not guess.

### Task 2: Types, clock, rank
**Files:** Create `types.ts`, `clock.ts`, `rank.ts`; tests `clock.test.ts`, `rank.test.ts`.
**Produces:**
```ts
// types.ts
export interface LoTask {
  id: string; key: string | null; name: string; typeId: number;
  priority: number | null;      // 1 urgent .. 4 low, null none
  due: number | null;           // ms
  created: number;              // ms
  attachments: string[];        // titles
  text: string;
  signOff: "Auto" | "Jack" | null;
  milestone: string | null;
  blockers: { key: string; done: boolean }[];
}
export interface Tracker {
  hasStatus(name: string): Promise<boolean>;
  listToDo(): Promise<LoTask[]>;                 // status exactly "to do", whole space, any type
  setStatus(taskId: string, status: string): Promise<void>;
  getStatus(taskId: string): Promise<string>;
  comment(ref: string, text: string): Promise<void>;   // ref = task id or key
}
export type EventKind = "scan" | "off" | "busy" | "skip" | "claim" | "claim-failed" | "no-starter-status" | "release" | "run-now" | "away-on" | "away-off" | "away-expired";
export interface Event { ts: string; tsUtc7: string; kind: EventKind; [k: string]: unknown }
export interface Lock { ticket: string; taskId: string; claimedAt: string; claimedAtUtc7: string; order: string; scanId: string }
export interface Away { away: boolean; since: string; until: string | null; endedAt: string | null }
// clock.ts
export const OFFSET_MS = 7 * 3600_000;
export function inNightWindow(now: Date): boolean { const h = new Date(now.getTime() + OFFSET_MS).getUTCHours(); return h >= 23 || h < 6; }
export const dayOf = (now: Date): string => new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);          // UTC+7 date
export const stampOf = (now: Date): string => new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 16).replace("T", "-").replace(":", "");   // "2026-10-19-1432"
export function fmtUtc7(now: Date): string { return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 19).replace("T", " "); }
export function nextClock(now: Date, hhmm: string): Date;   // the next instant (strictly after now) at which the UTC+7 clock reads hhmm; throws on a bad hhmm
// rank.ts
export function rankTasks(tasks: LoTask[]): LoTask[];   // priority asc (null last), due asc (null last), created asc; stable; does not mutate
```
- [ ] **Step 1: Failing tests.** `clock.test.ts`: `inNightWindow(new Date("2026-10-18T16:00:00Z"))` (23:00 UTC+7) is true; one millisecond earlier false; `2026-10-18T22:59:59Z` (05:59:59) true; `23:00:00Z` (06:00) false; `12:00:00Z` (19:00) false; `dayOf(new Date("2026-10-18T16:30:00Z"))` is `"2026-10-18"` (23:30 UTC+7); `dayOf(new Date("2026-10-18T17:00:00Z"))` is `"2026-10-19"` (00:00 UTC+7); across a month end `dayOf(new Date("2026-10-31T17:00:00Z"))` is `"2026-11-01"`; `stampOf(new Date("2026-10-19T07:32:00Z"))` is `"2026-10-19-1432"`; `fmtUtc7(new Date("2026-10-18T16:19:47Z"))` is `"2026-10-18 23:19:47"`; `nextClock(new Date("2026-10-19T07:32:00Z"), "18:00")` is `2026-10-19T11:00:00Z`; `nextClock(same, "14:00")` (already passed today) is `2026-10-20T07:00:00Z`; `nextClock(same, "14:32")` (equal to now) is the next day (strictly after); `nextClock(same, "25:00")` and `"9:5"` throw. `rank.test.ts`: priority 2 before 3 before none; equal priority, earlier due first, no due last; equal both, older created first; two tickets with no priority fall through to due (the `Infinity - Infinity` case); input array unchanged.
- [ ] **Step 2:** `pnpm vitest run packages/cli/src/autonomous/clock.test.ts packages/cli/src/autonomous/rank.test.ts` Expected: FAIL (modules missing).
- [ ] **Step 3:** Write `types.ts`, `clock.ts` as above, with
```ts
export function nextClock(now: Date, hhmm: string): Date {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`"${hhmm}" is not HH:MM`);
  const local = new Date(now.getTime() + OFFSET_MS);
  const cand = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(m[1]), Number(m[2])) - OFFSET_MS;
  return new Date(cand > now.getTime() ? cand : cand + 24 * 3600_000);
}
```
and
```ts
// rank.ts
import type { LoTask } from "./types.ts";
const last = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
export function rankTasks(tasks: LoTask[]): LoTask[] {
  return [...tasks].sort((a, b) => last(a.priority) - last(b.priority) || last(a.due) - last(b.due) || a.created - b.created);
}
```
(`Infinity - Infinity` is `NaN`, which `||` treats as falsy, so equal nulls fall through; the rank test pins this.)
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(dgs-486): add the autonomous types, clock and rank` with the six paths.

### Task 3: State (lock, notes, events, last report)
**Files:** Create `state.ts`; test `state.test.ts`.
**Consumes:** `Lock`, `Event`, `EventKind`, `dayOf`, `fmtUtc7`.
**Produces:**
```ts
export function autonomousDir(env = process.env): string;           // AUTONOMOUS_DIR, else <DIGISMITH_DEPOT_DIR or ~/.digismith-depot>/autonomous
export function acquireLock(dir: string, lock: Lock): "acquired" | "busy";   // writeFileSync(..., { flag: "wx" }); EEXIST -> "busy"; other errors throw
export function readLock(dir: string): Lock | null;                // no file -> null; a corrupt file -> a lock with ticket "?", so the scan stays busy
export function clearLock(dir: string): void;                      // rmSync force
export function readNotes(dir: string): Record<string, string>;
export function writeNotes(dir: string, notes: Record<string, string>): void;   // temp file + rename
export function appendEvent(dir: string, now: Date, kind: EventKind, fields?: Record<string, unknown>): void;   // one appendFile of one JSON line to events-<dayOf(now)>.jsonl
export function readEvents(dir: string, fromMs: number, toMs: number): Event[];  // reads the day files from dayOf(from) to dayOf(to), keeps lines with fromMs <= ts < toMs, sorted by ts; missing file -> nothing; a bad line is skipped
export function readLastReport(dir: string): Date | null;          // last-report.json { at }; none or corrupt -> null
export function writeLastReport(dir: string, at: Date): void;      // temp file + rename
```
- [ ] **Step 1: Failing tests** (temp dir per test with `mkdtempSync`): two `acquireLock` calls give `"acquired"` then `"busy"`; ten `acquireLock` calls started in `Promise.all` give exactly one `"acquired"`; `readLock` returns the written lock; a lock file holding `not json` makes `readLock` return an object whose `ticket` is `"?"`; `clearLock` then `acquireLock` gives `"acquired"`; `writeNotes` then `readNotes` round-trips and leaves no `.tmp` file; `appendEvent` twice writes two valid JSON lines with `kind` and `tsUtc7` in the file of that UTC+7 day; events at 23:30 and 00:30 UTC+7 land in two day files; `readEvents` across those two files returns both in time order, honours `fromMs` and `toMs`, and skips a garbage line; `readLastReport` is `null` with no file and the written date after `writeLastReport`; `autonomousDir({ AUTONOMOUS_DIR: "/x" })` is `"/x"`, and with only `DIGISMITH_DEPOT_DIR: "/d"` is `"/d/autonomous"`. Create the folder on first write (`mkdirSync recursive`).
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/state.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with `node:fs` only. Core of the lock:
```ts
export function acquireLock(dir: string, lock: Lock): "acquired" | "busy" {
  mkdirSync(dir, { recursive: true });
  try { writeFileSync(join(dir, "lock.json"), JSON.stringify(lock), { flag: "wx" }); return "acquired"; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return "busy"; throw e; }
}
```
- [ ] **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the autonomous state files`.

### Task 4: The away file
**Files:** Create `away.ts`; test `away.test.ts`.
**Consumes:** `Away`. **Produces:**
```ts
export function readAway(dir: string): Away | null;                  // no file -> null; a corrupt file -> null (treated as not away)
export function writeAway(dir: string, a: Away): void;               // temp file + rename; the file is never removed
export function isAway(a: Away | null, now: Date): boolean;          // a !== null && a.away && (a.until === null || now.getTime() < Date.parse(a.until))
export function awayExpired(a: Away | null, now: Date): boolean;     // a !== null && a.away && a.until !== null && now.getTime() >= Date.parse(a.until)
```
- [ ] **Step 1: Failing tests:** no file gives `null` and `isAway` false; a written `{ away: true, until: null }` is away at any time; with `until` one hour ahead away is true, with `until` equal to now or earlier away is false and `awayExpired` is true; `{ away: false }` is never away and never expired; a corrupt file reads `null`; `writeAway` leaves no `.tmp` file; writing `{ away: false, endedAt }` over an existing file keeps the file present (`existsSync` true).
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/away.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the away file`.

### Task 5: Definition of Ready
**Files:** Create `ready.ts`; test `ready.test.ts`.
**Consumes:** `LoTask`. **Produces:**
```ts
export interface ReadyCtx { repo: string; fileExists: (path: string) => boolean }   // fileExists injected (fs.existsSync in the real call)
export function checkReady(t: LoTask, ctx: ReadyCtx): string[];   // [] = ready; each string is one failed check, a full sentence
export const REASON = {
  specPlan: "no spec and plan on the ticket (an attachment named design.* or spec.* and one named plan.*, or a linked board folder with design.* and plan.md on main)",
  signOff: "no Sign-off mark (Auto or Jack)",
  milestone: "no milestone",
  blocked: (keys: string[]) => `blocked by open ticket(s): ${keys.join(", ")}`,
} as const;
```
Rules: **attachments** pass when one title matches `/^(design|spec)\./i` and one matches `/^plan\./i`. **Board link** passes when `t.text` contains `.digismith/board/<folder>` (regex `/\.digismith\/board\/([A-Z]+-\d+—[^\s/)]+)/`) and `fileExists` is true for `<repo>/.digismith/board/<folder>/plan.md` and for `design.md` or `design.html` or `spec.md` in it. Either route is enough. Sign-off passes when `signOff !== null`. Milestone passes when `milestone !== null`. Blocked lists every blocker with `done === false`.
- [ ] **Step 1: Failing tests:** a ticket with all four passes (`[]`); each check failing alone gives exactly its one reason; all four failing gives four reasons in the order spec/plan, sign-off, milestone, blocked; attachments `["design.html","plan.md"]` pass; `["plan.md"]` alone fails; the board link passes only when `fileExists` is true for the plan and a design file (use a stub); a done blocker (`done: true`) does not block; an open one does.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/ready.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement per the rules. The milestone and blocker inputs are already mapped into `LoTask` by Task 11, so this file has no ClickUp knowledge.
- [ ] **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the Definition of Ready check`.

### Task 6: Order file and conductor prompt
**Files:** Create `order.ts`, `conductor.ts`; tests `order.test.ts`, `conductor.test.ts`.
**Produces:**
```ts
export function orderPath(ordersDir: string, stamp: string, key: string): string;   // <ordersDir>/order-ao-<stamp>-<KEY>.md, stamp = "YYYY-MM-DD-HHmm" UTC+7 of the claim
export function renderOrder(i: { key: string; name: string; taskId: string; signOff: "Auto" | "Jack"; claimedAtUtc7: string; stamp: string; specPlan: string }): string;
export type Exec = (file: string, args: string[]) => Promise<{ code: number; stderr: string }>;
export async function promptConductor(exec: Exec, conductorsJson: string, message: string): Promise<void>;   // throws on a missing conductor entry or a non-zero exit
```
`renderOrder` text: title `# Order ao-<stamp>: build <KEY> (Autonomous Operation)`; a line `From: dg autonomous scan, <claimedAtUtc7> UTC+7`; ticket line with title and task id; Sign-off; `Spec and plan:` the `specPlan` text; the standing steps (build per the conductor runbook: seat rule, Builder in role mode, Reviewers, merge, hooks 01-03, report.html, plan.md); the **Mandate** paragraph (works at night and while away) (Global Constraints wording, verbatim); the stop rule (`release --result stopped --reason "<what is needed>"`, ticket waits for Jack, comment on the ticket and lock cleared); the `Sign-off: Jack` rule (run to the acceptance point, then `release --result awaiting-jack`); and the last step `dg autonomous release --ticket <KEY> --result <merged|failed|stopped|awaiting-jack> [--reason "..."]`.
`promptConductor` reads `conductorsJson` (`~/.digismith-depot/conductors.json`; **Step 1 of the task reads the file's shape and writes it into the test**), finds the digismith-conductor entry's agent name, and runs `exec("/Users/workbox/.digismith-depot/bin/herdr-ws", ["agent", "prompt", <name>, message])`. The argv is built, never a shell string.
- [ ] **Step 1: Failing tests:** `orderPath` result (`order-ao-2026-10-19-1432-DGS-9.md`); the order text contains the key, the task id, the mandate words `sudo`, `LaunchAgent`, `delete`, the `release` command with the key, and for `signOff: "Jack"` the `awaiting-jack` rule; `promptConductor` calls the fake `exec` once with `["agent","prompt","<name>","<message>"]` (a message with `;` and quotes stays one argument); a non-zero exit throws with the stderr; a conductors file without the entry throws.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/order.test.ts packages/cli/src/autonomous/conductor.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement; the real `Exec` (used only by `index.ts`) is `execFile` promisified, no shell. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the Autonomous order and conductor prompt`.

### Task 7: Nexus run-now and the away switch
**Files:** Create `nexus.ts`, `switch.ts`; tests `nexus.test.ts`, `switch.test.ts`.
**Consumes:** Tasks 2 to 4. **Produces:**
```ts
// nexus.ts
export interface NexusDeps { baseUrl: string; tokenFile: string; fetch: typeof fetch }
export type RunNowResult = { ok: true } | { ok: false; status: number | null; error: string };
export async function runNow(d: NexusDeps, job: string): Promise<RunNowResult>;   // POST <baseUrl>/api/v1/jobs/<job>/run; never throws
export function defaultNexus(env = process.env): { baseUrl: string; tokenFile: string };   // NEXUS_URL or http://127.0.0.1:4300; <NEXUS_STATE_DIR or ~/.digismith-depot/nexus/scheduler>/token
// switch.ts
export interface SwitchDeps { dir: string; now: () => Date; nexus: NexusDeps }
export async function runAway(d: SwitchDeps, a: { until?: string }): Promise<{ until: string | null; runNow: RunNowResult }>;   // until = "HH:MM" UTC+7
export async function runBack(d: SwitchDeps, kind?: "away-off" | "away-expired"): Promise<{ runNow: RunNowResult }>;
```
`runNow` headers: `Content-Type: application/json`, `X-Nexus-Token: <file content trimmed>`, body `{"confirm":"<job>"}`. A missing token file, a network error, 403 or 409 gives `{ ok: false, ... }`; the token value is never put in an error or an event.
`runAway`: `until` resolved with `nextClock(now, hhmm)` (a bad `HH:MM` throws before any write); `writeAway(dir, { away: true, since: now, until, endedAt: null })`; `appendEvent("away-on", { until })`; `runNow(nexus, "autonomous-scan")`; `appendEvent("run-now", { job: "autonomous-scan", ok, status })`.
`runBack`: `writeAway(dir, { ...current, away: false, endedAt: now })` (a missing file writes a fresh `away: false` file); `appendEvent(kind ?? "away-off")`; `runNow(nexus, "autonomous-report")`; `appendEvent("run-now", ...)`.
- [ ] **Step 1: Failing tests.** `nexus.test.ts` starts a **throwaway `http.createServer` on port 0** with a temp token file and asserts: method POST, path `/api/v1/jobs/autonomous-scan/run`, the headers and the body; 202 gives `ok: true`; the server answering 409 then 403 gives `ok: false` with the status; a missing token file gives `ok: false` and the text does not contain the token; a closed port gives `ok: false`. `switch.test.ts` (temp dir, fake `nexus.fetch`, fixed `now`): `runAway({ until: "18:00" })` writes `away: true` with the right `until`, appends `away-on`, and calls run-now on `autonomous-scan` exactly once; `runAway({})` writes `until: null`; `runAway({ until: "7pm" })` throws and writes nothing and calls nothing; a second `runAway` replaces `until`; `runBack` leaves the file present with `away: false` and `endedAt` set, appends `away-off`, calls run-now on `autonomous-report`; `runBack("away-expired")` appends `away-expired`; a run-now answering 409 returns `runNow: { ok: false, status: 409 }`, does not throw, and the file is still written.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/nexus.test.ts packages/cli/src/autonomous/switch.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the Nexus run-now call and the away switch`.

### Task 8: Fake tracker and the scan
**Files:** Create `fake-tracker.test-util.ts`, `scan.ts`; test `scan.test.ts`.
**Consumes:** Tasks 2 to 7. **Produces:**
```ts
export interface ScanDeps {
  tracker: Tracker; dir: string; ordersDir: string; conductorsJson: string; repo: string;
  now: () => Date; scanId: string; exec: Exec; fileExists: (p: string) => boolean; dryRun: boolean;
  nexus: NexusDeps;
}
export interface ScanResult {
  outcome: "off" | "busy" | "no-starter-status" | "none" | "claimed" | "claim-failed";
  claimed?: string;            // ticket key
  candidates: number;
  skipped: { key: string; reason: string }[];
  verdicts?: { key: string; reasons: string[] }[];   // dry run only
}
export async function runScan(d: ScanDeps): Promise<ScanResult>;
```
`fake-tracker.test-util.ts` exports `class FakeTracker implements Tracker` with a `tasks: Map<string, LoTask & { status: string }>`, `comments: {ref,text}[]`, `statuses: Set<string>`, a `calls: string[]` log of every method called, and switches `failSetStatus`, `readBackWrong` (makes `getStatus` return `"to do"` after a set).
Algorithm (exact order):
0. Not a dry run and `awayExpired(readAway(dir), now)` -> `runBack(switchDeps, "away-expired")` (its failure never stops the scan), then go on.
1. Not a dry run and `!(inNightWindow(now) || isAway(readAway(dir), now))` -> `appendEvent("off")`, return `off`. **Nothing else ran: no tracker call, no lock read.**
2. Not a dry run and a lock exists (`readLock !== null`) -> `appendEvent("busy", { ticket })`, return `busy`.
3. `!(await tracker.hasStatus("to do"))` -> `appendEvent("no-starter-status")` (not in dry run), `tracker.comment("DGS-548", ...)` once (guard with `notes["__no-starter-status"]`; not in dry run), return.
4. `all = await tracker.listToDo()`; keep `typeId` of Task and Bug (ids from the Task 1 probe, constants `TYPE_TASK`, `TYPE_BUG` in `ready.ts`); the rest go to `skipped` with reason `type`, no comment.
5. For each of `rankTasks(candidates)`: `reasons = checkReady(...)`. Non-empty: in dry run record the verdict; else if `notes[key] !== hash(reasons.join("|"))` post `Autonomous scan skipped this ticket (<fmtUtc7(now)> UTC+7): <reasons joined by "; ">. It stays in to do. Fix and it is picked up on a later scan.` and store the hash; append one `skip` event `{ key, reason }`; push to `skipped`; continue. Empty (ready): dry run -> record the verdict and continue; real run -> claim (below) and stop the walk.
6. Claim: `acquireLock` (`"busy"` -> log `busy`, return). Then `setStatus(taskId, "in progress")`, `getStatus` must equal `"in progress"`. Then write the order (`mkdirSync` the orders dir, `writeFileSync` flag `wx`, `orderPath(ordersDir, stampOf(now), key)`) and `promptConductor` with `Autonomous order: build <KEY>, read <order path>`. On any throw or mismatch: `clearLock`, best-effort `setStatus(taskId, "to do")`, `appendEvent("claim-failed", { ticket, error })`, return `claim-failed`. On success `appendEvent("claim", { ticket, order })`.
7. Always (not in dry run) end with one `appendEvent("scan", { candidates, skipped: skipped.length, claimed })`. A dry run writes nothing at all: no event, no note, no lock, no comment, no status, no run-now.
- [ ] **Step 1: Failing tests** (fixed `now` inside the night window unless said, temp dirs, `FakeTracker`, a recording `exec`, a fake `nexus.fetch`): **daytime and not away -> `off`, `tracker.calls` is empty, no lock created, one `off` event**; daytime with `away.json` away and no `until` -> works (claims a ready ticket); daytime with `until` in the future -> works; daytime with `until` in the past -> `runBack` ran once (file now `away: false`, `away-expired` event, one run-now on `autonomous-report`) and the scan returns `off`; night window with `away: false` works; empty `to do` -> `none`, one `scan` event, no write calls on the tracker; a ready ticket -> status `in progress`, lock written naming it, order file exists, `exec` called once with the herdr-ws argv; ranking: two ready tickets, the higher priority is claimed and the other stays `to do`; the first fails Definition of Ready, the second is ready -> one comment on the first, the second claimed; a scan while a lock exists -> `busy`, nothing changes; the same failing ticket scanned twice -> exactly one comment, and after its reason set changes a second comment; `readBackWrong` -> lock gone, ticket set back to `to do`, event `claim-failed`; `exec` rejecting -> same; Epic, Initiative, Spike are in `skipped` with reason `type` and get no comment; `hasStatus` false -> `no-starter-status`, one DGS-548 comment across two scans; **two scans at once** (`Promise.all` of two `runScan` with the same dir and tracker): exactly one `claimed`, the other `busy`, one order file; dry run in the daytime: zero tracker writes, no files created in `dir`, `verdicts` filled.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/scan.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `scan.ts` per the algorithm and the fake. Hash with `node:crypto` sha1 hex.
- [ ] **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the autonomous scan`.

### Task 9: Release
**Files:** Create `release.ts`; test `release.test.ts`.
**Produces:**
```ts
export type ReleaseResult = "merged" | "failed" | "stopped" | "awaiting-jack";
export interface ReleaseDeps { tracker: Tracker; dir: string; now: () => Date; nexus: NexusDeps }
export async function runRelease(d: ReleaseDeps, a: { ticket: string; result: ReleaseResult; reason?: string; commit?: string }): Promise<{ lockCleared: boolean; runNow: RunNowResult }>;
```
Read the lock. Absent: `appendEvent("release", { ticket, result, note: "no-lock" })`, no clearing, still try run-now. Lock names another ticket: refuse (throw `Error("the lock belongs to <other>")`), change nothing. Otherwise: for `failed`, `stopped`, `awaiting-jack` post one comment on the ticket (`Autonomous Operation <result> (<fmtUtc7>): <reason>`; a comment failure is logged, never blocks), `clearLock`, `appendEvent("release", { ticket, result, reason, commit, minutes })` (`minutes` from `lock.claimedAt`), call `runNow(nexus, "autonomous-scan")` and `appendEvent("run-now", { job, ok, status })`. If a report file newer than the lock's `claimedAt` exists, append one line `late release: <ticket> <result>` to the newest report file (no new report comment on DGS-548; the ticket comment for `failed`, `stopped`, `awaiting-jack` is still posted).
- [ ] **Step 1: Failing tests** (fake tracker, fake `nexus.fetch`, temp dir): `merged` clears the lock, no comment, one `release` event and one run-now call on `autonomous-scan`; `failed` posts one comment with the reason; a lock for another ticket throws and keeps the lock; no lock -> `no-lock` note and still a run-now call; a run-now 409 returns `runNow: { ok: false, status: 409 }` and does not throw; a failing comment still clears the lock; with a report written after the claim, the newest report gains the `late release` line and no second comment is posted; **release while not away and in the daytime** still clears the lock and calls run-now (the scan that answers will say `off`).
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/release.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add release for autonomous builds`.

### Task 10: Report
**Files:** Create `report.ts`; test `report.test.ts`.
**Produces:**
```ts
export interface ReportDeps { tracker: Tracker; dir: string; now: () => Date }
export function buildReport(from: Date, to: Date, events: Event[], lock: Lock | null): string;   // markdown
export async function runReport(d: ReportDeps): Promise<{ file: string; commented: boolean }>;
```
`buildReport` sections, each with `none` when empty: `# Autonomous Operation report, <fmtUtc7(from)> to <fmtUtc7(to)> UTC+7`; `Away:` each `away-on` to `away-off` or `away-expired` pair in the period (an open one reads `still away`); `Scans:` the number of `scan` events, the number of `off` events on one line (never listed one by one), `busy` events; `Built` (a `release` with `merged`: key, commit, minutes); `Failed or stopped` (key, result, reason); `Waiting for Jack` (`awaiting-jack`, `stopped`); `Skipped` (each distinct ticket and reason from `skip` events and the scans' `skipped` counts); `Still building` (the lock; plus `lock older than 8 h: release it with dg autonomous release --ticket <key> --result stopped` when `to - claimedAt > 8 h`).
`runReport`: `from = readLastReport(dir)` or, when none, the time of the first line of the oldest events file or `now` if there is none; `to = now()`; `events = readEvents(dir, from, to)`; write `reports/<stampOf(to)>.md` (atomic temp + rename); `tracker.comment("DGS-548", text)`; then `writeLastReport(dir, to)`. A comment failure is logged to stderr, the file is kept and `last-report.json` is still written (the file is the record). The scheduler's one-run-per-slot rule and `back` are the only callers, so a second report in the same minute (an empty period, one more comment) is honest rather than hidden; its file gets a `-2` suffix (then `-3`), never overwriting the first.
- [ ] **Step 1: Failing tests:** a period with two scans, one merged release, one failed release, one skipped ticket, an away pair and a held lock renders every section with the right keys; `off` events are counted, not listed; an empty period renders `Scans: 0` and `none` sections; a lock older than 8 h shows the warning; **the second report covers only the time since the first** (events before `last-report.json` are absent); with no `last-report.json` the first report starts at the first event; a failing comment leaves the file and still updates `last-report.json`; an open `away-on` shows `still away`.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/report.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the autonomous report`.

### Task 11: The real tracker
**Files:** Create `tracker-clickup.ts`; test `tracker-clickup.test.ts`.
**Consumes:** the `probe.md` answers (Task 1) and `ClickUpClient` (`searchTeamTasks`, `getTaskByRef`, `updateTask`, `addTaskComment`, `getListStatuses`) from `packages/clickup-client/src/client.ts`.
**Produces:** `class ClickUpLoTracker implements Tracker` constructed with `(client: ClickUpClient, spaceId: string)`. `listToDo`: `client.searchTeamTasks(spaceId)` then keep `status.status === "to do"` (the client has no status filter; open tasks only, 10 pages of 100 is the existing cap, the test pins that a space with 250 tasks still finds a `to do` ticket on page 3); map each task to `LoTask` (priority `Number(priority.id)`, `due_date` and `date_created` as numbers, `Sign-off` option name by the field's `value` index per the probe, milestone and blockers per the probe, attachments titles; when the team search lacks attachments or dependencies, fetch `getTaskByRef(id)` for that ticket). `hasStatus`: read the statuses of one list in the space with `client.getListStatuses` and compare lower-case. `setStatus`: `updateTask(id, { status })`. `getStatus`: `getTaskByRef(id).status.status`. `comment`: `addTaskComment(taskId, text)` after `getTaskByRef(ref)` for a key.
- [ ] **Step 1: Failing tests** with a hand-made fake `ClickUpClient` object (only the five methods; the fixture JSON copied from `probe.md`'s shapes with no real ids of secrets): a mixed result (`to do`, `in progress`) keeps only `to do`; priority, due, created, sign-off, milestone, blockers and attachment titles map as in the fixture; a blocker whose own status is `done` or `closed` maps to `done: true`; `setStatus` sends `{ status: "in progress" }`; `getStatus` returns the status text; `comment("DGS-548", t)` resolves the key first.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/tracker-clickup.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the ClickUp tracker for Autonomous`.

### Task 12: The `dg autonomous` command group
**Files:** Create `index.ts`, `index.test.ts`; modify `packages/cli/src/index.ts` (one `import autonomousCommand from "./autonomous/index.ts";`, one `.command(autonomousCommand)` after `.command(reviewerCommand)`).
**Produces:** a yargs `CommandModule` `autonomous` with subcommands, modelled on `packages/cli/src/steward/index.ts`: `scan [--dry-run] --repo <path> [--orders <dir>]` (prints one line per outcome, plus the verdict table for a dry run; exit 0 for every outcome except an unexpected throw, exit 1), `away [--until HH:MM]` (prints the resolved `until` in UTC+7 and the run-now result), `back` (prints the run-now result), `release --ticket K --result merged|failed|stopped|awaiting-jack [--reason ..] [--commit ..]`, `report`, `status` (prints: `away: on until <UTC+7>` or `away: off`; `lock: <ticket> since <UTC+7>` or `lock: none`; `last scan: <UTC+7> <kind>` from the newest `scan`, `off` or `busy` event, or `last scan: none`; the path and first 20 lines of the newest report). Defaults: orders dir `~/.digismith-depot/sessions/DigiSmith/orders`, conductors file `~/.digismith-depot/conductors.json`, `scanId` = `crypto.randomUUID()`. `defaultDeps()` builds the real objects (`createClient()`, `DIGISMITH_SPACE_ID`, `fs.existsSync`, the real `Exec`, `defaultNexus()` with the real `fetch`); the handlers take an injected factory as `createAddCommentCommand(clientFactory)` does, so tests never reach `createClient`.
- [ ] **Step 1: Failing tests:** `buildCli(["autonomous","scan","--help"])` lists `--dry-run` and `--repo`; `scan` without `--repo` exits non-zero with a message; `release` with `--result bogus` is refused by yargs choices; `away --until 7pm` exits non-zero and writes no file; with an injected factory and temp dir: `away --until 18:00` prints the resolved time and writes `away.json`; `back` leaves the file with `away: false`; `status` on an empty temp dir prints `away: off`, `lock: none`, `last scan: none` and exits 0; after `away`, `status` prints `away: on until`; a `scan --dry-run` with the fake tracker prints the verdict rows, works at any hour and writes nothing.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/index.test.ts packages/cli/src/index.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run both plus `pnpm vitest run packages/cli`. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the dg autonomous command group`.

### Task 13: Catch-up section
**Files:** Create `scripts/conductor/autonomous-section.ts`, `scripts/conductor/autonomous-section.test.ts`; modify `scripts/conductor/cli.ts` (read it first: the place where `renderText(state)` is printed for `consult`).
**Produces:** `export function autonomousSection(dir: string, now: Date): string` returns `""` when `<dir>/reports/` has no file or the newest file is older than 24 h (file mtime); otherwise `\n## Autonomous Operation, last report\n` and the report text without its title line. `cli.ts` appends the section to the consult output; every other output stays byte-identical.
- [ ] **Step 1: Failing tests:** no reports folder -> `""`; a report written 2 h ago -> contains its `Built` lines under the heading; a report 30 h old -> `""`; with two reports the newer is used. `scripts/conductor/cli.test.ts`: the consult output without a report equals the old output (existing tests stay green unchanged).
- [ ] **Step 2:** Run `pnpm vitest run scripts/conductor`. Expected: FAIL (new tests). **Step 3:** Implement. **Step 4:** Run. Expected: PASS, all existing conductor tests green. **Step 5:** Commit `feat(dgs-486): show the autonomous report in the catch-up`.

### Task 14: Register the two jobs
**Files:** Modify `scripts/nexus-api/src/scheduler/registry.ts` and `registry.test.ts` (both on main).
**Produces:** two `defineJob` entries in `JOBS`, before `validateJobs(JOBS)` runs, in the file's own style (no semicolons, single quotes) and with `file: process.execPath` like `selftest`. The `dg` entry point and the checkout are absolute paths built from `homedir()` (add `import { homedir } from 'node:os'` and `join` to the existing `node:path` import):
```ts
const DEPOT = join(homedir(), '.digismith-depot')
const DG = ['--experimental-strip-types', join(DEPOT, 'repo', 'packages', 'cli', 'src', 'index.ts')]
const MAIN_CHECKOUT = join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith')
// in JOBS:
defineJob({
  name: 'autonomous-scan',
  description: 'Autonomous Operation: at night or while Jack is away, claim one ready to-do ticket and hand it to the conductor',
  schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 60 },
  command: { file: process.execPath, args: [...DG, 'autonomous', 'scan', '--repo', MAIN_CHECKOUT] },
  timeoutMs: 5 * 60 * 1000, catchUp: 'skip', order: 50, notify: 'failures', manualOutsideWindow: 'allowed',
}),
defineJob({
  name: 'autonomous-report',
  description: 'Autonomous Operation: write the report for the time since the previous report',
  schedule: { atUtc7: '06:00', windowEndUtc7: '07:00' },
  command: { file: process.execPath, args: [...DG, 'autonomous', 'report'] },
  timeoutMs: 5 * 60 * 1000, catchUp: 'run-once-in-window', order: 60, notify: 'failures', manualOutsideWindow: 'allowed',
}),
```
The scan window is the closest fit to "the whole day" (see "DGS-456 as built"). `manualOutsideWindow: 'allowed'` on the scan, because the command's own work rule (night or away) is the guard; a refused run-now would block `away` in the daytime.
- [ ] **Step 1: Failing tests** added to `registry.test.ts`: both names are present, url-safe and unique; every command path is absolute; `validateJobs(JOBS)` does not throw; **the scan has 24 slots for one night key** (`slotsOfNight('2026-10-19', scanSchedule)` from `clock.ts`: 00:00, 01:00 ... 23:00, in order, each before the window end); the report has one slot at 06:00; both have `manualOutsideWindow: 'allowed'`; the scan has `catchUp: 'skip'`; change the existing assertion `expect(JOBS.map((j) => j.name)).toEqual(['selftest'])` to `['selftest', 'autonomous-scan', 'autonomous-report']` and keep the other selftest tests as they are.
- [ ] **Step 2:** Run `pnpm vitest run scripts/nexus-api/src/scheduler/registry.test.ts`. Expected: FAIL. **Step 3:** Add the entries. **Step 4:** Run `pnpm vitest run scripts/nexus-api`. Expected: PASS. **Step 5:** Commit `feat(dgs-486): register the autonomous jobs`.

### Task 15: Conductor runbook text
**Files:** Create `.digismith/board/DGS-486—autonomous-scan/runbook-text.md` (in the repo; the runbook itself is untracked, so the Maestro applies this text).
- [ ] **Step 1:** Write the section "Autonomous order": (1) an order file named `order-ao-<stamp>-<KEY>.md` plus a prompt line `Autonomous order: build <KEY>, read <path>` means an Autonomous Operation build (night or away); read the order; (2) build with the normal flow (seat rule, Builder in role mode, Reviewers, merge, hooks 01-03, report.html, plan.md); (3) the mandate and the stop rule, word for word as in the order; (4) the closing command `dg autonomous release --ticket <KEY> --result ...`, run even when the build fails; (5) a `Sign-off: Jack` ticket stops at acceptance with `awaiting-jack`; (6) never clear `lock.json` or `away.json` by hand; (7) `dg autonomous status` shows away, the lock and the last scan.
- [ ] **Step 2:** Commit `docs(dgs-486): add the conductor runbook text`.

### Task 16: Mutation checks and report
Done by hand once, noted in `report.md`: (1) lock created without `wx` -> the two-scans-at-once test fails; (2) skip the status read-back -> `readBackWrong` test fails; (3) work rule `inNightWindow` bound `h < 6` to `h <= 6` -> the 06:00 clock test fails; (4) move the work rule after the tracker call -> the "`off` makes zero tracker calls" test fails; (5) drop `isAway` from the work rule -> the daytime-away scan test fails; (6) drop the `notes.json` comparison -> the "one comment on repeat" test fails; (7) remove the `status === "to do"` filter -> the mixed-status tracker test fails; (8) make `runRelease` clear a lock of another ticket -> the foreign-lock test fails; (9) delete `away.json` in `runBack` -> the "file still present" test fails; (10) make `readEvents` ignore `fromMs` -> the "second report covers only the time since the first" test fails. Restore each mutation; the full suites `pnpm vitest run packages/cli scripts/conductor scripts/nexus-api` are green at the end.

## Self-review against the spec
Section 0 (registry window, closest fit): Task 14. 1 (commands): Tasks 7 to 12. 2 (away switch, `--until`, expiry, `back`): Tasks 2, 4, 7, 8, 12. 3 (scan, work rule, `off` before any ClickUp call, status check, ranking): Tasks 2, 8, 11. 4 (Definition of Ready, one comment): Tasks 5 and 8. 5 (lock, claim, read-back, stuck lock never cleared): Tasks 3, 8, 10. 6 (order and prompt, runbook): Tasks 6 and 15. 7 (scan again at once): Task 9. 8 (reports at 06:00 and on `back`, period since the previous report, consult): Tasks 3, 10, 13, 14. 9 (mandate): Task 6 text, Task 15. 10 (files): Tasks 3 and 4. 11 (tests without Jack): each task's Step 1; mutations in Task 16. 12 (first use): below. The phone switch is out of scope (design, "Not in this ticket"). Read at build time only: the Task 1 probe answers and the shape of `~/.digismith-depot/conductors.json` (Task 6 step 1).

## Jack's step list
Every step is Jack's; an agent never runs them. DGS-456 is on main; its steps J1 to J3 come first if not done. This ticket adds, after its own merge and install (an agent runs `install.sh` and `pnpm --filter @digismith/cli build`, both inside the depot and repo):
**A1.** Restart the running API once, so it loads the two new registry entries (the DGS-456 restart command; if the Maestro folds this into J1, no extra restart):
```
launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api
```
**A2.** Read only, any time: `dg autonomous scan --dry-run --repo ~/Workspace/Jazurite/DigiSmith` lists the `to do` tickets and each verdict. It writes nothing. `dg autonomous status` shows away off and no lock.
**A3.** Put one small `Sign-off: Auto` ticket with spec, plan and a milestone into `to do`. Run `dg autonomous away --until <HH:MM>` before leaving (a commute length). When back: `dg autonomous back`. Expected: the first scan at once, one claim, one merge, the lock cleared, the report as a comment on DGS-548 and in the catch-up, no model tokens spent by the empty scans.
**A4.** Later, one real night with no `away` (the night window alone).
Risks to watch (not steps): a LaunchAgent starts with a short `PATH` (the registry uses absolute paths); a conductor that is busy when the prompt arrives (the prompt queues in its pane; the report names a lock older than 8 h); the status after a stop waits for DGS-490; `back` while a build runs does not stop it.

## Not in this ticket
Push or email of the report (DGS-448), the status after a stop (DGS-490), switching away on or off from the phone through the Nexus API (later), parallel Autonomous builds, other spaces, any conductor change beyond the runbook text.
