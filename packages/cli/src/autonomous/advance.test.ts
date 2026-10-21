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
  ...o });
const J: JournalResults = {};
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
  it("attempt 2 needs a round 2 pack; until then it orders the fix once", () => {
    const s2 = S({ phase: "building", attempt: 2 });
    const o = O({ ...withEvent("building"), packs: ok([{ round: 1, head: "aaaaaaa1", base: "bbbbbbb1" }]) });
    expect(advanceTicket(s2, o, J)).toEqual({ kind: "order", order: "fix", head: "aaaaaaa1" });
    expect(advanceTicket(s2, o, { "DGS-1:building:2:order-fix": "succeeded" }).kind).toBe("wait");
    const o2 = O({ ...withEvent("building"), packs: ok([{ round: 2, head: "aaaaaaa1", base: "bbbbbbb1" }]) });
    expect(advanceTicket(s2, o2, J).kind).toBe("move");
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
  it("findings send the work back with attempt + 1, and stop at the cap", () => {
    expect(advanceTicket(s, O({ ...withEvent("review"), verdicts: v("findings") }), J)).toEqual({ kind: "move", to: "building", proof: "findings for aaaaaaa", attempt: 2 });
    expect(advanceTicket(S({ phase: "review", attempt: 3 }), O({ ...withEvent("review"), verdicts: v("findings") }), J)).toEqual({ kind: "attention", cause: "attempts-exhausted", attKind: "failed" });
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
  it("a ticket the tracker shows as to do while locked is put back to in progress, once", () => {
    const o = O({ ...withEvent("building"), tracker: ok({ status: "to do" }) });
    expect(advanceTicket(S({ phase: "building" }), o, J)).toEqual({ kind: "status", status: "in progress" });
    expect(advanceTicket(S({ phase: "building" }), o, { "DGS-1:building:1:status-write": "succeeded" }).kind).not.toBe("status");
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
      .toEqual({ kind: "move", to: "building", proof: "findings for aaaaaaa", attempt: 2 });
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
    expect(advanceTicket(S({ phase: "building", attempt: 2 }), O({ ...withEvent("building"), git: nohead, ...fixPack }), J)).toEqual({ kind: "attention", cause: "no-head", attKind: "unknown" });
    expect(advanceTicket(S({ phase: "building" }), O({ ...withEvent("building"), git: nohead, herdr: ok(pane(false)) }), J)).toEqual({ kind: "attention", cause: "no-head", attKind: "unknown" });
  });

  it("uncertain and permanent fix orders give notes, retryable sends again", () => {
    const s2 = S({ phase: "building", attempt: 2 });
    const o = O({ ...withEvent("building"), ...fixPack });
    expect(advanceTicket(s2, o, { "DGS-1:building:2:order-fix": "uncertain" })).toEqual({ kind: "attention", cause: "order-fix-uncertain", attKind: "unknown" });
    expect(advanceTicket(s2, o, { "DGS-1:building:2:order-fix": "permanent" })).toEqual({ kind: "attention", cause: "order-fix-permanent", attKind: "failed" });
    expect(advanceTicket(s2, o, { "DGS-1:building:2:order-fix": "retryable" })).toEqual({ kind: "order", order: "fix", head: "aaaaaaa1" });
  });

  describe("the gate on the fix and restart orders", () => {
    const gateObs = (over: { conductorPresent?: boolean; conductorWorking?: boolean; input?: "empty" | "typed" | "unknown"; builderPane?: "present" | "gone" | "unknown" }, extra: Partial<Observations> = {}) =>
      O({ ...withEvent("building"), herdr: ok({ conductorPresent: true, conductorWorking: false, input: "empty" as const, builderPane: "present", ...over }), ...extra });
    const fixS = S({ phase: "building", attempt: 2 });
    const restartS = S({ phase: "building" });

    it("fix: a working conductor waits", () => expect(advanceTicket(fixS, gateObs({ conductorWorking: true }, fixPack), J)).toEqual({ kind: "wait", reason: "conductor-working" }));
    it("fix: typed text waits", () => expect(advanceTicket(fixS, gateObs({ input: "typed" }, fixPack), J)).toEqual({ kind: "wait", reason: "conductor-input-typed" }));
    it("fix: an unparsed input box gives a note", () => expect(advanceTicket(fixS, gateObs({ input: "unknown" }, fixPack), J)).toEqual({ kind: "attention", cause: "obs-input-unknown", attKind: "unknown" }));
    it("fix: no conductor gives a note", () => expect(advanceTicket(fixS, gateObs({ conductorPresent: false }, fixPack), J)).toEqual({ kind: "attention", cause: "conductor-missing", attKind: "unknown" }));

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
    const o = O({ ...withEvent("review"), verdicts: ok([{ scope: "ticket" as const, result: "findings" as const, head: "aaaaaaa1" }]) });
    expect(advanceTicket(s, o, { "DGS-1:review:1:move-to-building": "succeeded" })).toEqual({ kind: "attention", cause: "move-key-used", attKind: "unknown" });
    expect(advanceTicket(s, o, { "DGS-1:review:1:move-to-building": "retryable" })).toMatchObject({ kind: "move", to: "building" });
  });
});
