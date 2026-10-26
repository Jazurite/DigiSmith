import { describe, it, expect } from "vitest";
import { advanceTicket } from "./advance.ts";
import type { Observations, Obs, RunView, TicketState, JournalResults } from "./phase-types.ts";

const ok = <T>(value: T): Obs<T> => ({ ok: true, value });
const bad = (error = "boom"): Obs<never> => ({ ok: false, error });
const S = (o: Partial<TicketState> = {}): TicketState => ({
  ticket: "DGS-1", claimedAt: "2026-10-21T00:00:00.000Z", phase: "claimed", phaseStartedAt: "2026-10-21T00:00:00.000Z",
  attempt: 1, runs: { builder: "builder-1" }, ...o });
const run = (o: Partial<RunView> = {}): RunView => ({
  id: "builder-1", role: "builder", createdAt: "2026-10-21T00:01:00.000Z", started: true, ended: false,
  merged: false, pushed: false, phaseEvent: null, ...o });
const O = (o: Partial<Observations> = {}): Observations => ({
  runs: ok([run()]), packs: ok([]), verdicts: ok([]),
  git: ok({ head: "aaaaaaa1", base: "bbbbbbb1", onOriginMain: false }),
  tracker: ok({ status: "in progress" }),
  herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty", builderPane: "present" }),
  attention: ok([]),
  ...o });
const J: JournalResults = {};
const item = (o = {}) => ({ id: "builder-1.lost.0", ticket: "DGS-1", kind: "lost", retryEligible: true, ...o }) as never;
const withEvent = (phaseEvent: RunView["phaseEvent"]) => ({ runs: ok([run({ phaseEvent })]) });

describe("claimed", () => {
  it("waits while no builder run has started", () => {
    expect(advanceTicket(S({ runs: { builder: null } }), O({ runs: ok([]) }), J)).toEqual({ kind: "wait", reason: "no-builder-run" });
  });
  it("moves to building on a started builder run", () => {
    expect(advanceTicket(S({ runs: { builder: null } }), O(), J)).toEqual({ kind: "move", to: "building", proof: "run builder-1 started", builder: "builder-1" });
  });
  it("a failed runs observation gives a note, not a move", () => {
    expect(advanceTicket(S({ runs: { builder: null } }), O({ runs: bad() }), J)).toEqual({ kind: "attention", cause: "obs-runs-failed", attKind: "unknown" });
  });
});

describe("building", () => {
  const s = S({ phase: "building" });
  it("writes the phase marker first", () => {
    expect(advanceTicket(s, O(), J)).toEqual({ kind: "marker", phase: "building", run: "builder-1" });
  });
  it("does not repeat a marker the journal already holds", () => {
    expect(advanceTicket(s, O(), { "DGS-1:building:1:phase-marker": "open" })).toEqual({ kind: "wait", reason: "building" });
  });
  it("waits when there is no pack for the head", () => {
    expect(advanceTicket(s, O(withEvent("building")), J)).toEqual({ kind: "wait", reason: "building" });
  });
  it("moves to review on a ticket pack for the current head", () => {
    const o = O({ ...withEvent("building"), packs: ok([{ round: 1, head: "aaaaaaa1", base: "bbbbbbb1" }]) });
    expect(advanceTicket(s, o, J)).toEqual({ kind: "move", to: "review", proof: "pack for aaaaaaa" });
  });
  it("ignores a pack for another head", () => {
    const o = O({ ...withEvent("building"), packs: ok([{ round: 1, head: "ccccccc1", base: "bbbbbbb1" }]) });
    expect(advanceTicket(s, o, J).kind).toBe("wait");
  });
  it("no commit since the base is no proof, even with a pack", () => {
    const o = O({ ...withEvent("building"), git: ok({ head: "bbbbbbb1", base: "bbbbbbb1", onOriginMain: false }), packs: ok([{ round: 1, head: "bbbbbbb1", base: "bbbbbbb1" }]) });
    expect(advanceTicket(s, o, J).kind).toBe("wait");
  });
  it("orders a restart when the builder pane is gone and the run has not ended", () => {
    const o = O({ ...withEvent("building"), herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty", builderPane: "gone" }) });
    expect(advanceTicket(s, o, J)).toEqual({ kind: "order", order: "restart", head: "aaaaaaa1" });
  });
  it("a failed packs or git observation gives a note", () => {
    expect(advanceTicket(s, O({ ...withEvent("building"), packs: bad() }), J)).toEqual({ kind: "attention", cause: "obs-packs-failed", attKind: "unknown" });
    expect(advanceTicket(s, O({ ...withEvent("building"), git: bad() }), J)).toEqual({ kind: "attention", cause: "obs-git-failed", attKind: "unknown" });
  });
});

describe("review", () => {
  const s = S({ phase: "review" });
  const v = (result: "clean" | "findings", head = "aaaaaaa1") => ok([{ scope: "ticket" as const, result, head }]);
  it("a clean verdict for the current head moves to merge-ready", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("clean") }), J)).toEqual({ kind: "move", to: "merge-ready", proof: "clean verdict for aaaaaaa", head: "aaaaaaa1" });
  });
  it("a verdict for an old head is void", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("clean", "ccccccc1") }), J)).toEqual({ kind: "wait", reason: "review-running" });
  });
  it("a task-scope verdict is not ticket proof", () => {
    const o = O({ ...withEvent("review"), verdicts: ok([{ scope: "task" as const, result: "clean" as const, head: "aaaaaaa1" }]) });
    expect(advanceTicket(s, o, J).kind).toBe("wait");
  });
  const packR = (round: number, head = "aaaaaaa1") => ok([{ round, head, base: "bbbbbbb1" }]);
  it("F9: open findings keep the phase at review: wait, no move, no order", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("findings"), packs: packR(1) }), J)).toEqual({ kind: "wait", reason: "review-findings-open" });
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("findings"), packs: packR(2) }), J)).toEqual({ kind: "wait", reason: "review-findings-open" });
  });
  it("F9: round 3 with open findings still waits", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("findings"), packs: packR(3) }), J)).toEqual({ kind: "wait", reason: "review-findings-open" });
  });
  it("F9: round 4 with open findings is review-rounds-exhausted, no move", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("findings"), packs: packR(4) }), J)).toEqual({ kind: "attention", cause: "review-rounds-exhausted", attKind: "failed" });
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("findings"), packs: ok([]) }), J)).toEqual({ kind: "wait", reason: "review-findings-open" });
  });
  it("F9: a clean round 4 still moves to merge-ready", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("clean"), packs: packR(4) }), J)).toMatchObject({ kind: "move", to: "merge-ready" });
  });
  it("F9: a failed packs view gives a note when findings are open", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("findings"), packs: bad() }), J)).toEqual({ kind: "attention", cause: "obs-packs-failed", attKind: "unknown" });
  });
  it("a failed verdicts observation gives a note and never a move", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: bad("refuses r2 lines") }), J)).toEqual({ kind: "attention", cause: "obs-verdicts-failed", attKind: "unknown" });
  });
});

describe("merge-ready", () => {
  const s = S({ phase: "merge-ready" });
  const m = withEvent("merge");
  it("git showing the head on origin/main moves to merged", () => {
    const o = O({ ...m, git: ok({ head: "aaaaaaa1", base: "bbbbbbb1", onOriginMain: true }) });
    expect(advanceTicket(s, o, J)).toEqual({ kind: "move", to: "merged", proof: "aaaaaaa on origin/main" });
  });
  it("a merged event without git proof is a disagreement, not a move", () => {
    const o = O({ runs: ok([run({ phaseEvent: "merge", merged: true })]) });
    expect(advanceTicket(s, o, J)).toEqual({ kind: "attention", cause: "proof-disagree", attKind: "unknown" });
  });
  it("a failed git observation gives a note", () => {
    expect(advanceTicket(s, O({ ...m, git: bad() }), J)).toEqual({ kind: "attention", cause: "obs-git-failed", attKind: "unknown" });
  });
  it("orders the merge once", () => {
    expect(advanceTicket(s, O(m), J)).toEqual({ kind: "order", order: "merge", head: "aaaaaaa1" });
    for (const state of ["open", "succeeded"] as const)
      expect(advanceTicket(s, O(m), { "DGS-1:merge-ready:1:order-merge": state })).toEqual({ kind: "wait", reason: "order-merge-sent" });
    expect(advanceTicket(s, O(m), { "DGS-1:merge-ready:1:order-merge": "uncertain" })).toEqual({ kind: "attention", cause: "order-merge-uncertain", attKind: "unknown" });
    expect(advanceTicket(s, O(m), { "DGS-1:merge-ready:1:order-merge": "permanent" })).toEqual({ kind: "attention", cause: "order-merge-permanent", attKind: "failed" });
    expect(advanceTicket(s, O(m), { "DGS-1:merge-ready:1:order-merge": "retryable" }).kind).toBe("order");
  });
});

describe("the conductor gate", () => {
  const s = S({ phase: "merge-ready" });
  const h = (o: Partial<{ conductorPresent: boolean; conductorWorking: boolean; input: "empty" | "suggestion" | "typed" | "unknown" }>) =>
    O({ ...withEvent("merge"), herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty" as const, builderPane: "present", ...o }) });
  it("a grey suggestion allows the order", () => expect(advanceTicket(s, h({ input: "suggestion" }), J).kind).toBe("order"));
  it("typed text waits without a note", () => expect(advanceTicket(s, h({ input: "typed" }), J)).toEqual({ kind: "wait", reason: "conductor-input-typed" }));
  it("a working conductor waits without a note", () => expect(advanceTicket(s, h({ conductorWorking: true }), J)).toEqual({ kind: "wait", reason: "conductor-working" }));
  it("an unparsed input box gives a note", () => expect(advanceTicket(s, h({ input: "unknown" }), J)).toEqual({ kind: "attention", cause: "obs-input-unknown", attKind: "unknown" }));
  it("no conductor gives a note", () => expect(advanceTicket(s, h({ conductorPresent: false }), J)).toEqual({ kind: "attention", cause: "conductor-missing", attKind: "unknown" }));
  it("a failed herdr observation gives a note", () => expect(advanceTicket(s, O({ ...withEvent("merge"), herdr: bad() }), J)).toEqual({ kind: "attention", cause: "obs-herdr-failed", attKind: "unknown" }));
});

describe("merged, status and tracker", () => {
  it("merged waits for the release", () => {
    expect(advanceTicket(S({ phase: "merged" }), O(), J)).toEqual({ kind: "wait", reason: "merged-awaiting-release" });
  });
  it("merged and released are never put back to in progress", () => {
    const o = O({ tracker: ok({ status: "to do" }) });
    expect(advanceTicket(S({ phase: "merged" }), o, J)).toEqual({ kind: "wait", reason: "merged-awaiting-release" });
    expect(advanceTicket(S({ phase: "released" }), o, J)).toEqual({ kind: "wait", reason: "released" });
  });
  it("a locked ticket the tracker shows as to do is set back: claimed in phase claimed, in progress later, once", () => {
    const o = O({ ...withEvent("building"), tracker: ok({ status: "to do" }) });
    expect(advanceTicket(S({ phase: "claimed" }), o, J)).toEqual({ kind: "status", status: "claimed" });
    expect(advanceTicket(S({ phase: "building" }), o, J)).toEqual({ kind: "status", status: "in progress" });
    expect(advanceTicket(S({ phase: "building" }), o, { "DGS-1:building:1:status-write": "succeeded" }).kind).not.toBe("status");
  });
  it("a locked ticket already claimed or in progress is not written again", () => {
    for (const status of ["claimed", "in progress"]) {
      const o = O({ ...withEvent("building"), tracker: ok({ status }) });
      expect(advanceTicket(S({ phase: "building" }), o, J).kind).not.toBe("status");
    }
  });
  it("a failed tracker observation is noted only when nothing else is to do", () => {
    expect(advanceTicket(S({ phase: "building" }), O({ ...withEvent("building"), tracker: bad() }), J)).toEqual({ kind: "attention", cause: "obs-tracker-failed", attKind: "unknown" });
    expect(advanceTicket(S({ phase: "building" }), O({ tracker: bad() }), J).kind).toBe("marker");
  });
});

describe("review fixes: markers, notes, verdict order, restart once", () => {
  const pane = (present: boolean) => ({ conductorPresent: true, conductorWorking: false, input: "empty" as const, builderPane: present ? ("present" as const) : ("gone" as const) });
  const nohead = ok({ head: null, base: "bbbbbbb1", onOriginMain: false });
  const fixPack = { packs: ok([{ round: 1, head: "aaaaaaa1", base: "bbbbbbb1" }]) };

  it("the latest ticket verdict for the head wins", () => {
    const s = S({ phase: "review" });
    const row = (result: "clean" | "findings") => ({ scope: "ticket" as const, result, head: "aaaaaaa1" });
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: ok([row("findings"), row("clean")]) }), J))
      .toEqual({ kind: "move", to: "merge-ready", proof: "clean verdict for aaaaaaa", head: "aaaaaaa1" });
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: ok([row("clean"), row("findings")]) }), J))
      .toEqual({ kind: "wait", reason: "review-findings-open" });
  });

  it("writes the review marker and the merge marker", () => {
    expect(advanceTicket(S({ phase: "review" }), O(), J)).toEqual({ kind: "marker", phase: "review", run: "builder-1" });
    expect(advanceTicket(S({ phase: "merge-ready" }), O(), J)).toEqual({ kind: "marker", phase: "merge", run: "builder-1" });
  });

  it("a builder run missing from the runs view gives a note", () => {
    expect(advanceTicket(S({ phase: "building" }), O({ runs: ok([]) }), J)).toEqual({ kind: "attention", cause: "builder-run-missing", attKind: "unknown" });
  });

  it("a restart is ordered once per attempt", () => {
    const o = O({ ...withEvent("building"), herdr: ok(pane(false)) });
    expect(advanceTicket(S({ phase: "building" }), o, J)).toEqual({ kind: "order", order: "restart", head: "aaaaaaa1" });
    expect(advanceTicket(S({ phase: "building" }), o, { "DGS-1:building:1:order-restart": "succeeded" })).toEqual({ kind: "wait", reason: "order-restart-sent" });
  });

  it("a pack still moves to review when herdr failed", () => {
    const o = O({ ...withEvent("building"), herdr: bad(), ...fixPack });
    expect(advanceTicket(S({ phase: "building" }), o, J)).toEqual({ kind: "move", to: "review", proof: "pack for aaaaaaa" });
  });

  it("a failed herdr view in building gives a note before any restart", () => {
    expect(advanceTicket(S({ phase: "building" }), O({ ...withEvent("building"), herdr: bad() }), J)).toEqual({ kind: "attention", cause: "obs-herdr-failed", attKind: "unknown" });
  });

  it("a failed runs view with no builder id gives a note", () => {
    expect(advanceTicket(S({ phase: "building", runs: { builder: null } }), O({ runs: bad() }), J)).toEqual({ kind: "attention", cause: "obs-runs-failed", attKind: "unknown" });
  });

  it("no order is sent without a head", () => {
    expect(advanceTicket(S({ phase: "merge-ready" }), O({ ...withEvent("merge"), git: nohead }), J)).toEqual({ kind: "attention", cause: "no-head", attKind: "unknown" });
    expect(advanceTicket(S({ phase: "merge-ready" }), O({ ...withEvent("merge"), git: ok({ head: "", base: "bbbbbbb1", onOriginMain: false }) }), J)).toEqual({ kind: "attention", cause: "no-head", attKind: "unknown" });
    expect(advanceTicket(S({ phase: "building" }), O({ ...withEvent("building"), git: nohead, herdr: ok(pane(false)) }), J)).toEqual({ kind: "attention", cause: "no-head", attKind: "unknown" });
  });

  describe("the gate on the restart order", () => {
    const gateObs = (over: { conductorPresent?: boolean; conductorWorking?: boolean; input?: "empty" | "typed" | "unknown"; builderPane?: "present" | "gone" | "unknown" }, extra: Partial<Observations> = {}) =>
      O({ ...withEvent("building"), herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty" as const, builderPane: "present", ...over }), ...extra });
    const restartS = S({ phase: "building" });


    it("restart: a working conductor waits", () => expect(advanceTicket(restartS, gateObs({ builderPane: "gone", conductorWorking: true }), J)).toEqual({ kind: "wait", reason: "conductor-working" }));
    it("restart: typed text waits", () => expect(advanceTicket(restartS, gateObs({ builderPane: "gone", input: "typed" }), J)).toEqual({ kind: "wait", reason: "conductor-input-typed" }));
    it("restart: an unparsed input box gives a note", () => expect(advanceTicket(restartS, gateObs({ builderPane: "gone", input: "unknown" }), J)).toEqual({ kind: "attention", cause: "obs-input-unknown", attKind: "unknown" }));
    it("restart: no conductor gives a note", () => expect(advanceTicket(restartS, gateObs({ builderPane: "gone", conductorPresent: false }), J)).toEqual({ kind: "attention", cause: "conductor-missing", attKind: "unknown" }));
  });
});

describe("one action per call", () => {
  it("is deterministic: the same input gives the same output", () => {
    const o = O(withEvent("building"));
    expect(advanceTicket(S({ phase: "building" }), o, J)).toEqual(advanceTicket(S({ phase: "building" }), o, J));
  });
});

describe("final fix wave", () => {
  it("F4: a null pane is unknown: no restart order, one note", () => {
    const o = O({ ...withEvent("building"), herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty" as const, builderPane: "unknown" as const }) });
    expect(advanceTicket(S({ phase: "building" }), o, J)).toEqual({ kind: "attention", cause: "builder-pane-unknown", attKind: "unknown" });
  });
  it("F6: a move key that is already used gives a note, not a repeated move", () => {
    const s = S({ phase: "review" });
    const o = O({ ...withEvent("review"), verdicts: ok([{ scope: "ticket" as const, result: "clean" as const, head: "aaaaaaa1" }]) });
    expect(advanceTicket(s, o, { "DGS-1:review:1:move-to-merge-ready": "succeeded" })).toEqual({ kind: "attention", cause: "move-key-used", attKind: "unknown" });
    expect(advanceTicket(s, o, { "DGS-1:review:1:move-to-merge-ready": "retryable" })).toMatchObject({ kind: "move", to: "merge-ready" });
  });
});

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
  it("a reviewer or scout run's lost pane-gone item gives no retry", () => {
    for (const role of ["reviewer", "scout"]) {
      const runs = ok([run(), run({ id: `${role}-1`, role, createdAt: "2026-10-21T00:05:00.000Z" })]);
      expect(advanceTicket(s, base({ runs, attention: ok([item({ id: `${role}-1.lost.0`, run: `${role}-1` })]) }), J).kind).not.toBe("retry");
    }
  });
  it("a failed runs read gives no retry for a lost item", () => {
    expect(advanceTicket(s, base({ runs: bad(), attention: ok([item({ run: "reviewer-1" })]) }), J).kind).not.toBe("retry");
  });
  it("a used retry key in any phase gives no second retry", () => {
    for (const st of ["open", "uncertain", "succeeded", "permanent"])
      expect(advanceTicket(s, base(), { "DGS-1:review:1:retry": st } as JournalResults).kind).not.toBe("retry");
  });
  it("a retryable key may be sent again", () => {
    expect(advanceTicket(s, base(), { "DGS-1:building:1:retry": "retryable" }).kind).toBe("retry");
  });
  it("a second failure after the retry gives no order and no note from advance", () => {
    const j: JournalResults = { "DGS-1:building:1:retry": "succeeded", "DGS-1:building:1:adopt-retry": "succeeded" };
    expect(advanceTicket(s, base({ attention: ok([item({ id: "builder-2.lost.0" })]) }), j)).toEqual({ kind: "wait", reason: "building" });
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
    const typed = base({ herdr: ok({ conductorPresent: true, conductorWorking: false, input: "typed", builderPane: "present" }) });
    expect(advanceTicket(s, typed, J)).toEqual({ kind: "wait", reason: "building" });
    const none = base({ herdr: ok({ conductorPresent: false, conductorWorking: false, input: "empty", builderPane: "present" }) });
    expect(advanceTicket(s, none, J)).toEqual({ kind: "wait", reason: "building" });
  });
  it("merged and released tickets never retry", () => {
    for (const phase of ["merged", "released"] as const) expect(advanceTicket(S({ phase }), base(), J).kind).toBe("wait");
  });
  it("a failed attention read gives one note when the phase would only wait", () => {
    expect(advanceTicket(s, O({ ...withEvent("building"), attention: bad() }), J)).toEqual({ kind: "attention", cause: "obs-attention-failed", attKind: "unknown" });
  });
});
describe("retry targets the newest builder run", () => {
  const s = S({ phase: "building" });
  const older = run({ id: "builder-1", createdAt: "2026-10-21T00:01:00.000Z" });
  const newer = run({ id: "builder-2", createdAt: "2026-10-21T02:00:00.000Z" });
  it("an item of the older run gives no retry", () => {
    const o = O({ runs: ok([older, newer]), attention: ok([item({ run: "builder-1" })]) });
    expect(advanceTicket(s, o, J).kind).not.toBe("retry");
  });
  it("an item of the newer run gives a retry naming it", () => {
    const o = O({ runs: ok([older, newer]), attention: ok([item({ id: "builder-2.lost.0", run: "builder-2" })]) });
    expect(advanceTicket(s, o, J)).toEqual({ kind: "retry", item: "builder-2.lost.0", run: "builder-2" });
  });
  it("an item of an unknown run still retries", () => {
    const o = O({ runs: ok([older, newer]), attention: ok([item({ id: "DGS-1.failed.0", kind: "failed", run: "DGS-1" })]) });
    expect(advanceTicket(s, o, J)).toMatchObject({ kind: "retry", item: "DGS-1.failed.0" });
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
  it("adopt lists the open retry items of the older run too", () => {
    const r = advanceTicket(s, O({ runs: ok([old, fresh]), attention: ok([item({ run: "builder-1" })]) }), j);
    expect(r).toEqual({ kind: "adopt", run: "builder-2", items: ["builder-1.lost.0"] });
  });
  it("no adopt before the retry is succeeded, for an unstarted run, or twice", () => {
    expect(advanceTicket(s, O({ runs: ok([old, fresh]), attention: ok([item()]) }), { "DGS-1:building:1:retry": "uncertain" }).kind).not.toBe("adopt");
    expect(advanceTicket(s, O({ runs: ok([old, { ...fresh, started: false }]) }), j).kind).not.toBe("adopt");
    expect(advanceTicket(s, O({ runs: ok([old, fresh]) }), { ...j, "DGS-1:building:1:adopt-retry": "succeeded" }).kind).not.toBe("adopt");
  });
  it("no adopt in a later phase once adopt-retry was used in an earlier one", () => {
    const sr = S({ phase: "review", attempt: 1 });
    const jr: JournalResults = { "DGS-1:building:1:retry": "succeeded", "DGS-1:building:1:adopt-retry": "succeeded" };
    const builder = run({ phaseEvent: "review" });
    const newer = run({ id: "builder-3", createdAt: "2026-10-21T03:00:00.000Z", phaseEvent: null });
    expect(advanceTicket(sr, O({ runs: ok([builder, newer]), attention: ok([item()]) }), jr).kind).not.toBe("adopt");
  });
});

describe("DGS-630 rule 3: a failed git read", () => {
  const wait = (reason: string) => ({ kind: "wait", reason });
  const gitNote = { kind: "attention", cause: "obs-git-failed", attKind: "unknown" };
  const phases: Array<["building" | "review" | "merge-ready", RunView["phaseEvent"]]> = [["building", "building"], ["review", "review"], ["merge-ready", "merge"]];
  for (const [phase, ev] of phases) {
    for (const status of ["complete", "done", "closed"]) {
      it(`${phase}: a failed git read with a done ticket (${status}) waits, no note`, () => {
        expect(advanceTicket(S({ phase }), O({ ...withEvent(ev), git: bad(), tracker: ok({ status }) }), J)).toEqual(wait("ticket-done"));
      });
    }
    it(`${phase}: a failed git read with an open ticket still gives obs-git-failed`, () => {
      expect(advanceTicket(S({ phase }), O({ ...withEvent(ev), git: bad() }), J)).toEqual(gitNote);
    });
    it(`${phase}: a failed tracker read does not hide obs-git-failed`, () => {
      expect(advanceTicket(S({ phase }), O({ ...withEvent(ev), git: bad(), tracker: bad() }), J)).toEqual(gitNote);
    });
  }
  it("merge-ready: a worktree-gone error waits", () => {
    expect(advanceTicket(S({ phase: "merge-ready" }), O({ ...withEvent("merge"), git: bad("worktree-gone: no branch") }), J)).toEqual(wait("worktree-gone"));
  });
  it("building and review: a worktree-gone error still gives obs-git-failed", () => {
    for (const [phase, ev] of phases.slice(0, 2)) {
      expect(advanceTicket(S({ phase }), O({ ...withEvent(ev), git: bad("worktree-gone: no branch") }), J)).toEqual(gitNote);
    }
  });
});
