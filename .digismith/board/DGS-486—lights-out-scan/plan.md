# Lights-Out scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dg lightsout scan | release | report | status` plus two Nexus scheduler jobs, so an unattended night run claims one ready `to do` ticket per hour, hands it to the digismith-conductor, and reports in the morning.

**Architecture:** Plain TypeScript in `packages/cli/src/lightsout/`, one unit per file, every outside effect (ClickUp, herdr, Nexus, clock, depot folder) passed in as a dependency so tests use fakes. State is files in the depot (`lock.json`, `notes.json`, `events-<night>.jsonl`, `reports/<night>.md`). The scan never starts a worker; it writes an order and prompts the conductor.

**Tech Stack:** Node 22 with `--experimental-strip-types`, TypeScript, yargs (as in `packages/cli/src/steward/index.ts`), Vitest from the repo root, `@digismith/clickup-client`. pnpm only.

## Global Constraints
Design: `design.md` (same folder), approved at checkpoint 1 (rev 1; section 0 settled as option A by the Maestro).
- Window `23:00` to `06:00` UTC+7, every 60 min; fixed +7 h offset on UTC milliseconds, one injectable `now()`. Night id = the UTC+7 date of `now - 7 h`.
- DigiSmith space id `1301150000001271` (`DIGISMITH_SPACE_ID` in `packages/cli/src/clickup/lib.ts`). Starter status `to do`; claim status `in progress`. Candidate types: Task and Bug only (Epic, Initiative, Spike are skipped, never commented).
- Order: priority (urgent first, none last), due date (earliest first, none last), created (oldest first). One ticket per scan.
- Lock `~/.digismith-depot/lightsout/lock.json`, created with flag `wx`. A scan never clears a lock. Claim order: lock, `in progress`, read back, order file, conductor prompt. Any failure: remove lock, set the ticket back to `to do`, log `claim-failed`.
- One comment per distinct set of Definition of Ready reasons (`notes.json` hash); never one per hour.
- Mandate text in every order: allowed merge, push, restart an installed service; never `sudo`, a new background service or LaunchAgent, a delete, a Caddy or Tailscale change.
- No test touches the real ClickUp, the real depot, Nexus (4300), herdr or a conductor. `LIGHTSOUT_DIR` overrides the state folder; `DIGISMITH_DEPOT_DIR` the depot (existing `depotDir()` in `scripts/depot-dir.ts` and the CLI's own helper).
- herdr only through `~/.digismith-depot/bin/herdr-ws`. No AI attribution in commits; title-only conventional commits; commit by named paths.
- **No build before the Maestro's order, after DGS-456 is merged.** Tasks 11 and 12 edit files that exist only after that merge.

## DGS-456 registry fields (read from rev 3 of its design.md, line 19-33)
`JobDef = { name, description, schedule: { atUtc7, windowEndUtc7, everyMinutes? }, command: { file, args }, timeoutMs, catchUp, order, notify, manualOutsideWindow }`. `everyMinutes` is 5 to 720; a window ending before its start crosses midnight; one run per slot. Run-now: `POST http://127.0.0.1:4300/api/v1/jobs/<name>/run`, `Content-Type: application/json`, `X-Nexus-Token` from `$NEXUS_STATE_DIR/token` (default `~/.digismith-depot/nexus/scheduler/token`), body `{"confirm":"<name>"}`; 202 accepted, 409 `already_running`, 403 `forbidden`.

## Files
```
packages/cli/src/lightsout/
  types.ts           LoTask, Tracker, Event, Lock, ScanDeps, ReleaseDeps, ReportDeps
  clock.ts           utc7(), nightOf(), inWindow(), fmtUtc7()
  state.ts           lightsoutDir(), acquireLock(), readLock(), clearLock(), notes, appendEvent(), readEvents()
  rank.ts            rankTasks()
  ready.ts           checkReady()  -> string[] of failed-check reasons
  order.ts           renderOrder(), orderPath()
  conductor.ts       promptConductor() through herdr-ws (injectable exec)
  nexus.ts           runNow()
  tracker-clickup.ts the real Tracker (ClickUpClient)
  fake-tracker.test-util.ts   in-memory Tracker for tests
  scan.ts            runScan()
  release.ts         runRelease()
  report.ts          buildReport(), runReport()
  index.ts           yargs group `lightsout`
  *.test.ts
packages/cli/src/index.ts                      register lightsoutCommand (one import, one .command line)
scripts/conductor/lightsout-section.ts (+test) the catch-up section
scripts/conductor/cli.ts                       append the section to the consult output
scripts/nexus-api/src/scheduler/registry.ts    two entries (after DGS-456 merged)
.digismith/board/DGS-486—lights-out-scan/probe.md   task 1 findings
.digismith/board/DGS-486—lights-out-scan/runbook-text.md   the conductor runbook section (the Maestro applies it)
```

## Tasks (all test first; run tests with `pnpm vitest run packages/cli/src/lightsout`)

### Task 1: Probe the real ticket shape (read only)
**Files:** Create `.digismith/board/DGS-486—lights-out-scan/probe.md`.
**Produces:** the exact answers Tasks 5 and 8 need: (a) where the milestone lives on a ticket; (b) the shape of `dependencies` on a ticket that is blocked; (c) the `attachments` item shape; (d) the `custom_item_id` of Task, Bug, Epic, Initiative, Spike; (e) the `Sign-off` field id and option ids; (f) whether `searchTeamTasks` returns `attachments` and `dependencies` (it may omit them, then the tracker fetches `getTaskByRef` for the few tickets that reach the Definition of Ready check).
- [ ] **Step 1:** Run, read only: `dg clickup list-task-types`; `dg clickup get-task DGS-469` (a done ticket, find the milestone: a custom field, a link to a milestone task, or a parent); `dg clickup get-task DGS-548` (milestone and initiative links); `dg clickup list-fields --list 1301150000004127 --json` (Sign-off ids). For (b) find a blocked ticket with `dg clickup list-tasks --list 1301150000004127` and `get-task` on one with a dependency; if none exists, read `packages/clickup-client/src/types.ts` `DependencyRelation` and the `add-dependency` command's API path and record the documented shape from there.
- [ ] **Step 2:** Write the five answers into `probe.md` as a table (item, answer, source command). No token, key or `.env` value in it.
- [ ] **Step 3:** Commit: `git add ".digismith/board/DGS-486—lights-out-scan/probe.md" && git commit -m "docs(dgs-486): record the ticket shape probe" -- ".digismith/board/DGS-486—lights-out-scan/probe.md"`.
If the milestone cannot be found as a field, link or parent, **stop and tell the conductor**; Task 5 does not guess.

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
export type EventKind = "scan" | "outside-window" | "busy" | "skip" | "claim" | "claim-failed" | "no-starter-status" | "release" | "run-now";
export interface Event { ts: string; tsUtc7: string; night: string; kind: EventKind; [k: string]: unknown }
export interface Lock { ticket: string; taskId: string; claimedAt: string; claimedAtUtc7: string; order: string; scanId: string }
// clock.ts
export const OFFSET_MS = 7 * 3600_000;
export const nightOf = (now: Date): string => new Date(now.getTime() - 7 * 3600_000 + OFFSET_MS).toISOString().slice(0, 10);  // UTC+7 date of (now - 7 h);
export function inWindow(now: Date): boolean { const h = new Date(now.getTime() + OFFSET_MS).getUTCHours(); return h >= 23 || h < 6; }
export function fmtUtc7(now: Date): string { return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 19).replace("T", " "); }
// rank.ts
export function rankTasks(tasks: LoTask[]): LoTask[];   // priority asc (null last), due asc (null last), created asc; stable; does not mutate
```
- [ ] **Step 1: Failing tests.** `clock.test.ts`: `inWindow(new Date("2026-10-18T16:00:00Z"))` (23:00 UTC+7) is true; `16:00:00Z` minus 1 ms false; `2026-10-18T22:59:59Z` (05:59:59) true; `23:00:00Z` (06:00) false; `nightOf(new Date("2026-10-18T16:30:00Z"))` is `"2026-10-18"`; `nightOf(new Date("2026-10-18T19:00:00Z"))` (02:00 on the 19th) is `"2026-10-18"`; `nightOf(new Date("2026-10-18T23:30:00Z"))` (06:30 on the 19th) is `"2026-10-18"`; across a month end `nightOf(new Date("2026-10-31T19:00:00Z"))` (02:00 on 1 Nov) is `"2026-10-31"`; `fmtUtc7(new Date("2026-10-18T16:19:47Z"))` is `"2026-10-18 23:19:47"`. `rank.test.ts`: priority 2 before 3 before none; equal priority, earlier due first, no due last; equal both, older created first; input array unchanged.
- [ ] **Step 2:** `pnpm vitest run packages/cli/src/lightsout/clock.test.ts packages/cli/src/lightsout/rank.test.ts` Expected: FAIL (modules missing).
- [ ] **Step 3:** Write `types.ts`, `clock.ts` as above, and
```ts
// rank.ts
import type { LoTask } from "./types.ts";
const last = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
export function rankTasks(tasks: LoTask[]): LoTask[] {
  return [...tasks].sort((a, b) => last(a.priority) - last(b.priority) || last(a.due) - last(b.due) || a.created - b.created);
}
```
(`Infinity - Infinity` is `NaN`, which `||` treats as falsy, so equal nulls fall through; the test for two no-priority tickets pins this.)
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(dgs-486): add the lightsout types, clock and rank` with the six paths.

### Task 3: State (lock, notes, events)
**Files:** Create `state.ts`; test `state.test.ts`.
**Consumes:** `Lock`, `Event`, `Date`, `nightOf`, `fmtUtc7`.
**Produces:**
```ts
export function lightsoutDir(env = process.env): string;           // LIGHTSOUT_DIR, else <DIGISMITH_DEPOT_DIR or ~/.digismith-depot>/lightsout
export function acquireLock(dir: string, lock: Lock): "acquired" | "busy";   // writeFileSync(..., { flag: "wx" }); EEXIST -> "busy"; other errors throw
export function readLock(dir: string): Lock | null;                // no file -> null; a corrupt file -> a lock with ticket "?", so the scan stays busy
export function clearLock(dir: string): void;                      // rmSync force
export function readNotes(dir: string): Record<string, string>;
export function writeNotes(dir: string, notes: Record<string, string>): void;   // temp file + rename
export function appendEvent(dir: string, now: Date, kind: EventKind, fields?: Record<string, unknown>): void;   // one appendFile of one JSON line to events-<nightOf(now)>.jsonl
export function readEvents(dir: string, night: string): Event[];   // missing file -> []; a bad line is skipped
```
- [ ] **Step 1: Failing tests** (temp dir per test with `mkdtempSync`): two `acquireLock` calls give `"acquired"` then `"busy"`; ten `acquireLock` calls started in `Promise.all` give exactly one `"acquired"`; `readLock` returns the written lock; a lock file holding `not json` makes `readLock` return an object whose `ticket` is `"?"` (the scan stays busy, never frees on a corrupt file); `clearLock` then `acquireLock` gives `"acquired"`; `writeNotes` then `readNotes` round-trips and leaves no `.tmp` file; `appendEvent` twice writes two valid JSON lines with `kind`, `night` and `tsUtc7`; `readEvents` skips a garbage line; `lightsoutDir({ LIGHTSOUT_DIR: "/x" })` is `"/x"`, and with only `DIGISMITH_DEPOT_DIR: "/d"` is `"/d/lightsout"`. Create the folder on first write (`mkdirSync recursive`).
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/lightsout/state.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with `node:fs` only. Core of the lock:
```ts
export function acquireLock(dir: string, lock: Lock): "acquired" | "busy" {
  mkdirSync(dir, { recursive: true });
  try { writeFileSync(join(dir, "lock.json"), JSON.stringify(lock), { flag: "wx" }); return "acquired"; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return "busy"; throw e; }
}
```
- [ ] **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the lightsout state files`.

### Task 4: Definition of Ready
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
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/lightsout/ready.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement per the rules. The milestone and blocker inputs are already mapped into `LoTask` by Task 8, so this file has no ClickUp knowledge.
- [ ] **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the Definition of Ready check`.

### Task 5: Order file and conductor prompt
**Files:** Create `order.ts`, `conductor.ts`; tests `order.test.ts`, `conductor.test.ts`.
**Produces:**
```ts
export function orderPath(ordersDir: string, night: string, key: string): string;   // <ordersDir>/order-lo-<night>-<KEY>.md
export function renderOrder(i: { key: string; name: string; taskId: string; signOff: "Auto" | "Jack"; claimedAtUtc7: string; night: string; specPlan: string }): string;
export type Exec = (file: string, args: string[]) => Promise<{ code: number; stderr: string }>;
export async function promptConductor(exec: Exec, conductorsJson: string, message: string): Promise<void>;   // throws on a missing conductor entry or a non-zero exit
```
`renderOrder` text: title `# Order lo-<night>: build <KEY> (Lights-Out)`; a line `From: dg lightsout scan, <claimedAtUtc7> UTC+7`; ticket line with title and task id; Sign-off; `Spec and plan:` the `specPlan` text; the standing steps (build per the conductor runbook: seat rule, Builder in role mode, Reviewers, merge, hooks 01-03, report.html, plan.md); the **Night mandate** paragraph (Global Constraints wording, verbatim); the stop rule (`release --result stopped --reason "<what is needed>"`, ticket waits for Jack, comment on the ticket and lock cleared); the `Sign-off: Jack` rule (run to the acceptance point, then `release --result awaiting-jack`); and the last step `dg lightsout release --ticket <KEY> --result <merged|failed|stopped|awaiting-jack> [--reason "..."]`.
`promptConductor` reads `conductorsJson` (`~/.digismith-depot/conductors.json`; **Step 1 of the task reads the file's shape and writes it into the test**), finds the digismith-conductor entry's agent name, and runs `exec("/Users/workbox/.digismith-depot/bin/herdr-ws", ["agent", "prompt", <name>, message])`. The argv is built, never a shell string.
- [ ] **Step 1: Failing tests:** `orderPath` result; the order text contains the key, the task id, the mandate words `sudo`, `LaunchAgent`, `delete`, the `release` command with the key, and for `signOff: "Jack"` the `awaiting-jack` rule; `promptConductor` calls the fake `exec` once with `["agent","prompt","<name>","<message>"]` (a message with `;` and quotes stays one argument); a non-zero exit throws with the stderr; a conductors file without the entry throws.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/lightsout/order.test.ts packages/cli/src/lightsout/conductor.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement; the real `Exec` (used only by `index.ts`) is `execFile` promisified, no shell. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the Lights-Out order and conductor prompt`.

### Task 6: Fake tracker and the scan
**Files:** Create `fake-tracker.test-util.ts`, `scan.ts`; test `scan.test.ts`.
**Consumes:** Tasks 2 to 5. **Produces:**
```ts
export interface ScanDeps {
  tracker: Tracker; dir: string; ordersDir: string; conductorsJson: string; repo: string;
  now: () => Date; scanId: string; exec: Exec; fileExists: (p: string) => boolean; dryRun: boolean;
}
export interface ScanResult {
  outcome: "outside-window" | "busy" | "no-starter-status" | "none" | "claimed" | "claim-failed";
  claimed?: string;            // ticket key
  candidates: number;
  skipped: { key: string; reason: string }[];
  verdicts?: { key: string; reasons: string[] }[];   // dry run only
}
export async function runScan(d: ScanDeps): Promise<ScanResult>;
```
`fake-tracker.test-util.ts` exports `class FakeTracker implements Tracker` with a `tasks: Map<string, LoTask & { status: string }>`, `comments: {ref,text}[]`, `statuses: Set<string>`, and switches `failSetStatus`, `readBackWrong` (makes `getStatus` return `"to do"` after a set) for the failure tests.
Algorithm (exact order):
1. `!inWindow(now)` -> `appendEvent("outside-window")`, return (also in dry run: a dry run still prints candidates, so for `dryRun` skip this step and step 2).
2. lock present (`readLock !== null`) -> `appendEvent("busy", { ticket })`, return `busy`.
3. `!(await tracker.hasStatus("to do"))` -> `appendEvent("no-starter-status")`, `tracker.comment("DGS-548", ...)` once (guard with `notes["__no-starter-status"]`), return.
4. `all = await tracker.listToDo()`; keep `typeId` of Task and Bug (ids from Task 1 probe, constants `TYPE_TASK`, `TYPE_BUG` in `ready.ts`); the rest go to `skipped` with reason `type`, no comment.
5. For each of `rankTasks(candidates)`: `reasons = checkReady(...)`. Non-empty: in dry run record the verdict; else if `notes[key] !== hash(reasons.join("|"))` post `Lights-Out skipped this ticket (<fmtUtc7(now)> UTC+7): <reasons joined by "; ">. It stays in to do. Fix and it is picked up on a later scan.` and store the hash; push to `skipped`; continue. Empty (ready): dry run -> record verdict and continue; real run -> claim (below) and stop the walk.
6. Claim: `acquireLock` (`"busy"` -> log `busy`, return). Then `setStatus(taskId, "in progress")`, `getStatus` must equal `"in progress"`. Then write the order (`mkdirSync` the orders dir, `writeFileSync` flag `wx`) and `promptConductor`. On any throw or mismatch: `clearLock`, best-effort `setStatus(taskId, "to do")`, `appendEvent("claim-failed", { ticket, error })`, return `claim-failed`. On success `appendEvent("claim", { ticket, order })`.
7. Always end with one `appendEvent("scan", { candidates, skipped: skipped.length, claimed })` (not in dry run; a dry run writes nothing at all, no event, no note, no lock, no comment, no status).
- [ ] **Step 1: Failing tests** (fixed `now` inside the window, temp dirs, `FakeTracker`, a recording `exec`): empty `to do` -> `none`, one `scan` event, no write calls on the tracker; a ready ticket -> status `in progress`, lock written naming it, order file exists, `exec` called once with the herdr-ws argv; ranking: two ready tickets, the higher priority is claimed and the other stays `to do`; the first fails Definition of Ready, the second is ready -> one comment on the first, the second claimed; a second scan while the first ticket's lock exists -> `busy`, nothing changes; the same failing ticket scanned twice -> exactly one comment, and after its reason set changes (add a milestone, remove the sign-off) a second comment; `readBackWrong` -> lock gone, ticket set back to `to do`, event `claim-failed`; `exec` rejecting -> same; Epic, Initiative, Spike are in `skipped` with reason `type` and get no comment; outside the window -> `outside-window`, tracker untouched; `hasStatus` false -> `no-starter-status`, one DGS-548 comment across two scans; **two scans at once** (`Promise.all` of two `runScan` with the same dir and tracker): exactly one `claimed`, the other `busy`, one order file; dry run: zero tracker writes, no files created in `dir`, `verdicts` filled.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/lightsout/scan.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `scan.ts` per the algorithm and the fake. Hash with `node:crypto` sha1 hex.
- [ ] **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the Lights-Out scan`.

### Task 7: Nexus run-now and release
**Files:** Create `nexus.ts`, `release.ts`; tests `nexus.test.ts`, `release.test.ts`.
**Produces:**
```ts
// nexus.ts
export interface NexusDeps { baseUrl: string; tokenFile: string; fetch: typeof fetch }
export type RunNowResult = { ok: true } | { ok: false; status: number | null; error: string };
export async function runNow(d: NexusDeps, job: string): Promise<RunNowResult>;   // POST <baseUrl>/api/v1/jobs/<job>/run; never throws
export function defaultNexus(env = process.env): { baseUrl: string; tokenFile: string };   // NEXUS_URL or http://127.0.0.1:4300; <NEXUS_STATE_DIR or ~/.digismith-depot/nexus/scheduler>/token
// release.ts
export type ReleaseResult = "merged" | "failed" | "stopped" | "awaiting-jack";
export interface ReleaseDeps { tracker: Tracker; dir: string; now: () => Date; nexus: NexusDeps }
export async function runRelease(d: ReleaseDeps, a: { ticket: string; result: ReleaseResult; reason?: string; commit?: string }): Promise<{ lockCleared: boolean; runNow: RunNowResult | "skipped" }>;
```
`runNow` headers: `Content-Type: application/json`, `X-Nexus-Token: <file content trimmed>`, body `{"confirm":"<job>"}`. A missing token file, a network error, 403 or 409 gives `{ ok: false, ... }`; the token value is never put in an error or an event.
`runRelease`: read the lock. Absent: `appendEvent("release", { ticket, result, note: "no-lock" })`, no clearing, still try run-now. Lock names another ticket: refuse (throw `Error("the lock belongs to <other>")`), change nothing. Otherwise: for `failed`, `stopped`, `awaiting-jack` post one comment on the ticket (`Lights-Out <result> (<fmtUtc7>): <reason>`; a comment failure is logged, never blocks), `clearLock`, `appendEvent("release", { ticket, result, reason, commit, minutes })` (`minutes` from `lock.claimedAt`), call `runNow(nexus, "lightsout-scan")` and `appendEvent("run-now", { ok, status })`. A release after 06:00 appends one line to `reports/<night>.md` if it exists (`late release: <ticket> <result>`), no comment.
- [ ] **Step 1: Failing tests.** `nexus.test.ts` starts a **throwaway `http.createServer` on port 0** with a temp token file and asserts: method POST, path `/api/v1/jobs/lightsout-scan/run`, the three headers and the body; 202 gives `ok: true`; the server answering 409 then 403 gives `ok: false` with the status; a missing token file gives `ok: false` and the text does not contain the token; a closed port gives `ok: false`. `release.test.ts` (fake tracker, fake `nexus.fetch`): `merged` clears the lock, no comment, one `release` event and one run-now call; `failed` posts one comment with the reason; a lock for another ticket throws and keeps the lock; no lock -> `no-lock` note and still a run-now call; a run-now 409 returns `runNow: { ok: false, status: 409 }` and does not throw; a failing comment still clears the lock.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/lightsout/nexus.test.ts packages/cli/src/lightsout/release.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add release and the Nexus run-now call`.

### Task 8: Report
**Files:** Create `report.ts`; test `report.test.ts`.
**Produces:**
```ts
export interface ReportDeps { tracker: Tracker; dir: string; now: () => Date }
export function buildReport(night: string, events: Event[], lock: Lock | null, now: Date): string;   // markdown
export async function runReport(d: ReportDeps, night?: string): Promise<{ file: string; commented: boolean }>;   // night defaults to nightOf(now)
```
`buildReport` sections, each with `none` when empty: `# Lights-Out report, night of <night>`; `Scans: <n>` (count of `scan` events) and the number of `busy` and `outside-window` lines; `Built` (a `release` with `merged`: key, commit, minutes); `Failed or stopped` (key, result, reason; `awaiting-jack` listed under `Waiting for Jack`); `Skipped` (each distinct ticket and reason from `skip` events and the scans' `skipped` lists); `Still building` (the lock, with a warning line when `now - claimedAt > 8 h`: `lock older than 8 h: release it with dg lightsout release --ticket <key> --result stopped`). Times UTC+7.
`runReport`: write `reports/<night>.md` (atomic temp + rename); the first run for a night also `tracker.comment("DGS-548", text)` and writes `reports/<night>.commented`; a second run rewrites the file and posts nothing; a comment failure is logged to stderr and the file stays. The scan's `skip` events: `runScan` (Task 6) must append one `skip` event `{ key, reason }` per skipped ticket; add that line to Task 6 if missing when this task's tests fail.
- [ ] **Step 1: Failing tests:** a night with two scans, one merged release, one failed release, one skipped ticket and a held lock renders every section with the right keys; an empty night renders `Scans: 0` and `none` sections; a lock older than 8 h shows the warning; `runReport` twice gives one comment and the file rewritten; a failing comment leaves the file; `nightOf` at 06:00 UTC+7 reports the night that just ended.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/lightsout/report.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the morning report`.

### Task 9: The real tracker
**Files:** Create `tracker-clickup.ts`; test `tracker-clickup.test.ts`.
**Consumes:** the `probe.md` answers (Task 1) and `ClickUpClient` (`searchTeamTasks`, `getTaskByRef`, `updateTask`, `addTaskComment`, `getListStatuses`) from `packages/clickup-client/src/client.ts`.
**Produces:** `class ClickUpLoTracker implements Tracker` constructed with `(client: ClickUpClient, spaceId: string)`. `listToDo`: `client.searchTeamTasks(spaceId)` then keep `status.status === "to do"` (the client has no status filter; open tasks only, 10 pages of 100 is the existing cap, the test pins that a space with 250 tasks still finds a `to do` ticket on page 3); map each task to `LoTask` (priority `Number(priority.id)`, `due_date` and `date_created` as numbers, `Sign-off` option name by the field's `value` index per the probe, milestone and blockers per the probe, attachments titles; when the team search lacks attachments or dependencies, fetch `getTaskByRef(id)` for that ticket). `hasStatus`: read the statuses of one list in the space with `client.getListStatuses` and compare lower-case. `setStatus`: `updateTask(id, { status })`. `getStatus`: `getTaskByRef(id).status.status`. `comment`: `addTaskComment(taskId, text)` after `getTaskByRef(ref)` for a key.
- [ ] **Step 1: Failing tests** with a hand-made fake `ClickUpClient` object (only the five methods; the fixture JSON copied from `probe.md`'s shapes with no real ids of secrets): a mixed result (`to do`, `in progress`) keeps only `to do`; priority, due, created, sign-off, milestone, blockers and attachment titles map as in the fixture; a blocker whose own status is `done` or `closed` maps to `done: true`; `setStatus` sends `{ status: "in progress" }`; `getStatus` returns the status text; `comment("DGS-548", t)` resolves the key first.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/lightsout/tracker-clickup.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the ClickUp tracker for Lights-Out`.

### Task 10: The `dg lightsout` command group
**Files:** Create `index.ts`, `index.test.ts`; modify `packages/cli/src/index.ts` (one `import lightsoutCommand from "./lightsout/index.ts";`, one `.command(lightsoutCommand)` after `.command(reviewerCommand)`).
**Produces:** a yargs `CommandModule` `lightsout` with subcommands, modelled on `packages/cli/src/steward/index.ts`: `scan [--dry-run] --repo <path> [--orders <dir>]` (prints one line per outcome, plus the verdict table for a dry run; exit 0 for every outcome except an unexpected throw, exit 1), `release --ticket K --result merged|failed|stopped|awaiting-jack [--reason ..] [--commit ..]`, `report [--night YYYY-MM-DD]`, `status` (prints the lock, tonight's event counts, the path and first 20 lines of the newest report). Defaults: orders dir `~/.digismith-depot/sessions/DigiSmith/orders`, conductors file `~/.digismith-depot/conductors.json`, `scanId` = `crypto.randomUUID()`. `defaultDeps()` builds the real objects (`createClient()`, `DIGISMITH_SPACE_ID`, `fs.existsSync`, the real `Exec`, `defaultNexus()`); the handlers take an injected factory as `createAddCommentCommand(clientFactory)` does, so tests never reach `createClient`.
- [ ] **Step 1: Failing tests:** `buildCli(["lightsout","scan","--help"])` lists `--dry-run` and `--repo`; `scan` without `--repo` exits non-zero with a message; `release` with `--result bogus` is refused by yargs choices; with an injected factory, `lightsout status` on an empty temp dir prints `no lock` and exits 0; a `scan --dry-run` with the fake tracker prints the verdict rows and writes nothing.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/lightsout/index.test.ts packages/cli/src/index.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run both plus `pnpm vitest run packages/cli`. Expected: PASS. **Step 5:** Commit `feat(dgs-486): add the dg lightsout command group`.

### Task 11: Catch-up section
**Files:** Create `scripts/conductor/lightsout-section.ts`, `scripts/conductor/lightsout-section.test.ts`; modify `scripts/conductor/cli.ts` (read it first: the place where `renderText(state)` is printed for `consult`).
**Produces:** `export function lightsOutSection(dir: string, now: Date): string` returns `""` when `<dir>/reports/` has no file or the newest file is older than 24 h (file mtime); otherwise `\n## Lights-Out, last night\n` and the report text without its title line. `cli.ts` appends the section to the consult output; every other output stays byte-identical.
- [ ] **Step 1: Failing tests:** no reports folder -> `""`; a report written 2 h ago -> contains its `Built` lines under the heading; a report 30 h old -> `""`; with two reports the newer is used. `scripts/conductor/cli.test.ts`: the consult output without a report equals the old output (existing tests stay green unchanged).
- [ ] **Step 2:** Run `pnpm vitest run scripts/conductor`. Expected: FAIL (new tests). **Step 3:** Implement. **Step 4:** Run. Expected: PASS, all existing conductor tests green. **Step 5:** Commit `feat(dgs-486): show the Lights-Out report in the catch-up`.

### Task 12: Register the two jobs (only after DGS-456 is merged)
**Files:** Modify `scripts/nexus-api/src/scheduler/registry.ts` and its `registry.test.ts` (both exist only after the DGS-456 merge; read the file first and copy the absolute-path form its `selftest` entry uses for `node` and the depot `dg`).
**Produces:** two entries, exact fields from DGS-456 rev 3:
```ts
{
  name: "lightsout-scan",
  description: "Lights-Out: claim one ready to-do ticket and hand it to the conductor",
  schedule: { atUtc7: "23:00", windowEndUtc7: "06:00", everyMinutes: 60 },
  command: { file: NODE, args: [...DG_ARGS, "lightsout", "scan", "--repo", MAIN_CHECKOUT] },
  timeoutMs: 5 * 60_000, catchUp: "skip", order: 50, notify: "failures", manualOutsideWindow: "refused",
},
{
  name: "lightsout-report",
  description: "Lights-Out: write the morning report",
  schedule: { atUtc7: "06:00", windowEndUtc7: "07:00" },
  command: { file: NODE, args: [...DG_ARGS, "lightsout", "report"] },
  timeoutMs: 5 * 60_000, catchUp: "run-once-in-window", order: 60, notify: "failures", manualOutsideWindow: "allowed",
},
```
(`NODE`, `DG_ARGS`, `MAIN_CHECKOUT` are whatever constants or literals the file already uses for absolute paths; do not invent new ones.)
- [ ] **Step 1: Failing tests** added to `registry.test.ts`: both names are present, url-safe and unique; every command path is absolute; the scan's slots are 23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00 (use the DGS-456 clock helper `slots(...)` for one night, name taken from its `clock.ts`); the report has one slot at 06:00; the scan refuses run-now outside the window (`manualOutsideWindow`); `selftest` is no longer "the only registered job" (change that one DGS-456 assertion to "selftest is registered and has no slot").
- [ ] **Step 2:** Run `pnpm vitest run scripts/nexus-api/src/scheduler/registry.test.ts`. Expected: FAIL. **Step 3:** Add the entries. **Step 4:** Run `pnpm vitest run scripts/nexus-api`. Expected: PASS. **Step 5:** Commit `feat(dgs-486): register the Lights-Out jobs`.

### Task 13: Conductor runbook text
**Files:** Create `.digismith/board/DGS-486—lights-out-scan/runbook-text.md` (in the repo; the runbook itself is untracked, so the Maestro applies this text).
- [ ] **Step 1:** Write the section "Lights-Out order": (1) an order file named `order-lo-<night>-<KEY>.md` plus a prompt line `Lights-Out order lo: build <KEY>, read <path>` means a night build; read the order; (2) build with the normal flow (seat rule, Builder in role mode, Reviewers, merge, hooks 01-03, report.html, plan.md); (3) the night mandate and the stop rule, word for word as in the order; (4) the closing command `dg lightsout release --ticket <KEY> --result ...`, run even when the build fails; (5) a `Sign-off: Jack` ticket stops at acceptance with `awaiting-jack`; (6) never clear `lock.json` by hand; (7) `dg lightsout status` shows the lock.
- [ ] **Step 2:** Commit `docs(dgs-486): add the conductor runbook text`.

### Task 14: Mutation checks and report
Done by hand once, noted in `report.md`: (1) lock created without `wx` -> the two-scans-at-once test fails; (2) skip the status read-back -> `readBackWrong` test fails; (3) window bound `h < 6` to `h <= 6` -> the 06:00 clock test fails; (4) drop the `notes.json` comparison -> the "one comment on repeat" test fails; (5) remove the `status === "to do"` filter -> the mixed-status tracker test fails; (6) make `runRelease` clear a lock of another ticket -> the foreign-lock test fails. Restore each mutation; the full suites `pnpm vitest run packages/cli scripts/conductor scripts/nexus-api` are green at the end.

## Self-review against the spec
Section 0: DGS-456 fields in the header and Task 12 (option A, `everyMinutes`, midnight window). 1 (commands): Tasks 6 to 10. 2 (scan, status check, ranking): Tasks 2, 6, 9 (the "to do" status check is `hasStatus`, plus the dry run on first use). 3 (Definition of Ready, one comment): Tasks 4 and 6. 4 (lock, claim, read-back, stuck lock never cleared): Tasks 3, 6, 8. 5 (order and prompt, runbook): Tasks 5 and 13. 6 (scan again at once): Task 7. 7 (report, consult): Tasks 8 and 11. 8 (mandate): Task 5 text, Task 13. 9 (files): Task 3. 10 (tests without Jack): each task's Step 1; mutation list Task 14. 11 (first use): below. No placeholders remain except where a task says to read a file at build time because it exists only after the DGS-456 merge (Tasks 1, 5 step 1, 11, 12).

## Jack's step list
Every step is Jack's; an agent never runs them. The DGS-456 steps J1 to J3 come first (restart the API once, check `selftest`). This ticket adds one step after its own merge and install (an agent runs `install.sh` and `pnpm --filter @digismith/cli build`, both inside the depot and repo):
**L1.** Restart the running API once, so it loads the two new registry entries (the DGS-456 restart command; if the Maestro folds this into J1, no extra restart):
```
launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api
```
**L2.** Read only, any time: `dg lightsout scan --dry-run --repo ~/Workspace/Jazurite/DigiSmith` lists the `to do` tickets and each verdict. It writes nothing.
**L3.** One real night: put one small `Sign-off: Auto` ticket with spec, plan and a milestone into `to do` before bed. Next morning: `dg lightsout status` and the report comment on DGS-548 (or the catch-up). Expected: one claim, one merge, the lock cleared, hourly scans that cost no model tokens.
Risks to watch (not steps): a LaunchAgent starts with a short `PATH` (the registry uses absolute paths); a conductor that is busy when the prompt arrives (the prompt queues in its pane; if the claim looks stuck the report names a lock older than 8 h); the status after a stop waits for DGS-490.

## Not in this ticket
Push or email of the report (DGS-448), the status after a stop (DGS-490), parallel Lights-Out builds, other spaces, any conductor change beyond the runbook text.
