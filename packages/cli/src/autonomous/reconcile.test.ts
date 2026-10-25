import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcile } from "./reconcile.ts";
import { plan, settle, resultsOf, readJournal } from "./journal.ts";
import type { Observations, Obs, TicketState } from "./phase-types.ts";

const T = new Date("2026-10-21T03:00:00.000Z");
const tmp = () => mkdtempSync(join(tmpdir(), "nw-rec-"));
const ok = <T2>(value: T2): Obs<T2> => ({ ok: true, value });
const state = (phase: TicketState["phase"] = "merge-ready"): TicketState => ({ ticket: "DGS-1", claimedAt: "2026-10-21T00:00:00.000Z", phase, phaseStartedAt: "2026-10-21T00:00:00.000Z", attempt: 1, runs: { builder: "builder-1" } });
const O = (o: Partial<Observations> = {}): Observations => ({
  runs: ok([{ id: "builder-1", role: "builder", createdAt: "x", started: true, ended: false, merged: false, pushed: false, phaseEvent: "merge" as const }]),
  packs: ok([]), verdicts: ok([]), git: ok({ head: "aaaaaaa1", base: "bbbbbbb1", onOriginMain: false }),
  tracker: ok({ status: "in progress" }), attention: ok([]),
  herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty" as const, builderPane: "present" }), ...o });
const open = (d: string, action: string, phase = "merge-ready", detail?: Record<string, string>) =>
  plan(d, T, { ticket: "DGS-1", phase, attempt: 1, action, detail });

describe("reconcile", () => {
  it("a merge order git shows as done becomes succeeded", () => {
    const d = tmp(); const k = open(d, "order-merge");
    const notes = reconcile({ dir: d, now: T, state: state(), obs: O({ git: ok({ head: "aaaaaaa1", base: "b", onOriginMain: true }) }) });
    expect(resultsOf(d)[k]).toBe("succeeded"); expect(notes).toEqual([]);
  });
  it("a merge order git does not show becomes uncertain, with a note, and is not retried", () => {
    const d = tmp(); const k = open(d, "order-merge");
    const notes = reconcile({ dir: d, now: T, state: state(), obs: O() });
    expect(resultsOf(d)[k]).toBe("uncertain");
    expect(notes).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-order-merge" }]);
    const again = reconcile({ dir: d, now: T, state: state(), obs: O() });
    expect(again).toHaveLength(1); expect(resultsOf(d)[k]).toBe("uncertain");
  });
  it("an uncertain merge order is settled succeeded once git shows it", () => {
    const d = tmp(); const k = open(d, "order-merge"); settle(d, T, k, "uncertain");
    reconcile({ dir: d, now: T, state: state(), obs: O({ git: ok({ head: "a", base: "b", onOriginMain: true }) }) });
    expect(resultsOf(d)[k]).toBe("succeeded");
  });
  it("a failed git observation leaves the line open", () => {
    const d = tmp(); const k = open(d, "order-merge");
    reconcile({ dir: d, now: T, state: state(), obs: O({ git: { ok: false, error: "x" } }) });
    expect(resultsOf(d)[k]).toBe("open");
  });
  it("move-to-X: done only when the lock is exactly at X, else retryable (F6, changed from the rank rule)", () => {
    const d = tmp(); const k = open(d, "move-to-review", "building");
    reconcile({ dir: d, now: T, state: state("review"), obs: O() });
    expect(resultsOf(d)[k]).toBe("succeeded");
    const d2 = tmp(); const k2 = open(d2, "move-to-review", "building");
    reconcile({ dir: d2, now: T, state: state("building"), obs: O() });
    expect(resultsOf(d2)[k2]).toBe("retryable");
    const d3 = tmp(); const k3 = open(d3, "move-to-review", "building");
    reconcile({ dir: d3, now: T, state: state("merge-ready"), obs: O() });
    expect(resultsOf(d3)[k3]).toBe("retryable");
  });
  it("F6: a backward move (review to building) is not done while the lock is still at review", () => {
    const d = tmp(); const k = open(d, "move-to-building", "review");
    reconcile({ dir: d, now: T, state: state("review"), obs: O() });
    expect(resultsOf(d)[k]).toBe("retryable");
    const d2 = tmp(); const k2 = open(d2, "move-to-building", "review");
    reconcile({ dir: d2, now: T, state: { ...state("building"), attempt: 2 }, obs: O() });
    expect(resultsOf(d2)[k2]).toBe("succeeded");
  });
  it("F5: lines of another ticket are not settled against this ticket's observations", () => {
    const d = tmp();
    const other = plan(d, T, { ticket: "DGS-2", phase: "merge-ready", attempt: 1, action: "order-merge" });
    settle(d, T, other, "uncertain");
    const mine = open(d, "order-merge");
    reconcile({ dir: d, now: T, state: state(), obs: O({ git: ok({ head: "a", base: "b", onOriginMain: true }) }) });
    expect(resultsOf(d)[other]).toBe("uncertain");
    expect(resultsOf(d)[mine]).toBe("succeeded");
  });
  it("F5: with no lock only claim lines are checked", () => {
    const d = tmp();
    const m = open(d, "order-merge"); const c = open(d, "claim", "claimed");
    reconcile({ dir: d, now: T, state: null, obs: O() });
    expect(resultsOf(d)[m]).toBe("open");
    expect(resultsOf(d)[c]).toBe("permanent");
  });
  it("F8: a claim is succeeded only when the lock names this ticket and the tracker reads in progress", () => {
    const d = tmp(); const k = open(d, "claim", "claimed");
    reconcile({ dir: d, now: T, state: state("claimed"), obs: O({ tracker: ok({ status: "to do" }) }) });
    expect(resultsOf(d)[k]).toBe("uncertain");
    reconcile({ dir: d, now: T, state: state("claimed"), obs: O({ tracker: { ok: false, error: "x" } }) });
    expect(resultsOf(d)[k]).toBe("uncertain"); // tracker not observed: unknown is not progress
    const notes = reconcile({ dir: d, now: T, state: state("claimed"), obs: O({ tracker: { ok: false, error: "x" } }) });
    expect(notes).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-claim" }]);
    const d2 = tmp(); const k2 = open(d2, "claim", "claimed");
    reconcile({ dir: d2, now: T, state: state("claimed"), obs: O() });
    expect(resultsOf(d2)[k2]).toBe("succeeded");
    const d3 = tmp(); const k3 = open(d3, "claim", "claimed");
    reconcile({ dir: d3, now: T, state: state("claimed"), obs: O({ tracker: ok({ status: "claimed" }) }) });
    expect(resultsOf(d3)[k3]).toBe("succeeded");
  });
  it("status-write: reads the status back", () => {
    const d = tmp(); const k = open(d, "status-write");
    reconcile({ dir: d, now: T, state: state(), obs: O({ tracker: ok({ status: "to do" }) }) });
    expect(resultsOf(d)[k]).toBe("retryable");
  });
  it("status-write: succeeded on claimed or in progress", () => {
    for (const status of ["claimed", "in progress"]) {
      const d = tmp(); const k = open(d, "status-write");
      reconcile({ dir: d, now: T, state: state(), obs: O({ tracker: ok({ status }) }) });
      expect(resultsOf(d)[k]).toBe("succeeded");
    }
  });
  it("phase-marker: succeeded when the run shows the phase, else retryable", () => {
    const d = tmp(); const k = open(d, "phase-marker", "merge-ready", { phase: "merge" });
    reconcile({ dir: d, now: T, state: state(), obs: O() });
    expect(resultsOf(d)[k]).toBe("succeeded");
    const d2 = tmp(); const k2 = open(d2, "phase-marker", "merge-ready", { phase: "review" });
    reconcile({ dir: d2, now: T, state: state(), obs: O() });
    expect(resultsOf(d2)[k2]).toBe("retryable");
  });
  it("order-restart: the pane is back", () => {
    const d2 = tmp(); const k2 = open(d2, "order-restart", "building");
    reconcile({ dir: d2, now: T, state: state("building"), obs: O() });
    expect(resultsOf(d2)[k2]).toBe("succeeded");
  });
  it("claim: a lock means succeeded; no lock means permanent", () => {
    const d = tmp(); const k = open(d, "claim", "claimed");
    reconcile({ dir: d, now: T, state: null, obs: O() });
    expect(resultsOf(d)[k]).toBe("permanent");
  });
  it("an unknown action is uncertain", () => {
    const d = tmp(); const k = open(d, "mystery");
    reconcile({ dir: d, now: T, state: state(), obs: O() });
    expect(resultsOf(d)[k]).toBe("uncertain");
  });

  // Extra cases beyond the brief.
  it("claim with a lock present is succeeded (open key)", () => {
    const d = tmp(); const k = open(d, "claim", "claimed");
    reconcile({ dir: d, now: T, state: state("claimed"), obs: O() });
    expect(resultsOf(d)[k]).toBe("succeeded");
  });
  it("an uncertain key that stays uncertain: a note each call, no new journal line", () => {
    const d = tmp(); const k = open(d, "order-merge"); settle(d, T, k, "uncertain");
    const before = readJournal(d).length;
    const first = reconcile({ dir: d, now: T, state: state(), obs: O() });
    const afterFirst = readJournal(d).length;
    const second = reconcile({ dir: d, now: T, state: state(), obs: O() });
    expect(first).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-order-merge" }]);
    expect(second).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-order-merge" }]);
    expect(afterFirst).toBe(before);
    expect(readJournal(d).length).toBe(before);
    expect(resultsOf(d)[k]).toBe("uncertain");
  });
  it("an uncertain key whose check now says retryable stays uncertain, with a note", () => {
    const d = tmp(); const k = open(d, "move-to-review", "building"); settle(d, T, k, "uncertain");
    const before = readJournal(d).length;
    const notes = reconcile({ dir: d, now: T, state: state("building"), obs: O() });
    expect(notes).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-move-to-review" }]);
    expect(readJournal(d).length).toBe(before);
    expect(resultsOf(d)[k]).toBe("uncertain");
  });
  it("a re-planned key is settled once per open period: its retryable line plus one succeeded line", () => {
    const d = tmp(); const k = open(d, "status-write");
    settle(d, T, k, "retryable", "first try");
    open(d, "status-write");
    reconcile({ dir: d, now: T, state: state(), obs: O({ tracker: ok({ status: "in progress" }) }) });
    reconcile({ dir: d, now: T, state: state(), obs: O({ tracker: ok({ status: "in progress" }) }) });
    const settled = readJournal(d).filter((l) => l.key === k && l.status === "settled");
    expect(settled).toHaveLength(2);
    expect(settled.at(-1)?.result).toBe("succeeded");
    expect(resultsOf(d)[k]).toBe("succeeded");
  });
  it("move-to with an unknown phase is uncertain, never succeeded", () => {
    const d = tmp(); const k = open(d, "move-to-bogus", "building");
    const notes = reconcile({ dir: d, now: T, state: state("merge-ready"), obs: O() });
    expect(resultsOf(d)[k]).toBe("uncertain");
    expect(notes).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-move-to-bogus" }]);
  });
  it("F12: an order-fix line is an unknown action: uncertain, never succeeded", () => {
    const d = tmp(); const k = open(d, "order-fix", "building", { head: "old" });
    reconcile({ dir: d, now: T, state: state("building"), obs: O() });
    expect(resultsOf(d)[k]).toBe("uncertain");
  });
  it("phase-marker with no detail.phase is uncertain, never succeeded", () => {
    const d = tmp(); const k = open(d, "phase-marker", "merge-ready");
    const notes = reconcile({ dir: d, now: T, state: state(), obs: O() });
    expect(resultsOf(d)[k]).toBe("uncertain");
    expect(notes).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-phase-marker" }]);
  });
  it("phase-marker with no detail.phase and no run phaseEvent is uncertain, never succeeded", () => {
    const d = tmp(); const k = open(d, "phase-marker", "merge-ready");
    const obs = O({ runs: ok([{ id: "builder-1", role: "builder", createdAt: "x", started: true, ended: false, merged: false, pushed: false, phaseEvent: null }]) });
    reconcile({ dir: d, now: T, state: state(), obs });
    expect(resultsOf(d)[k]).toBe("uncertain");
  });
  it("an uncertain claim with no lock is settled permanent once, then no note on the next call", () => {
    const d = tmp(); const k = open(d, "claim", "claimed"); settle(d, T, k, "uncertain");
    const first = reconcile({ dir: d, now: T, state: null, obs: O() });
    expect(first).toEqual([]);
    expect(resultsOf(d)[k]).toBe("permanent");
    const before = readJournal(d).length;
    const second = reconcile({ dir: d, now: T, state: null, obs: O() });
    expect(second).toEqual([]);
    expect(readJournal(d).length).toBe(before);
  });
  it("a tracker-failed observation leaves a status-write line open, with no note", () => {
    const d = tmp(); const k = open(d, "status-write");
    const notes = reconcile({ dir: d, now: T, state: state(), obs: O({ tracker: { ok: false, error: "down" } }) });
    expect(resultsOf(d)[k]).toBe("open");
    expect(notes).toEqual([]);
  });
});

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
    expect(readJournal(d).filter((l) => l.key === k && l.status === "planned")).toHaveLength(1);
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
    const k2 = open(d, "adopt-retry", "review", { run: "builder-1" });
    reconcile({ dir: d, now: T, state: { ...state("building"), runs: { builder: "builder-1" } }, obs: O() });
    expect(resultsOf(d)[k2]).toBe("succeeded");
  });
});
