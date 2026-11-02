# DGS-699 Director Implementation Plan

> **For the Builder:** use digismith:subagent-driven-development (or digismith:executing-plans), task by task, test first. Spec: `spec.md` in this folder (read sections 4 to 9, 12 and 13 first). Build in a worktree on a branch, never on main. The express lane is DGS-700: build nothing for it. The herdr session is called **Castle**.

**Goal:** a Director that keeps the Workbox factory running: refine lane in the scan, capacity and seat rank, unblock table, escalation, decision record, the Director card, and the wake-up. Spec: `spec.md`.

**Architecture:** all new code in `packages/cli/src/autonomous/director/` (a protected folder, on purpose: the Director cannot change the code that bounds it without a protected-path merge). Pure functions plus small file stores in the autonomous directory. The scan gains one independent lane. Nothing runs live: fakes only.

**Tech stack:** TypeScript run with `node --experimental-strip-types` (imports end in `.ts`), vitest, pnpm only.

## Setup (once, in the worktree only)

```
pnpm install --frozen-lockfile
```

Test command for every task (changed files only, fork pool of 2):

```
pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 <changed test files>
```

Before the last commit also run the whole folder once: `... vitest run packages/cli/src/autonomous packages/cli/src/run`. The existing tests (`scan.test.ts`, `watch.test.ts`, `limit*.test.ts`, `index.test.ts`) must pass **unchanged**: with no Director wiring, behaviour is as before.

## Global constraints

- Test first: write the test, run it red, write the code, run it green, commit.
- Mocks only: `FakeTracker` (`autonomous/fake-tracker.test-util.ts`), a fake clock (`now: () => Date`), a fake `Exec` (`autonomous/conductor.ts` type), temp dirs with `mkdtempSync(join(tmpdir(), "director-"))` removed in `afterEach`. No live herdr, ClickUp, git remote or network. Never read or print a token or `.env` value.
- Commit titles: conventional, title only, no body, no AI attribution, no `Co-Authored-By`. **Never scope a commit with the ticket key** (no `dgs-699`): the factory scan treats such a commit as a merge. Use scope `autonomous` (code) or `director` (skill files). Commit with a pathspec: `git commit <paths> -m "..."`.
- Times UTC+7 first in any text a human reads (`fmtUtc7` from `autonomous/clock.ts`).
- Protected paths (a merge touching them needs the Maestro): `hooks/`, `hooks/hooks.json`, `skills/finishing-*/`, `skills/reviewer/`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/config.yml`, `.digismith/mandate.yml`, `.digismith/profiles/`. The merge note must also say that the card and authority code are authority paths (spec 4.4). This plan touches `packages/cli/src/autonomous/` (T1 to T6) and `.digismith/config.yml` (T6). Say so in the merge note.
- Not for a Builder: install, start a live Director, edit `~/.digismith-depot/conductors.json`, LaunchDaemons, settings, Nexus jobs, any live `dg director` call against the real depot. A Builder never runs a command that writes to `~/.digismith-depot`; tests use `DIGISMITH_DEPOT_DIR`/`AUTONOMOUS_DIR` temp dirs.
- Two ClickUp tickets are recommended (spec section 12): **Part 1** = T1 to T4, T5 steps a to d, T6 (no blocker); **Part 2** = T5 steps e to f (blocked by DGS-683 tickets 1 and 3). If the factory builds one ticket, build in order T1 to T6 and do T5 e to f last, after those tickets are on main.
- Shared facts (read on main 2026-11-02): `rankTasks` in `rank.ts`; `checkReady`, `TYPE_TASK`, `TYPE_BUG` in `ready.ts`; `acquireLock`, `readLock`, `clearLock`, `atomicWrite`, `appendEvent`, `autonomousDir` in `state.ts`; `appendAttention`, `appendResolved` in `attention-write.ts`; `readOpen`, `OpenItem` in `attention.ts`; `classOfCause` in `causes.ts`; `currentCount`, `startRefusal` in `run/limit-check.ts`; `refusal`, `Count` in `run/limit.ts`; `Tracker`, `LoTask`, `EventKind` in `types.ts`; `FakeTracker` has statuses `to do, claimed, scheduled, in progress, complete`: add `concept` and `refinement` to `tracker.statuses` in the new tests.

## File map

| File (all under `packages/cli/src/autonomous/director/` unless stated) | Task |
|---|---|
| `authority.ts`, `authority.test.ts`, `record.ts`, `record.test.ts`, `escalate.ts`, `escalate.test.ts` | T1 |
| `refine.ts`, `refine.test.ts`; edit `../scan.ts`, `../types.ts`; new `../scan-refine.test.ts` | T2 |
| `capacity.ts`, `capacity.test.ts`, `seat.ts`, `seat.test.ts` | T3 |
| `unblock.ts`, `unblock.test.ts` | T4 |
| `plan.ts`, `plan.test.ts`, `do.ts`, `do.test.ts`, `wake.ts`, `wake.test.ts`, `command.ts`, `command.test.ts`; edit `../scan.ts`, `../watch.ts`, `packages/cli/src/index.ts`; Part 2: `target.ts`, `target.test.ts`, edit `../index.ts` | T5 |
| `skills/director/SKILL.md`, `skills/director/brief.md`, `skills/director/refine-brief.md`, `docs/director.md`, `card.test.ts`, `authority-backstop.ts` (+ test), `../merge-gate.ts`, `../merge-gate.test.ts`; edit `../protected-paths.ts`, `../protected-paths.test.ts`, `../WATCHDOG.md`, `.digismith/config.yml`, `config-protected.test.ts` | T6 |

---

## Task T1: authority list, decision record, escalation

**Files:** `director/authority.ts`, `record.ts`, `escalate.ts` and a `.test.ts` for each.

- [ ] **Step 1: tests first.**

`authority.test.ts`:
- `a within id passes` (`checkAuthority("claim-refine")` is `{ ok: true }`)
- `a Jack-only id is refused with code 3` (`checkAuthority("delete-data")` is `{ ok: false, code: 3 }` and the text contains `outside the Director's authority: use dg director escalate`)
- `an unknown id is refused with code 4`
- `the list has the 11 within ids and the 11 Jack ids of the spec` (assert the exact id sets, section 4)
- `namesAuthorityPath returns whole path TOKENS: "edit director/refine.ts" gives ["director/refine.ts"], "autonomous/protected-paths.ts" gives that token, "the director/ folder" gives ["director/"]; leading ./ and ../ and trailing punctuation are removed; duplicates collapse`
- `one test per full path and per short spelling, including the guard code: authority-backstop.ts, merge-gate.ts, breaker.ts, refine.ts, refine-brief.md (each is a hit)`
- `namesAuthorityPath finds each full path in a text, AND each short spelling: director/authority.ts, autonomous/director/, authority.ts, skills/director, run/limit, limit-check.ts, limit.ts, guardrails.ts, autonomous/protected-paths.ts, protected-paths.ts, config.yml, nightwatch.limits, protected_paths, mandate.yml, profiles/; it is case-insensitive; it returns [] for a text that names none (a text about "directory/listing" is not a hit)`
- `parseApproval reads a description line "Authority change approved by Jack: <date>: <paths>" (case-insensitive, start of line) into { date, paths }; a line without paths is not an approval; a text without the line gives null`
- `isCovered(token, listed): equal is covered; a suffix of a listed path is covered (authority.ts vs packages/cli/src/autonomous/director/authority.ts); a token under a listed folder is covered; a folder token is covered only by a folder approval`
- `approval for director/authority.ts does NOT cover director/refine.ts and does NOT cover a bare director/; approval for packages/cli/src/autonomous/director/ covers both; an approval for guardrails.ts does not cover config.yml; an approval for .digismith/config.yml covers nightwatch.limits and protected_paths`
- `approvalCovers returns the uncovered tokens (empty = covered); a null approval covers nothing`
- `ids are unique and every entry has a reason`

`record.test.ts`:
- `writes the journal line before the comment` (fake tracker records call order; the journal file has one JSON line with `ts, tsUtc7, ticket, id, side, what, why, by: "director"`)
- `a failed journal write throws and sends no comment`
- `a failed comment keeps the journal line and queues the comment in comment-pending.jsonl`
- `reprompt-run and pick-seat get no ClickUp comment`
- `hasDecision(dir, ticket, run, id) finds an earlier line; it is keyed on ticket + run + id: a restart-run line for a refine run does not match a Builder run of the same ticket`; `readDecisions` skips a damaged line
- `retryPendingComments sends the queue and empties it; a still failing comment stays queued`

`escalate.test.ts` (tracker with statuses `concept`, `refinement`, `to do`):
- `first escalation sets concept, reads it back, comments once, records escalations.jsonl and a decision`
- `the same question again is refused with "already asked"`
- `an open escalation on a ticket still in concept does nothing: no second comment, no second status write`
- `after markReturned, the same question is refused with "already asked and answered at <time>"; a different question is accepted`
- `--via-release: no status write, still recorded and commented`
- `status read-back mismatch throws and writes no escalation line`
- `key is ticket|id|sha1(lowercased, whitespace-collapsed question)`: two spellings of one question collide
- `a refused repeat opens an attention item question-already-asked (run <KEY>/escalation, kind unknown), once, never silent`
- `return path: the ticket comes back with the Done when line in its description: no refusal; without it: the repeat is refused and the item opens`

- [ ] **Step 2: run the three tests red.**

- [ ] **Step 3: code.**

`authority.ts`:
```ts
export type Side = "within" | "jack";
export interface AuthorityEntry { id: string; side: Side; text: string; reason: string }
export const AUTHORITY: readonly AuthorityEntry[];
export const AUTHORITY_PATHS: readonly string[];    // spec 4.4, the ten full paths (spec 4.4: the director folder, the card, run/limit, guardrails.ts, protected-paths.ts, merge-gate.ts, breaker.ts, config.yml, mandate.yml, profiles/)
export const AUTHORITY_PATH_SPELLINGS: readonly string[];   // spec 4.4, the short spellings (substring, case-insensitive)
export function namesAuthorityPath(text: string): string[];   // whole path tokens around each spelling hit
export function parseApproval(description: string): { date: string; paths: string[] } | null;
export function isCovered(token: string, listed: readonly string[]): boolean;   // spec 4.4 rule: equal, suffix, or under a listed folder; a folder token needs a folder approval
export function approvalCovers(a: { paths: string[] } | null, tokens: string[]): string[];   // the uncovered tokens
export function isAuthorityFile(path: string): boolean;   // whole tokens at / boundaries or exact basenames, never a bare substring (spec 4.4)
export function fullPathCovered(diffPath: string, listed: readonly string[]): boolean;   // equal, /-boundary suffix, or under a listed folder at a / boundary
export type AuthorityCheck = { ok: true } | { ok: false; code: 3 | 4; text: string };
export function checkAuthority(id: string): AuthorityCheck;   // jack -> 3, unknown -> 4, within -> ok
```
Within ids: `claim-refine, claim-build, start-worker, pick-seat, apply-refinement-gate, reprompt-run, restart-run, release-stopped, escalate-concept, start-ticket-conductor, record-decision`. Jack ids: `delete-data, spend-money, go-public, personal-data, product-taste-names-scope, change-authority, answer-prompt, change-host, close-breaker, merge-protected, rewrite-history`. Copy the `text` and `reason` strings from the spec tables.

`record.ts`:
```ts
export interface DecisionInput { ticket: string; run?: string | null; id: string; side: "within" | "escalated"; what: string; why: string }
export interface RecordDeps { dir: string; now: () => Date; tracker: Tracker }
export function directorDir(dir: string): string;                         // join(dir, "director"), mkdir -p
export async function recordDecision(d: RecordDeps, e: DecisionInput): Promise<void>;
export function readDecisions(dir: string): Decision[];
export function hasDecision(dir: string, ticket: string, run: string | null, id: string): Decision | null;   // the newest match; run is part of the key
export async function retryPendingComments(d: RecordDeps): Promise<number>;
```
Journal first: `appendFileSync(join(directorDir(dir), "decisions.jsonl"), line + "\n")`. Comment text per spec 9. `NO_COMMENT = new Set(["reprompt-run", "pick-seat"])`.

`escalate.ts`:
```ts
export interface EscalateArgs { ticket: string; taskId: string; id: string; question: string; viaRelease: boolean }
export type EscalateResult = { outcome: "asked" | "already-open" } | { outcome: "refused"; text: string };
export async function escalate(d: RecordDeps, a: EscalateArgs): Promise<EscalateResult>;
export function markReturned(dir: string, ticket: string, now: Date): number;   // marks open lines of the ticket "returned"
export const questionKey = (ticket: string, id: string, question: string): string;
```
`escalations.jsonl` lines: `{ key, ticket, id, question, askedAt, askedAtUtc7, state: "open" | "returned", returnedAt? }`; a later line for the same key with `state: "returned"` supersedes the open one (append only). Comment text: `Director (<time> UTC+7): <question>. Needs: <id>. Answer here, then move the ticket back to refinement.`

- [ ] **Step 4: run green, then commit:** `git commit packages/cli/src/autonomous/director/authority.ts packages/cli/src/autonomous/director/authority.test.ts packages/cli/src/autonomous/director/record.ts packages/cli/src/autonomous/director/record.test.ts packages/cli/src/autonomous/director/escalate.ts packages/cli/src/autonomous/director/escalate.test.ts -m "feat(autonomous): add the Director authority list, decision record and escalation"`

**Checked by:** the three test files green. **First use:** `dg director decide` and `escalate` in T5.

---

## Task T2: the refine lane (lock, readiness, release, scan)

**Files:** `director/refine.ts`, `refine.test.ts`; edit `autonomous/types.ts`, `autonomous/scan.ts`; new `autonomous/scan-refine.test.ts`.

- [ ] **Step 1: tests first.**

`refine.test.ts`:
- `hasDoneWhen finds a "Done when" line` (plain, `**Done when**`, `## Done when`, `Done when:`; case-insensitive) `and rejects text without one`
- `checkRefineReady lists: no Done when, open blocker, Mode Manual`; a clean ticket returns `[]`
- `acquireRefineLock is exclusive: the second call returns "busy"`; `clearRefineLock` removes it; `readRefineLock` of a corrupt file returns `{ corrupt: true }`
- `readVerdict: no findings block is not clean`; `[]` is clean; `Minor only` is clean; `one Important is not clean`; the LAST `json findings` block counts
- `refineRelease ready: sets to do, reads it back, clears the lock, records apply-refinement-gate` (tracker has `to do`)
- `refineRelease ready is REFUSED and escalates change-authority when spec.md or plan.md names an authority path (one test per AUTHORITY_PATHS entry), with no status write and the lock kept`
- `... a plan that names director/refine.ts is refused when the approval lists only director/authority.ts (names the uncovered token) and passes when the approval lists the director folder`
- `... a plan that says "remove the check in authority-backstop.ts / merge-gate.ts / breaker.ts" is refused (the guard code is an authority path)`
- `... a plan that names the paths by SHORT spelling only (director/authority.ts, autonomous/protected-paths.ts, limit-check.ts, nightwatch.limits) is refused too`
- `... and passes when the description carries "Authority change approved by Jack: <date>: <paths>" listing every named path; it is refused when the line lists only some of them (the refusal names the uncovered ones); a passing gate writes director/authority-approvals/<KEY>.json`
- `fail closed: boardDir null, spec.md missing or plan.md missing: exit 2, no status write, lock kept`
- `refineRelease (ready, escalated, failed) never calls recordRelease and never touches the breaker file`
- `round 1 dirty report: refineRelease returns code 2 "dirty: relay the confirmed findings"; refineRound sets round 2 in the lock; round 2 clean: ready; round 2 dirty: escalated with the open findings as the question (id product-taste-names-scope) and the lock cleared`
- `a refine lock older than REFINE_LOCK_MAX_AGE_MINUTES (360) is reported by lockAgeMinutes and reaches planLoop as a stuck-lock move (T4)`
- `refineRelease ready with a dirty report is refused (exit 2) and changes nothing`
- `refineRelease ready fails with the checkReady reasons when the re-read ticket has no spec and plan; status unchanged, lock kept`
- `refineRelease failed: first time clears the lock and records; second failure for the same ticket escalates with the cause`
- `refineRelease escalated calls escalate and clears the lock`

`scan-refine.test.ts` (model it on `scan.test.ts`: same `mk` helper style, `FakeTracker`, fake `Exec`):
- `refine lane off when deps.refine is absent: scan behaves as before` (re-assert one existing expectation)
- `claims the first ready refinement ticket in priority, due, age order and prompts the Director` (three tickets, priorities 2, 1, none: priority 1 wins)
- `skips Mode Manual, a type other than Task or Bug, and a ticket with an open blocker`
- `a refinement ticket with no Done when line in the DESCRIPTION is escalated to concept at once with the question "Add a Done when line to this ticket's description, then move the ticket back to refinement.", once` (second scan: no second comment); `back in refinement with the line: claimed; back without it: attention item question-already-asked, no second comment`
- `no refine claim while the breaker is open`; `no refine claim on bad guardrails`; `no refine claim on a bad conductors.json (conductor-config)`
- `a refine claim IS made while the build lock is held, and while the builder limit is full`
- `the build result of runScan is unchanged by the lane: a lane exception is logged as refine-failed and the outcome stays`
- `claims even while the build lock is held` (write a lock with `acquireLock`)
- `does not claim when refine-lock.json exists, or when the role slot is full` (`deps.refine.roleFull` returns a string)
- `a stale refine lock (its ticket is no longer in refinement) is cleared with event refine-release`
- `a ticket that returned from concept (open escalation) marks the escalation returned and puts Jack's text note in the order`
- `a failed prompt clears the lock and appends claim-failed` (like `claim`)
- `status "refinement" missing: attention item, no refine claim` (like `no-starter-status`; cause `refine-status-missing`)
- `dry run lists refine verdicts and writes nothing`
- `a refine claim never writes a ClickUp status` (assert `tracker.calls` has no `setStatus` for the claimed ticket)

- [ ] **Step 2: run red.**

- [ ] **Step 3: code.**

`types.ts`: add `"refine-claim" | "refine-release" | "refine-failed" | "director-tick"` to `EventKind`.

`refine.ts`:
```ts
export const REFINE_STATUS = "refinement";
export const REFINE_LOCK_MAX_AGE_MINUTES = 360;
export const lockAgeMinutes = (l: { claimedAt: string }, now: Date): number;
export interface RefineLock { ticket: string; taskId: string; claimedAt: string; claimedAtUtc7: string; order: string; scanId: string; attempt: number; round: 1 | 2 }
export const hasDoneWhen = (t: LoTask): boolean;                    // /^[\s#>*-]*(?:\*\*)?done when\b/im on t.text
export function checkRefineReady(t: LoTask): string[];
export function acquireRefineLock(dir: string, l: RefineLock): "acquired" | "busy";   // writeFileSync flag "wx" on refine-lock.json
export function readRefineLock(dir: string): RefineLock | null | { corrupt: true };
export function clearRefineLock(dir: string): void;
export function readVerdict(reportPath: string): { clean: boolean; blocking: number; problem: string | null };
export const refineOrderPath = (ordersDir: string, stamp: string, key: string): string;   // order-ar-<stamp>-<KEY>.md
export function renderRefineOrder(i: { key: string; name: string; taskId: string; claimedAtUtc7: string; stamp: string; answer: string | null }): string;
export interface RefineReleaseDeps extends RecordDeps { checkReadyCtx: ReadyCtx; boardDir: (ticket: string) => string | null; readDescription: (ticket: string) => Promise<string> }
export function refineRound(dir: string): void;   // sets round 2 in the lock
export async function refineRelease(d: RefineReleaseDeps, a: { ticket: string; result: "ready" | "escalated" | "failed"; report?: string; question?: string; cause?: string }): Promise<{ code: 0 | 2; text: string }>;
```
The order text steps (mirror `order.ts`): 1 start a refine worker from `skills/director/refine-brief.md` under the role limit with the seat from `dg director seat`; 2 ASK the project conductor to start a `ticket` plan Reviewer (the Reviewer card is protected and unchanged: the Director never starts a Reviewer); 3 on a dirty report verify each finding, relay the confirmed ones to the refine worker once, ask for one scoped re-review (`dg director refine-round`); 4 attach `spec.md` and `plan.md` with `dg clickup upload-attachment`; 5 run `dg director refine-release --ticket <KEY> --result ready --report <report.md>` or `--result escalated --question "..."`; the mandate lines (no sudo, no delete, no new service). `answer` is the newest Jack comment text when the ticket came back from concept (read from `LoTask.text` only; if no comment text is available in `LoTask`, write "see the ticket comments").

`scan.ts` (small, local; existing code untouched):
- `ScanDeps` gains `refine?: { prompt: (msg: string) => Promise<void>; roleFull: () => string | null; ordersDir?: string }`.
- Rename the current exported `runScan` body to `runBuildScan` (same signature, same code). The new exported `runScan(d)` is: `const r = await runBuildScan(d); if (d.refine && !["breaker", "guardrail-config", "conductor-config"].includes(r.outcome)) { try { await runRefineLane(d, ...) } catch { appendEvent(... "refine-failed") } } return r;`. So the lane runs after the breaker, guardrail and conductor-config stops and also when the outcome is `busy` (lock held, builder limit). The build result is never changed by the lane.
- `runRefineLane`: `hasStatus("refinement")` else attention `refine-status-missing` (resolved on a clean read); lists `refinement`; clears a stale lock; marks returned escalations; returns when a lock exists or `roleFull()` is non-null; walks `rankTasks` over Task/Bug and non-Manual tickets; `checkRefineReady` non-empty: if the only reason is the missing Done when line, `escalate(...)` once (id `product-taste-names-scope`, the description-wording question), else skip with one comment per reason hash (same `notes` mechanism as `claim` skips); first ready one: `acquireRefineLock`, write the order with `wx`, prompt, event `refine-claim`, `recordDecision` `claim-refine`; any failure clears the lock, removes only the order it wrote, event `claim-failed`.
- The lane does nothing in `dryRun` except push `verdicts` rows (`{ key, reasons }`).

- [ ] **Step 4: run green** (`refine.test.ts`, `scan-refine.test.ts`, and `scan.test.ts` unchanged). **Commit:** `feat(autonomous): add the refinement lane to the scan` (paths: the new files and `scan.ts`, `types.ts`).

**Checked by:** `scan-refine.test.ts`. **First use:** `dg autonomous scan --dry-run` on the live data (read only, by the conductor) lists refinement verdicts once T5 wiring exists.

---

## Task T3: capacity and seat rank

**Files:** `director/capacity.ts`, `capacity.test.ts`, `seat.ts`, `seat.test.ts`.

- [ ] **Step 1: tests first.**

`capacity.test.ts`:
- `build lane free: no lock and the builder limit not full`
- `build lane busy: lock held` (text names the ticket); `build lane busy: builder limit full` (text is the `refusal` text)
- `refine lane free: no refine lock and the role limit not full`; `refine lane busy` for each reason
- `a stale slot is reported in the stale list, not counted busy`
- `laneState never throws on an unreadable count: it reports lane "unknown"`

`seat.test.ts` (readings are plain objects, no probe):
- `an exhausted seat is dropped`
- `a seat whose weekly window resets within 24 hours sorts first, soonest reset first`
- `then more weekly headroom, then more 5h headroom, then fewest workers, then least recently assigned` (one test per tie-break)
- `a seat that carries the Maestro with 5h used above 40 percent goes last for a heavy worker, not for a light one`
- `a seat that resets in 20 hours with 5h used at 95 percent is NOT first (guard SOONEST_RESET_MAX_FIVE_HOUR_USED = 70); at 50 percent it is first; exactly 70 is not first`
- `unknown readings (null): headroom steps are skipped for that seat and the worker count decides`
- `no seat left returns an empty list and the reason "all seats exhausted"`

- [ ] **Step 2: red. Step 3: code.**

`capacity.ts`:
```ts
export interface LaneState { build: string | null; refine: string | null; stale: string[] }   // null = free, string = why not
export function laneState(count: Count, buildLock: { ticket: string } | null, refineLock: { ticket: string } | null): LaneState;
```
`seat.ts`:
```ts
export interface SeatReading { seat: string; fiveHourUsed: number | null; weeklyUsed: number | null; weeklyResetsAt: number | null /* ms */; exhaustedUntil: number | null; workers: number; lastAssigned: number | null; carriesMaestro: boolean }
export const SOONEST_RESET_MAX_FIVE_HOUR_USED = 70;   // one constant, Jack changes it (runbook: "as long as its 5h window has room")
export function rankSeats(readings: SeatReading[], now: number, opts: { heavy: boolean }): { ranked: string[]; why: string[] };
```
Headroom is `100 - used`. Keep it pure.

- [ ] **Step 4: green; commit:** `feat(autonomous): add Director lane capacity and seat ranking`.

**Checked by:** the two test files. **First use:** `dg director seat --readings <file>` in T5.

---

## Task T4: the unblock table

**Files:** `director/unblock.ts`, `unblock.test.ts`.

Scope (spec 7): the factory ticket (after the tick's retry is used up) and the refine worker the Director started. Everything else is `list-only`. Build moves go to the ticket's **driver**, never to the worker.

- [ ] **Step 1: tests first** (one per row of spec section 7; `now` fake; `history` = `Decision[]` plus the watchdog journal lines read through `readJournal`; use the fakes in `journal-writer.test-util.ts`):
- `lost pane-gone Builder, retryEligible, no retry line in the journal: none (the tick restarts it)`
- `lost Builder, the journal shows the tick's retry and the item is still open 30 minutes later: release lane build, result stopped, with escalate; at 29 minutes: none`
- `lost refine worker first time: start-again; second time (a start-again decision for the same run chain): refine-release failed; third: escalate`
- `lost Reviewer, and any run of a ticket that is not the lock ticket: list-only`
- `stalled silent-working-180-min without a reprompt-run decision for this run: reprompt, to: driver`
- `stalled with a reprompt decision for the same run 31 minutes ago: treated as lost (the rows above); 29 minutes: none`
- `stalled waiting-240-min: reprompt via the driver; 30 minutes later: release stopped`
- `blocked (permission prompt and pane-blocked): list-only; no question on the ticket`
- `failed transient: none if the tick retried, else retry-once via the driver; retry used: release stopped + escalate`
- `failed durable (every durable cause in CAUSES): release stopped + escalate with the cause text`
- `failed or any item with cause class unknown: list-only with the reason "cause class unknown"`
- `refused merge-refused: list-only; gate-wait after 30 minutes`
- `breaker item: list-only`; `item with no ticket: list-only`
- `refine lock older than 360 minutes (a world input): refine-release escalated`
- `a release move on the build lane has lane "build"; on a refine-lane ticket it is a refine-release move with lane "refine"` (both tested)
- `history is keyed on ticket + run + id: a restart decision for run A does not suppress a move for run B of the same ticket`
- `movesFor is idempotent`; `every move has a stable id m-<sha1(kind|ticket|run)[:8]>`
- `property: over every cause in CAUSES and every AttentionKind no build-lane release move has result other than "stopped", and no move has kind "answer-prompt" or "close-breaker"` (refine-lane "failed" is allowed: it never reaches recordRelease, T2 tests that) (the Director's own releases are always stopped, so they never count toward the breaker)

- [ ] **Step 2: red. Step 3: code.**

```ts
export type Move = { id: string } & (
  | { kind: "reprompt"; ticket: string; run: string; to: "driver" | "self" }
  | { kind: "start-again"; ticket: string; run: string }              // refine worker only
  | { kind: "retry-once"; ticket: string; run: string; to: "driver" }
  | { kind: "release"; lane: "build"; ticket: string; result: "stopped"; reason: string; escalate: { id: string; question: string } | null }
  | { kind: "refine-release"; lane: "refine"; ticket: string; result: "failed" | "escalated"; reason: string }
  | { kind: "gate-wait"; ticket: string; ageMin: number }
  | { kind: "list-only"; item: string; why: string });
export interface History { decisions: Decision[]; journal: JournalLine[] }
export function movesFor(item: OpenItem, h: History, ctx: { lockTicket: string | null; refineTicket: string | null; now: Date }): Move;
export function stuckLockMove(lock: RefineLock | null, now: Date): Move | null;
```
Use `classOfCause` for the cause class, `retryItemOf` and `readJournal` from `../journal.ts` for the tick's retry history. There is no `restart` move: the tick owns the Builder restart (`act.ts` `retry` case).

- [ ] **Step 4: green; commit:** `feat(autonomous): add the Director unblock table`.

**Checked by:** `unblock.test.ts`. **First use:** `dg director plan` in T5.

---

## Task T5: plan, do, wake, commands, wiring

**Files:** `director/plan.ts`, `do.ts`, `wake.ts`, `command.ts` + tests; edit `autonomous/scan.ts`, `autonomous/watch.ts`, `packages/cli/src/index.ts`. Part 2: `director/target.ts`, `target.test.ts`, edit `autonomous/index.ts`, `autonomous/scan.ts` (claim hand-off).

### Part 1

- [ ] **a. `plan.ts` (test first).** `plan.test.ts`:
  - `no open items, no stuck lock and no pending comments: no moves`
  - `one move per open item, oldest first, from movesFor; the stuck refine lock adds stuckLockMove`
  - `list-only items are shown but never wake the Director`
  - `the same world gives the same plan, the same hash and the same move ids; plan records nothing`
  ```ts
  export interface PlanWorld { items: OpenItem[]; history: History; lockTicket: string | null; refineLock: RefineLock | null; pendingComments: number; now: Date }
  export interface Plan { moves: Move[]; shown: Move[]; wake: boolean; hash: string }
  export function planLoop(w: PlanWorld): Plan;
  ```
  Hook point for DGS-700 (one sentence, no code): a later express rule adds its moves here.

- [ ] **b. `do.ts` (test first).** `do.test.ts` with fake effectors:
  - `do <move-id> recomputes the plan, finds the move and runs its effect; an unknown id exits 4`
  - `the decision line is written BEFORE the effect; a failing effect writes outcome "failed" and the same move can be run again; a succeeded move is not run twice (history keyed ticket+run+id)`
  - `reprompt with to=driver calls promptDriver, never the worker pane`
  - `release lane build calls the release effector with result stopped; refine-release lane refine calls refineRelease and never the build release` (both)
  - `start-again starts the refine worker through the start effector (dg run start, inside the limit); a refused start is recorded and the move stays`
  - `checkAuthority is applied to the move's authority id before the effect`
  ```ts
  export interface Effects { promptDriver(ticket: string, text: string): Promise<void>; releaseBuild(ticket: string, reason: string): Promise<void>; refineRelease(...): Promise<...>; startRefine(ticket: string): Promise<void>; promptSelf(run: string, text: string): Promise<void> }
  export async function doMove(d: RecordDeps & { effects: Effects }, w: PlanWorld, id: string): Promise<{ code: 0 | 4 | 5; text: string }>;
  ```

- [ ] **c. `wake.ts` (test first).** `wake.test.ts` with a fake `Exec` that returns scripted `pane list` / `pane read --format ansi` output; read `observers-real.ts` (about lines 100 to 140) and `input-box.ts` `classifyInputBox` and reuse them:
  - `sends "Director tick: dg director plan" when the plan wakes, the pane exists, is not working and the input box is empty`
  - `sends nothing when the plan does not wake`
  - `sends nothing when the pane is missing, working, or the input box has typed text or a suggestion` (one test each)
  - `the same hash is not sent again within 10 minutes; a new hash is; the same hash after 10 minutes is` (state in `director/last-tick.json`)
  - `a failing exec never throws out of wake`; event `director-tick` appended when sent
  ```ts
  export interface WakeDeps { dir: string; now: () => Date; exec: Exec; target: () => { agent: string; session: string } | null }
  export async function wakeDirector(d: WakeDeps, p: Plan): Promise<"sent" | "none" | "skipped">;
  ```
  `target()` returns null when no Director is configured: nothing is sent. In Part 1 the real `target` is a stub returning null.

- [ ] **d. Wire the wake and the commands.**
  - `scan.ts`: `ScanDeps.wake?: () => Promise<void>`; called once at the end of the new `runScan` wrapper on every outcome (try/catch, never changes the outcome). `watch.ts`: `WatchDeps.wake?` likewise after the pass. Tests in `scan-refine.test.ts` and a new `watch-wake.test.ts`: `the wake runs once per scan and per pass and its failure changes nothing`; existing tests unchanged.
  - `command.ts` (yargs `CommandModule`, `command: "director"`), tested with injected deps like `autonomous/index.test.ts`:
    - `plan [--json]`: prints the shown moves with their ids, times UTC+7; exit 0.
    - `do <move-id>`: `doMove`.
    - `decide --id <id> --ticket <KEY> [--run <id>] --what <t> --why <t>`: `checkAuthority`; exit 3 or 4 on a refusal; else `recordDecision`.
    - `escalate --ticket --question [--id <id> default product-taste-names-scope] [--via-release]`.
    - `refine-round --ticket <KEY>`: sets round 2.
    - `refine-release --ticket <KEY> --result ready|escalated|failed [--report <file>] [--question <t>] [--cause <t>]`: exit 2 on a refusal.
    - `seat --readings <file.json> [--heavy]`.
    - Tests: `decide refuses a Jack id with exit 3`, `refuses an unknown id with exit 4`, `records a within id`, `escalate twice prints already asked and opens the attention item`, `refine-release ready without --report exits 2`, `plan with no items prints "no moves"`, `do with an unknown id exits 4`, `seat prints the ranking`.
  - `packages/cli/src/index.ts`: add `import directorCommand from "./autonomous/director/command.ts"` and `.command(directorCommand)` next to `.command(autonomousCommand)` (read the file first). 
  - In `autonomous/index.ts` production wiring (Part 1) leave `refine` and `wake` **unset**: the lane and the wake stay off until Part 2.

- [ ] **Commit (Part 1):** `feat(autonomous): add the Director plan, do, wake and dg director commands`.

### Part 2 (build only after DGS-683 tickets 1 and 3 are on main; rebase on them first)

The registry is `packages/cli/src/conductor-registry/registry.ts` on the Castle branch (commit 94fdf4a7; `readRegistryFile`, `findByKind`); `scripts/conductor/registry.ts` is only a shim. Read the real exported signatures before coding.

- [ ] **e. `target.ts` (test first).** `target.test.ts`:
  - `directorTarget finds the registry entry named director with kind factory and returns its session and workspace`
  - `returns null when no such entry (lane and wake stay off)`
  - `promptDirector builds: herdr-ws --session Castle agent prompt director <msg> with HERDR_SCOPE` (fake exec; no live herdr)
  - `promptDriver reads drivers/<KEY>.json and prompts that conductor`; `no driver file: falls back to DigiSmith/digismith-conductor`; `a malformed driver file: falls back and appends an attention item`
  - `writeDriverIfAbsent creates drivers/<KEY>.json with exclusive create and the DGS-683 6.3 fields; a second call is a no-op`
- [ ] **f. Claim to driver, wiring.** In `scan.ts` `claim()`: when `deps.driverPrompt` is set, prompt the driver (`promptDriver(ticket, "Autonomous order: build <KEY>, read <order>")`) instead of `promptConductor`, write the driver record, and `recordDecision` `claim-build`. In `autonomous/index.ts` production deps: `refine = directorTarget(...) ? { prompt: promptDirector, roleFull: () => refusal(currentCount(env, cwd).count, "role") } : undefined`; `wake = () => wakeDirector(...)`; `driverPrompt = directorTarget(...) ? promptDriver : undefined`; the tick `prompt` dep uses `promptDriver(ticket, ...)` when a Director exists. Tests in `index.test.ts` style: `with no Director in the registry nothing changes (claim prompts the factory conductor as before)`; `with a Director the refine lane is on and the wake runs`; `a build claim goes to the driver, never to the Director`; `a tick order goes to the driver`.
- [ ] **Commit (Part 2):** `feat(autonomous): hand claims and tick orders to the driver and wake the Director through the registry`.

**Checked by:** `plan.test.ts`, `do.test.ts`, `wake.test.ts`, `command.test.ts`, `target.test.ts`, the extended scan and watch tests, and all existing tests unchanged. **First use (not for a Builder):** after the Maestro's atomic registry flip, `dg director plan` (read only) and one `dg autonomous scan --dry-run`.

---

## Task T6: the card, the briefs, the docs and the protection

**Files:** `skills/director/SKILL.md`, `skills/director/brief.md`, `skills/director/refine-brief.md`, `docs/director.md`, `autonomous/director/card.test.ts`; edit `autonomous/protected-paths.ts`, `autonomous/protected-paths.test.ts`, `autonomous/WATCHDOG.md`, `.digismith/config.yml`; new `autonomous/director/config-protected.test.ts`.

- [ ] **Step 1: tests first.**
  - `card.test.ts`: `every authority id in authority.ts appears in skills/director/SKILL.md, and every id in the card's authority tables is in authority.ts` (parse backticked ids in table rows under `## Authority`); `the card has the sections Purpose, Lives, Owns, Does not own, Talks to, Reads, Authority, Rules`; `the card has frontmatter name director and a description starting "Use when"`; `the card says "Jack changes this list"`; `the card says to run moves with dg director do and never to start a Reviewer itself (the project conductor starts the plan Reviewer)`; `skills/director/refine-brief.md says: never edit the ticket description, never write the "Authority change approved by Jack" line, name an authority path only when the plan changes it, and refer to the protected list as "the protected paths (section 13, DEFAULT_PROTECTED)"` (a test on the brief file); `the card says the Director never edits a ticket description (it cannot write the Authority change approved by Jack line)`; `the card names the Castle session and the LaunchDaemon com.jazurite.herdr-castle`; `the card does not mention the express lane except the line "express lane: DGS-700, later"` (assert the single line).
  - `protected-paths.test.ts`: `skills/director/ and skills/director/SKILL.md are protected by DEFAULT_PROTECTED`.
  - `config-protected.test.ts`: reads `.digismith/config.yml` from the repo root with `readGuardrails` and asserts `protectedPaths` contains `skills/director/` and still contains every other entry of `DEFAULT_PROTECTED` (including `hooks/hooks.json`, `.digismith/mandate.yml`, `.digismith/profiles/`) (the config list overrides the default, so both must carry it); `readGuardrails(...).problems` is empty.
- [ ] **Step 1b: merge-gate backstop tests first** (`autonomous/merge-gate.test.ts`, new cases; existing cases unchanged; fake `Git` as in the file):
  - `a branch diff touching an authority path with no approval record is refused with code authority-path and the text "authority path: needs Jack's written yes"`
  - `with an approval record listing that path the gate falls through to the existing protected-path refusal (still not "go")`
  - `an approval record that lists other paths does not cover it`
  - `a diff touching no authority path behaves exactly as before`
  - `fullPathCovered: approval "director/refine.ts" covers the full diff path packages/cli/src/autonomous/director/refine.ts (/-boundary suffix); it does not cover the sibling director/authority.ts; a folder approval "packages/cli/src/autonomous/director/" covers both; the suffix "limit.ts" does not cover packages/cli/src/run/rate-limit.ts (not at a / boundary)`
  - `isAuthorityFile matches whole tokens at / boundaries or exact basenames: profiles/emma.yml is NOT a hit, .digismith/profiles/x.yml IS, rate-limit.ts is NOT a hit for limit.ts, packages/cli/src/run/limit-check.ts IS`
  - `the approval record path is under the autonomous state dir (AUTONOMOUS_DIR temp dir in the test) and never under the repo root`
  - `an approval record for director/authority.ts does not cover a diff file director/refine.ts`; `a diff that edits authority-backstop.ts, merge-gate.ts or breaker.ts is an authority hit`
  Code: `director/authority-backstop.ts` (inside the `director/` folder, so it is an authority path itself; `authorityHits(files)` uses `isAuthorityFile`, `readApproval(dir, ticket)`, coverage by `isCovered` on the full diff path), one call in `runMergeGate` after the protected-path check is computed (before it returns), new `Code` value `"authority-path"`. Spec 4.4 states the limit (a hand merge past the gate).
- [ ] **Step 2: red. Step 3: write.**
  - `skills/director/SKILL.md`: the card text of spec section 11, with the Authority section filled from spec 4.1 and 4.2 (one id per row, same words as `authority.ts`), the loop (spec 5), the refine flow (spec 6, steps 1 to 6), the unblock table (spec 7), escalation (spec 8), the decision record (spec 9), and the line `express lane: DGS-700, later`.
  - `skills/director/brief.md`: the start brief for the Director session: read the card, run `dg director plan`, voice rules (conversation voice, short, action first), no questions in chat, the file locations of the state, times UTC+7, no AI attribution.
  - `skills/director/refine-brief.md`: the template for a refine worker (rules to include: never edit the ticket description; never write the "Authority change approved by Jack" line; name an authority path only when the plan changes it; call the protected list "the protected paths (section 13, DEFAULT_PROTECTED)"): the shape of this ticket's own brief (docs only, no worktree, no branch, files in the board folder, nothing scoped with the ticket key committed, `STOP: plan-ready <path>`, wait for the Reviewer, then `done`), with `<KEY>`, `<board folder>` and `<seat>` placeholders.
  - `docs/director.md`: short: what the Director is, the lanes, the files in `~/.digismith-depot/autonomous/` it keeps (`refine-lock.json`, `director/decisions.jsonl`, `escalations.jsonl`, `comment-pending.jsonl`, `last-tick.json`), the commands, and "express lane: DGS-700, later".
  - `autonomous/WATCHDOG.md`: add a short "Director" section (the refine lane and the wake) at the end.
  - `protected-paths.ts`: add `"skills/director/"` to `DEFAULT_PROTECTED`. `.digismith/config.yml`: add `    - skills/director/` to the `protected_paths` list (after `skills/reviewer/`), nothing else in the file.
- [ ] **Step 4: green; commit** (three commits): `docs(director): add the Director card, briefs and docs` (skills, docs, WATCHDOG.md, card test) and `feat(autonomous): protect the Director card path` (`protected-paths.ts`, its test, `.digismith/config.yml`, `config-protected.test.ts`) and `feat(autonomous): refuse an authority-path merge without Jack's approval record` (`merge-gate.ts`, `merge-gate.test.ts`, `authority-backstop.ts`).

**Checked by:** the three tests. **Note for the merge:** this task changes `.digismith/config.yml` (protected). Say so in the merge note.

---

## Final steps for the Builder

1. Run the whole folder once: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 packages/cli/src/autonomous packages/cli/src/run`. All green, existing tests unchanged.
2. Run `node --experimental-strip-types packages/cli/src/index.ts director plan --help` style smoke only against a temp `AUTONOMOUS_DIR` (never the real depot).
3. Report `STOP: ticket-review-ready <pack>`; the conductor starts the whole-branch Reviewer. The merge touches protected paths (`packages/cli/src/autonomous/`, `.digismith/config.yml`): the Maestro answers the merge until the Warden exists.

## First use (after the merge, by the Maestro, not a Builder)

1. `dg director plan` on the real depot (read only): expect the open items as moves, or "no moves".
2. `dg autonomous scan --dry-run`: refinement verdicts appear once Part 2 is merged and the registry has a `director` entry.
3. The live flip, **one atomic write**: back up `conductors.json` (`.before-dgs-699`), write a new file next to it that adds the `director` entry (Castle `Factory` workspace, `kind: factory`) **and** changes `digismith-conductor` from `factory` to `project` in the same file, then `mv` it over the old one. Never two factory entries at once (the Castle `conductor.ts` throws on two and the scan stops with `conductor-config`). Start the session with `skills/director/brief.md` first, so the entry points at a live pane. Watch two scans.
