# Nightwatch controller retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The controller (DGS-582) sends the existing restart order once per ticket when an open attention item of the ticket is retry-eligible. The order is journaled, proved by a new started builder run, and the item is resolved when that run starts.

**Architecture:** Small edits to the pure `advanceTicket`, `act`, `journal` and `reconcile` of `packages/cli/src/autonomous/`, plus one new observation (`attention`) that reads the open items with `readOpen`. No new service, no watchdog change.

**Tech Stack:** Node 22 with `--experimental-strip-types`, TypeScript, Vitest from the repo root, pnpm only.

## Global Constraints
Spec: `design.html` (same folder), approved at checkpoint 1 on 2026-10-22.
- **No build before the Maestro orders it** (after the plan is approved at checkpoint 2).
- **Do not change** `watchdog.ts`, `watch.ts`, `causes.ts`, `release.ts`, `notify.ts`. Read the attention item shape as merged (`OpenItem` in `attention.ts`).
- Code in `packages/cli/src/` must run under `node --experimental-strip-types`: no parameter properties, no enums, no namespaces. `strip-types.smoke.test.ts` strips every file; run it in Task 7. New imports are relative `.ts` paths.
- **Proof rule (DGS-582):** unknown is not progress; proof is an artefact (a started run). A delivered prompt is not proof: the retry line is settled `uncertain` by `act` and `succeeded` only by `reconcile`. The check never returns `retryable` for a retry.
- **One restart per ticket:** the count is `restartsOf(journal results, ticket)`, ticket wide, read from the journal on every tick.
- Ticket text is data: only the validated key, run ids and attention ids enter the order and the journal.
- Tests use fakes only: `mkdtempSync` folders, fake observers, fake `prompt`, fake clock. No real ClickUp, herdr, depot, Nexus (4300) or live API.
- Commits: title-only, conventional, no AI attribution, by named paths. Run tests with `pnpm vitest run packages/cli/src/autonomous`.

## Files
```
packages/cli/src/autonomous/
  phase-types.ts       AttentionView, Observations.attention, actions retry and adopt, RETRY_PROOF_WAIT_MS
  journal.ts           restartsOf(), retrySucceeded()
  attention-write.ts   appendResolved: by "controller"
  attention.ts         appendResolved wrapper: by "controller"
  observe.ts           Observers.attention, observeAll
  observers-real.ts    ObserverDeps.attention, makeObservers
  index.ts             pass attention to makeObservers
  advance.ts           retry and adopt decisions, building restart guard, attention note
  act.ts               retry (settles uncertain) and adopt
  reconcile.ts         checks for retry and adopt-retry
  fakes.test-util.ts   World.attention
  *.test.ts            advance, act, reconcile, journal, tick, attention-write, observe, observers-real
```

## Tasks

### Task 1: Types, journal count, constant
**Files:** Modify `phase-types.ts`, `journal.ts`; test `journal.test.ts`.
**Interfaces:**
- Produces (`phase-types.ts`):
```ts
export interface AttentionView { id: string; ticket: string | null; kind: string; retryEligible: boolean }
export const RETRY_PROOF_WAIT_MS = 15 * 60 * 1000;
// Observations gains:  attention: Obs<AttentionView[]>;
// Action gains:
//   | { kind: "retry"; item: string; run: string }
//   | { kind: "adopt"; run: string; items: string[] }
```
- Produces (`journal.ts`):
```ts
export function restartsOf(results: JournalResults, ticket: string): number;
export function retrySucceeded(results: JournalResults, ticket: string): boolean;
```

- [ ] **Step 1: Failing test** (append to `journal.test.ts`; match its imports):
```ts
import { restartsOf, retrySucceeded } from "./journal.ts";

describe("restartsOf", () => {
  const J = (o: Record<string, string>) => o as never;
  it("counts retry and order-restart keys of the ticket in any phase", () => {
    expect(restartsOf(J({ "DGS-1:building:1:retry": "uncertain", "DGS-1:review:1:order-restart": "succeeded" }), "DGS-1")).toBe(2);
  });
  it("ignores a retryable key (the prompt was never delivered)", () => {
    expect(restartsOf(J({ "DGS-1:building:1:retry": "retryable" }), "DGS-1")).toBe(0);
  });
  it("ignores other tickets and other actions", () => {
    expect(restartsOf(J({ "DGS-2:building:1:retry": "open", "DGS-1:building:1:order-merge": "open", "DGS-1:building:1:adopt-retry": "open" }), "DGS-1")).toBe(0);
  });
  it("counts open, uncertain, succeeded and permanent", () => {
    for (const st of ["open", "uncertain", "succeeded", "permanent"]) expect(restartsOf(J({ "DGS-1:building:1:retry": st }), "DGS-1")).toBe(1);
  });
});
describe("retrySucceeded", () => {
  it("is true only for a succeeded retry key of the ticket", () => {
    expect(retrySucceeded({ "DGS-1:building:1:retry": "succeeded" } as never, "DGS-1")).toBe(true);
    expect(retrySucceeded({ "DGS-1:building:1:retry": "uncertain" } as never, "DGS-1")).toBe(false);
    expect(retrySucceeded({ "DGS-2:building:1:retry": "succeeded" } as never, "DGS-1")).toBe(false);
  });
});
```
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/journal.test.ts`. Expected: FAIL (`restartsOf` is not exported).
- [ ] **Step 3:** Add the types and constant to `phase-types.ts` as in Interfaces (extend `Observations` and the `Action` union). Add to `journal.ts`:
```ts
const actionOfKey = (k: string) => k.split(":").slice(3).join(":");

// Restart orders already used by this ticket, in any phase. A retryable key was never delivered, so it does not count.
export function restartsOf(results: JournalResults, ticket: string): number {
  return Object.entries(results).filter(([k, st]) => {
    const a = actionOfKey(k);
    return k.split(":")[0] === ticket && (a === "retry" || a === "order-restart") && st !== "retryable";
  }).length;
}

export function retrySucceeded(results: JournalResults, ticket: string): boolean {
  return Object.entries(results).some(([k, st]) => k.split(":")[0] === ticket && actionOfKey(k) === "retry" && st === "succeeded");
}
```
- [ ] **Step 4:** Run the same test. Expected: PASS.
- [ ] **Step 5:** Commit `feat(dgs-588): add the restart count to the journal` (paths: `phase-types.ts`, `journal.ts`, `journal.test.ts`).

### Task 2: The `controller` resolver
**Files:** Modify `attention-write.ts`, `attention.ts`; test `attention-write.test.ts`.
**Interfaces:** `appendResolved(dir, id, by: "watchdog" | "jack" | "controller", ts, note?)` in both files.

- [ ] **Step 1: Failing test** (append to `attention-write.test.ts`; match its helpers):
```ts
it("a controller resolve closes the item and records by", () => {
  const d = tmp();
  appendAttention(d, new Date("2026-10-21T00:00:00.000Z"), { ticket: "DGS-1", run: "builder-1", kind: "lost", cause: "pane-gone" });
  expect(appendResolved(d, "builder-1.lost.0", "controller", "2026-10-21T00:05:00.000Z", "new run builder-2 started")).toBe(true);
  const last = JSON.parse(readFileSync(join(d, "attention.jsonl"), "utf8").trim().split("\n").pop()!);
  expect(last).toMatchObject({ resolved: true, by: "controller" });
  expect(appendResolved(d, "builder-1.lost.0", "controller", "2026-10-21T00:06:00.000Z")).toBe(false);
});
```
- [ ] **Step 2:** Run the test. Expected: it passes at runtime (types are not checked by vitest). Read both signatures to confirm the failure is only the type.
- [ ] **Step 3:** In both files change `by: "watchdog" | "jack"` to `by: "watchdog" | "jack" | "controller"`.
- [ ] **Step 4:** Run `pnpm vitest run packages/cli/src/autonomous/attention-write.test.ts packages/cli/src/autonomous/attention.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(dgs-588): let the controller resolve attention items` (the four paths).

### Task 3: The attention observation
**Files:** Modify `observe.ts`, `observers-real.ts`, `index.ts`, `fakes.test-util.ts`; tests `observe.test.ts`, `observers-real.test.ts`.
**Interfaces:**
- `Observers.attention(): Promise<AttentionView[]>`; `observeAll` returns `attention: Obs<AttentionView[]>`.
- `ObserverDeps.attention: () => Promise<AttentionView[]>`; `makeObservers` returns `attention: () => d.attention()`.
- `World.attention: AttentionView[]` (default `[]`); `fail` accepts the key `attention`.

- [ ] **Step 1: Failing tests.** In `observe.test.ts` add: `observeAll` with an observer whose `attention` throws gives `attention: { ok: false }` and the other six observations stay `ok: true` (copy the shape of the existing isolation test, and assert `attention` value `[]` when it passes). In `observers-real.test.ts` add: `makeObservers(deps(exec, [run()], { attention: async () => [item] })).attention()` resolves to `[item]` (use the file's `deps()` helper; extend it with `attention: async () => []`).
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** `observe.ts`: add `attention(): Promise<AttentionView[]>` to `Observers`, one more `safe(() => o.attention(), ms)` in `observeAll`, and `attention` in the returned object. `observers-real.ts`: add the `attention` field to `ObserverDeps` and `attention: () => d.attention()` to `makeObservers`. `index.ts` (in the object passed to `makeObservers`, near line 96) add:
```ts
attention: async () => readOpen(d.dir)
  .filter((i) => i.ticket === state?.ticket)
  .map((i) => ({ id: i.id, ticket: i.ticket, kind: i.kind, retryEligible: i.retryEligible === true })),
```
(`readOpen` is already imported in `index.ts`.) `fakes.test-util.ts`: add `attention: AttentionView[]` to `World`, `attention: []` to `makeWorld`, `attention: get("attention", () => w.attention)` to `fakeObservers`.
- [ ] **Step 4:** Run `pnpm vitest run packages/cli/src/autonomous/observe.test.ts packages/cli/src/autonomous/observers-real.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(dgs-588): observe the open attention items of the ticket` (paths: the five source files and two tests). Other test files that build `Observations` by hand are fixed in Tasks 4 and 6.

### Task 4: Advance decides the retry and the adopt
**Files:** Modify `advance.ts`; test `advance.test.ts`.
**Interfaces:** Consumes `restartsOf`, `retrySucceeded`, `Observations.attention`, actions `retry` and `adopt`. `advanceTicket` signature unchanged.

Rules (in this order, after the status rule and before the phase function; only for phases `claimed`, `building`, `review`, `merge-ready`):
1. Eligible items = `obs.attention` values with `ticket === s.ticket`, `retryEligible`, kind `lost` or `failed`. A failed attention observation: no retry and no adopt here.
2. **Adopt:** `retrySucceeded(j, ticket)`, the key `<KEY>:<phase>:<attempt>:adopt-retry` unused, and a builder run `n` with `started`, `id !== s.runs.builder` and `createdAt` later than the lock's builder run (the one with `id === s.runs.builder`; when that run is missing, any started builder run with another id) gives `{ kind: "adopt", run: n.id, items: <ids of the eligible items> }`. Take the newest such run by `createdAt`.
3. **Retry:** at least one eligible item, `restartsOf(j, ticket) === 0`, and `gate(obs) === null` gives `{ kind: "retry", item: items[0].id, run: s.runs.builder ?? "-" }`. When the gate is not null, fall through to the phase function (the retry waits for a free conductor).
4. **Building guard:** in `building()` the pane-gone restart waits (`wait` `restart-used`) when `restartsOf(j, ticket) > 0` and the `order-restart` key of this phase and attempt is unused or retryable. The existing handling of a used `order-restart` key (`order-restart-sent`, notes) is unchanged.
5. **Attention read failure:** at the end of `advanceTicket`, `wait` with `!obs.attention.ok` and a phase other than `merged` and `released` gives the note `obs-attention-failed` (same place and style as the `obs-tracker-failed` rule).

- [ ] **Step 1: Failing tests.** In `advance.test.ts` add `attention: ok([])` to the `O()` helper, and a helper `const item = (o = {}) => ({ id: "builder-1.lost.0", ticket: "DGS-1", kind: "lost", retryEligible: true, ...o })`. Add:
```ts
describe("retry", () => {
  const s = S({ phase: "building" });
  const base = (extra: Partial<Observations> = {}) => O({ ...withEvent("building"), attention: ok([item()]), ...extra });
  it("a lost run with 0 restarts gives one retry", () => {
    expect(advanceTicket(s, base(), J)).toEqual({ kind: "retry", item: "builder-1.lost.0", run: "builder-1" });
  });
  it("a transient failed item gives a retry too", () => {
    expect(advanceTicket(s, base({ attention: ok([item({ id: "DGS-1.failed.0", kind: "failed" })]) }), J)).toMatchObject({ kind: "retry", item: "DGS-1.failed.0" });
  });
  it("retryEligible false, kind blocked or stalled, or another ticket give no retry", () => {
    for (const i of [item({ retryEligible: false }), item({ kind: "blocked" }), item({ kind: "stalled" }), item({ ticket: "DGS-2" })])
      expect(advanceTicket(s, base({ attention: ok([i]) }), J).kind).not.toBe("retry");
  });
  it("a used retry key in any phase gives no second retry", () => {
    for (const st of ["open", "uncertain", "succeeded", "permanent"])
      expect(advanceTicket(s, base(), { "DGS-1:review:1:retry": st }).kind).not.toBe("retry");
  });
  it("a retryable key may be sent again", () => {
    expect(advanceTicket(s, base(), { "DGS-1:building:1:retry": "retryable" }).kind).toBe("retry");
  });
  it("a second failure after the retry gives no order and no note from advance", () => {
    const j: JournalResults = { "DGS-1:building:1:retry": "succeeded", "DGS-1:building:1:adopt-retry": "succeeded" };
    expect(advanceTicket(s, base({ attention: ok([item({ id: "builder-2.lost.0" })]) }), j).kind).not.toBe("retry");
  });
  it("a restart order already sent blocks the retry", () => {
    expect(advanceTicket(s, base(), { "DGS-1:building:1:order-restart": "succeeded" }).kind).not.toBe("retry");
  });
  it("the pane-gone restart waits once a retry is used", () => {
    const o = O({ ...withEvent("building"), herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty", builderPane: "gone" }) });
    expect(advanceTicket(s, o, { "DGS-1:building:1:retry": "uncertain" })).toEqual({ kind: "wait", reason: "restart-used" });
  });
  it("a busy conductor, a typed input box or no conductor fall through to the phase rules", () => {
    const o = base({ herdr: ok({ conductorPresent: true, conductorWorking: true, input: "empty", builderPane: "present" }) });
    expect(advanceTicket(s, o, J)).toEqual({ kind: "wait", reason: "building" });
  });
  it("merged and released tickets never retry", () => {
    for (const phase of ["merged", "released"] as const) expect(advanceTicket(S({ phase }), base(), J).kind).toBe("wait");
  });
  it("a failed attention read gives one note when the phase would only wait", () => {
    expect(advanceTicket(s, O({ ...withEvent("building"), attention: bad() }), J)).toEqual({ kind: "attention", cause: "obs-attention-failed", attKind: "unknown" });
  });
});
describe("adopt", () => {
  const s = S({ phase: "building" });
  const j: JournalResults = { "DGS-1:building:1:retry": "succeeded" };
  const old = run({ phaseEvent: "building" });
  const fresh = run({ id: "builder-2", createdAt: "2026-10-21T02:00:00.000Z", phaseEvent: null });
  it("a started newer builder run after a succeeded retry gives adopt with the item ids", () => {
    expect(advanceTicket(s, O({ runs: ok([old, fresh]), attention: ok([item()]) }), j)).toEqual({ kind: "adopt", run: "builder-2", items: ["builder-1.lost.0"] });
  });
  it("no adopt before the retry is succeeded, for an unstarted run, or twice", () => {
    expect(advanceTicket(s, O({ runs: ok([old, fresh]), attention: ok([item()]) }), { "DGS-1:building:1:retry": "uncertain" }).kind).not.toBe("adopt");
    expect(advanceTicket(s, O({ runs: ok([old, { ...fresh, started: false }]) }), j).kind).not.toBe("adopt");
    expect(advanceTicket(s, O({ runs: ok([old, fresh]) }), { ...j, "DGS-1:building:1:adopt-retry": "succeeded" }).kind).not.toBe("adopt");
  });
});
```
Also add `attention: ok([])` wherever a test builds `Observations` without `O()` (search the file for `herdr: ok(`).
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/advance.test.ts`. Expected: the new tests FAIL, the old ones PASS.
- [ ] **Step 3:** Implement in `advance.ts`: import `restartsOf`, `retrySucceeded` from `./journal.ts`; add
```ts
const RETRY_KINDS = ["lost", "failed"];
const eligible = (s: TicketState, obs: Observations) =>
  obs.attention.ok ? obs.attention.value.filter((i) => i.ticket === s.ticket && i.retryEligible && RETRY_KINDS.includes(i.kind)) : [];

// null = no retry business this tick
function retryStep(s: TicketState, obs: Observations, j: JournalResults): Action | null {
  if (s.phase === "merged" || s.phase === "released" || !obs.attention.ok) return null;
  const items = eligible(s, obs);
  if (retrySucceeded(j, s.ticket) && !used(j, keyOf(s, "adopt-retry")) && obs.runs.ok) {
    const cur = obs.runs.value.find((x) => x.id === s.runs.builder);
    const later = obs.runs.value
      .filter((x) => x.role === "builder" && x.started && x.id !== s.runs.builder && (cur === undefined || Date.parse(x.createdAt) > Date.parse(cur.createdAt)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    if (later !== undefined) return { kind: "adopt", run: later.id, items: items.map((i) => i.id) };
  }
  if (items.length === 0 || restartsOf(j, s.ticket) > 0 || gate(obs) !== null) return null;
  return { kind: "retry", item: items[0].id, run: s.runs.builder ?? "-" };
}
```
In `advanceTicket`, after the status rule: `const r = retryStep(s, obs, j); if (r !== null) return r;`. In `building()` change the pane-gone line to:
```ts
if (obs.herdr.value.builderPane === "gone" && r !== undefined && !r.ended) {
  const own = j[keyOf(s, "order-restart")];
  if ((own === undefined || own === "retryable") && restartsOf(j, s.ticket) > 0) return wait("restart-used");
  return order("restart", s, obs, j, g.head);
}
```
At the end of `advanceTicket` add `if (a.kind === "wait" && !obs.attention.ok && s.phase !== "merged" && s.phase !== "released") return note("obs-attention-failed");` before the tracker rule's return order stays as it is (put it after the tracker rule).
- [ ] **Step 4:** Run the advance tests. Expected: PASS (new and old).
- [ ] **Step 5:** Commit `feat(dgs-588): decide the one retry and the run adopt in advance` (paths: `advance.ts`, `advance.test.ts`).

### Task 5: Act sends the retry and adopts the new run
**Files:** Modify `act.ts`; test `act.test.ts`.
**Interfaces:** `act()` handles `{ kind: "retry" }` and `{ kind: "adopt" }`. `run()` gains an optional `okResult` (default `succeeded`).

- [ ] **Step 1: Failing tests** (append to `act.test.ts`; `tmp()` makes a lock, `state()` and `deps()` exist):
```ts
describe("act retry", () => {
  const S2 = (o: Partial<TicketState> = {}) => state({ phase: "building", ...o });
  it("sends the restart text once and settles uncertain, with no attention note", async () => {
    const d = tmp(); const dd = deps(d);
    const r = await act(dd, S2(), { kind: "retry", item: "builder-1.lost.0", run: "builder-1" });
    expect(dd.sent).toEqual(["DGS-1: restart the builder, its pane is gone"]);
    expect(r.result).toBe("uncertain");
    expect(resultsOf(d)["DGS-1:building:1:retry"]).toBe("uncertain");
    expect(readJournal(d).find((l) => l.status === "planned")?.detail).toEqual({ item: "builder-1.lost.0", run: "builder-1" });
    expect(existsSync(join(d, "attention.jsonl"))).toBe(false);
  });
  it("a prompt that was not delivered settles retryable", async () => {
    const d = tmp();
    const dd = deps(d, { prompt: async () => { throw new PromptError("no pane", "no"); } });
    expect((await act(dd, S2(), { kind: "retry", item: "i", run: "builder-1" })).result).toBe("retryable");
  });
  it("an unknown delivery settles uncertain and a second act call is refused by the journal", async () => {
    const d = tmp();
    const dd = deps(d, { prompt: async () => { throw new PromptError("timeout", "maybe"); } });
    expect((await act(dd, S2(), { kind: "retry", item: "i", run: "builder-1" })).result).toBe("uncertain");
    await expect(act(deps(d), S2(), { kind: "retry", item: "i", run: "builder-1" })).rejects.toThrow(/already used/);
  });
  it("a bad ticket key sends nothing and writes no journal line", async () => {
    const d = tmp(); const dd = deps(d);
    await act(dd, S2({ ticket: "bad key" }), { kind: "retry", item: "i", run: "r" });
    expect(dd.sent).toEqual([]); expect(readJournal(d)).toEqual([]);
  });
});
describe("act adopt", () => {
  it("writes the new builder into the lock and resolves the items; a repeat writes nothing more", async () => {
    const d = tmp(); writeLock(d, { phase: "building", runs: { builder: "builder-1" } });
    appendAttention(d, T, { ticket: "DGS-1", run: "builder-1", kind: "lost", cause: "pane-gone", retryEligible: true });
    const a = { kind: "adopt" as const, run: "builder-2", items: ["builder-1.lost.0"] };
    await act(deps(d), state({ phase: "building" }), a);
    const r = readPhaseState(d); expect(r.kind === "ok" && r.state.runs.builder).toBe("builder-2");
    expect(readOpen(d)).toEqual([]);
    expect(resultsOf(d)["DGS-1:building:1:adopt-retry"]).toBe("succeeded");
    expect(appendResolved(d, "builder-1.lost.0", "controller", T.toISOString())).toBe(false);
  });
});
```
Add imports `existsSync` (node:fs), `appendAttention` from `./attention-write.ts`, `appendResolved` and `readOpen` from `./attention.ts`.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/act.test.ts`. Expected: FAIL.
- [ ] **Step 3:** In `act.ts` import `appendResolved` from `./attention-write.ts`. Give `run` a fifth parameter `okResult: SettleResult = "succeeded"`; on success settle `okResult` with the note `done` (succeeded) or `order delivered, waiting for a new run` (other); return `noteIfBad(action, r)` unless `outcome.ok && okResult !== "succeeded"` (then return `{ result: r }`: a normal wait for the proof is not an attention item). Refactor the order case so the text build and the refusal note are shared:
```ts
const textFor = (order: "merge" | "restart"): string | null => {
  try {
    return orderText(order, state.ticket, state.attempt);
  } catch (e) {
    const unknown = e instanceof Error && e.message.startsWith("unknown order");
    appendAttention(d.dir, d.now(), { ticket: state.ticket, run: state.runs.builder, kind: "failed", cause: unknown ? "order-refused-unknown-order" : "order-refused-bad-ticket-key" });
    return null;
  }
};
const delivery = (e: unknown): SettleResult => (e instanceof PromptError && e.delivered === "no" ? "retryable" : "uncertain");
```
`case "order"`: `const text = textFor(a.order); if (text === null) return { result: null }; return run(\`order-${a.order}\`, { head: a.head }, () => d.prompt(text), delivery);`. New cases:
```ts
case "retry": {
  const text = textFor("restart");
  if (text === null) return { result: null };
  return run("retry", { item: a.item, run: a.run }, () => d.prompt(text), delivery, "uncertain");
}
case "adopt":
  return run("adopt-retry", { run: a.run }, async () => {
    writePhaseState(d.dir, { runs: { builder: a.run } });
    for (const id of a.items) appendResolved(d.dir, id, "controller", d.now().toISOString(), `new run ${a.run} started`);
  }, retry);
```
- [ ] **Step 4:** Run the act tests. Expected: PASS (new and old; the old `order` tests prove the refactor).
- [ ] **Step 5:** Commit `feat(dgs-588): send the retry order and adopt the new run in act` (paths: `act.ts`, `act.test.ts`).

### Task 6: Reconcile proves the retry
**Files:** Modify `reconcile.ts`; test `reconcile.test.ts`.
**Interfaces:** `check(action, line, state, obs, now)`; new branches `retry` and `adopt-retry`.

- [ ] **Step 1: Failing tests.** In `reconcile.test.ts` add `attention: ok([])` to `O()`. Add (the `open` helper plans at `T` = 03:00:00Z; `later(min)` is a `Date` helper):
```ts
describe("reconcile retry", () => {
  const plannedAt = T;
  const mk = (id: string, createdAt: string, o = {}) => ({ id, role: "builder", createdAt, started: true, ended: false, merged: false, pushed: false, phaseEvent: null, ...o });
  const old = mk("builder-1", "2026-10-21T00:01:00.000Z");
  const at = (min: number) => new Date(plannedAt.getTime() + min * 60_000);
  const setup = () => { const d = tmp(); const k = open(d, "retry", "building", { item: "builder-1.lost.0", run: "builder-1" }); settle(d, plannedAt, k, "uncertain", "delivered"); return { d, k }; };
  it("a new started builder run after the line gives succeeded", () => {
    const { d, k } = setup();
    reconcile({ dir: d, now: at(2), state: state("building"), obs: O({ runs: ok([old, mk("builder-2", at(1).toISOString())]) }) });
    expect(resultsOf(d)[k]).toBe("succeeded");
  });
  it("the old run, or a run created before the line, is no proof", () => {
    const { d, k } = setup();
    reconcile({ dir: d, now: at(2), state: state("building"), obs: O({ runs: ok([old, mk("builder-0", at(-5).toISOString())]) }) });
    expect(resultsOf(d)[k]).toBe("uncertain");
  });
  it("an unstarted new run is no proof", () => {
    const { d, k } = setup();
    reconcile({ dir: d, now: at(2), state: state("building"), obs: O({ runs: ok([old, mk("builder-2", at(1).toISOString(), { started: false })]) }) });
    expect(resultsOf(d)[k]).toBe("uncertain");
  });
  it("a failed runs read leaves the line as it is, with no note", () => {
    const { d, k } = setup();
    const notes = reconcile({ dir: d, now: at(30), state: state("building"), obs: O({ runs: { ok: false, error: "x" } }) });
    expect(resultsOf(d)[k]).toBe("uncertain"); expect(notes).toEqual([]);
  });
  it("no new run: no note at 14:59, one note at 15:00; never retryable", () => {
    const { d, k } = setup();
    expect(reconcile({ dir: d, now: new Date(plannedAt.getTime() + 14 * 60_000 + 59_000), state: state("building"), obs: O({ runs: ok([old]) }) })).toEqual([]);
    expect(reconcile({ dir: d, now: at(15), state: state("building"), obs: O({ runs: ok([old]) }) })).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-retry" }]);
    expect(resultsOf(d)[k]).toBe("uncertain");
  });
  it("an open line (crash before settle) younger than 15 minutes stays open and is not planned again", () => {
    const d = tmp(); const k = open(d, "retry", "building", { item: "i", run: "builder-1" });
    reconcile({ dir: d, now: at(5), state: state("building"), obs: O({ runs: ok([old]) }) });
    expect(resultsOf(d)[k]).toBe("open");
  });
  it("an open line settles succeeded when the new run is there", () => {
    const d = tmp(); const k = open(d, "retry", "building", { item: "i", run: "builder-1" });
    reconcile({ dir: d, now: at(5), state: state("building"), obs: O({ runs: ok([old, mk("builder-2", at(1).toISOString())]) }) });
    expect(resultsOf(d)[k]).toBe("succeeded");
  });
});
describe("reconcile adopt-retry", () => {
  it("lock builder equals the new run gives succeeded; otherwise retryable", () => {
    const d = tmp(); const k = open(d, "adopt-retry", "building", { run: "builder-2" });
    reconcile({ dir: d, now: T, state: { ...state("building"), runs: { builder: "builder-1" } }, obs: O() });
    expect(resultsOf(d)[k]).toBe("retryable");
    const k2 = open(d, "adopt-retry", "building", { run: "builder-1" });
    reconcile({ dir: d, now: T, state: { ...state("building"), runs: { builder: "builder-1" } }, obs: O() });
    expect(resultsOf(d)[k2]).toBe("succeeded");
  });
});
```
(`open()` plans with attempt 1 and the same key per action, so in the last test use two different `phase` strings if the key collides; adjust to `"review"` for the second call.)
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/reconcile.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3:** In `reconcile.ts` import `RETRY_PROOF_WAIT_MS` from `./phase-types.ts`; add `now: Date` as the fifth parameter of `check` and pass `d.now`. Add before the final `return r("uncertain", "no check for this action")`:
```ts
if (action === "retry") {
  // proof is an artefact: a new started builder run of the ticket that began after the planned line
  if (!obs.runs.ok) return "unknown";
  const t = Date.parse(line.ts);
  const fresh = obs.runs.value.some((x) => x.role === "builder" && x.started && x.id !== line.detail?.run && Date.parse(x.createdAt) > t);
  if (fresh) return r("succeeded", "new run started");
  // the worker needs time to start: no note until the wait is over; never retryable, the order may have been delivered
  if (now.getTime() - t < RETRY_PROOF_WAIT_MS) return "unknown";
  return r("uncertain", "no new run after the retry order");
}
if (action === "adopt-retry") {
  if (state === null) return r("permanent", "no lock");
  return state.runs.builder === line.detail?.run ? r("succeeded", "lock names the new run") : r("retryable", "lock not updated");
}
```
- [ ] **Step 4:** Run the reconcile tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(dgs-588): prove the retry with a new started run in reconcile` (paths: `reconcile.ts`, `reconcile.test.ts`).

### Task 7: Tick tests with fakes, whole suite, smoke test
**Files:** test `tick.test.ts` (no source change expected; a failing test here means a bug in Tasks 4 to 6, fix it there).

- [ ] **Step 1: Write the tests** (append to `tick.test.ts`; `deps`, `tmp`, `makeWorld`, `writeLock`, `plan` exist). Setup helper `lostWorld(d, w)`: `writeLock(d, { phase: "building", runs: { builder: "builder-1" } })`; `w.runs[0].phaseEvent = "building"`; `w.herdr.builderPane = "gone"`; `w.attention = [{ id: "builder-1.lost.0", ticket: "DGS-1", kind: "lost", retryEligible: true }]`; write the same item to `attention.jsonl` with `appendAttention` so adopt can resolve it. Tests:
  - **transient gives one restart order:** one tick sends exactly one prompt `DGS-1: restart the builder, its pane is gone`; `resultsOf(d)["DGS-1:building:1:retry"]` is `uncertain`; a second tick (same world, 1 minute later) sends no new prompt.
  - **the pane-gone restart does not add a second order:** with `builderPane: "gone"` (the lostWorld default) the first tick sends the retry, not an `order-restart`; no `order-restart` key exists after three ticks.
  - **a second failure gives attention only:** after the retry succeeds (push `builder-2` into `w.runs` with `started`, `createdAt` after the planned line; tick: reconcile settles `succeeded`; tick: adopt), set `w.attention` to a new lost item for `builder-2`; further ticks send no prompt, and `restartsOf` stays 1; the new item stays open in `attention.jsonl`.
  - **a controller restart between plan and settle sends no second order:** plan the key by hand (`plan(d, T, { ticket: "DGS-1", phase: "building", attempt: 1, action: "retry", detail: { item: "builder-1.lost.0", run: "builder-1" } })`), so the journal holds a `planned` line only; three ticks (a fresh `deps` each time) send zero prompts and the key is not planned a second time (`readJournal(d).filter(l => l.status === "planned")` has length 1). Then push a started `builder-2` created after the line: the next tick settles the key `succeeded`.
  - **a durable or unknown cause never retries:** `w.attention` items with `retryEligible: false` (kinds `failed` and `refused`, and one with `kind: "lost"` and `retryEligible: false`): no prompt, no `retry` journal line.
  - **end to end:** lost run, one order, new run appears, the adopt tick sets `runs.builder` to `builder-2` in `lock.json`, and `readOpen(d)` no longer holds the lost item (`by: "controller"` in the last line of `attention.jsonl`); a later tick sends nothing.
  - **an unreadable attention read does not retry:** `w.fail.attention = "boom"`: no prompt; the tick returns the note `obs-attention-failed`.
- [ ] **Step 2:** Run `pnpm vitest run packages/cli/src/autonomous/tick.test.ts`. Expected: PASS. If a test fails, fix the unit of Tasks 4 to 6 that owns the rule and re-run its own test file first.
- [ ] **Step 3:** Run `pnpm vitest run packages/cli/src/autonomous` and then `pnpm vitest run packages/cli/src/strip-types.smoke.test.ts`. Expected: PASS (the smoke test strips every changed file: it covers the "no enum, namespace or parameter property" rule of the spec).
- [ ] **Step 4:** Run `pnpm build` in `packages/cli` (the script `pnpm --filter ./packages/cli build`; read `packages/cli/package.json` for the exact name) and confirm `dist/index.js` is produced with no error. Nexus jobs run that file. Do not start or touch the running API.
- [ ] **Step 5:** Commit `test(dgs-588): cover the retry through the tick with fakes` (path: `tick.test.ts`).

### Task 8: Runbook line (text only)
**Files:** Create `.digismith/board/DGS-588—controller-retry/runbook-text.md`.

- [ ] **Step 1:** Write the text the Maestro applies to the conductor runbook, in short plain sentences: the conductor may get one order `<KEY>: restart the builder, its pane is gone` from the controller for a lost run; it restarts the builder as `dg run start` does today (the new run id must have a `started` event, or the controller raises `journal-uncertain-retry` after 15 minutes); there is never a second automatic order for the ticket; a second failure stays an attention item for Jack. Add the first-use steps of the spec (section 7).
- [ ] **Step 2:** Commit `docs(dgs-588): add the runbook text for the retry` (path: `runbook-text.md`).
