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
  tracker: ok({ status: "in progress" }),
  herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty" as const, builderPanePresent: true }), ...o });
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
  it("move-to-X: done when the lock is at X or later, else retryable", () => {
    const d = tmp(); const k = open(d, "move-to-review", "building");
    reconcile({ dir: d, now: T, state: state("merge-ready"), obs: O() });
    expect(resultsOf(d)[k]).toBe("succeeded");
    const d2 = tmp(); const k2 = open(d2, "move-to-review", "building");
    reconcile({ dir: d2, now: T, state: state("building"), obs: O() });
    expect(resultsOf(d2)[k2]).toBe("retryable");
  });
  it("status-write: reads the status back", () => {
    const d = tmp(); const k = open(d, "status-write");
    reconcile({ dir: d, now: T, state: state(), obs: O({ tracker: ok({ status: "to do" }) }) });
    expect(resultsOf(d)[k]).toBe("retryable");
  });
  it("phase-marker: succeeded when the run shows the phase, else retryable", () => {
    const d = tmp(); const k = open(d, "phase-marker", "merge-ready", { phase: "merge" });
    reconcile({ dir: d, now: T, state: state(), obs: O() });
    expect(resultsOf(d)[k]).toBe("succeeded");
    const d2 = tmp(); const k2 = open(d2, "phase-marker", "merge-ready", { phase: "review" });
    reconcile({ dir: d2, now: T, state: state(), obs: O() });
    expect(resultsOf(d2)[k2]).toBe("retryable");
  });
  it("order-fix: the head moved means succeeded; order-restart: the pane is back", () => {
    const d = tmp(); const k = open(d, "order-fix", "building", { head: "old" });
    reconcile({ dir: d, now: T, state: state("building"), obs: O() });
    expect(resultsOf(d)[k]).toBe("succeeded");
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
  it("order-fix with no detail.head is uncertain, never succeeded", () => {
    const d = tmp(); const k = open(d, "order-fix", "building");
    const notes = reconcile({ dir: d, now: T, state: state("building"), obs: O() });
    expect(resultsOf(d)[k]).toBe("uncertain");
    expect(notes).toEqual([{ ticket: "DGS-1", cause: "journal-uncertain-order-fix" }]);
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
