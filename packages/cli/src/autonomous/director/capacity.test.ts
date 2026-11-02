import { describe, expect, it } from "vitest";
import { refusal, type Count, type Slot } from "../../run/limit.ts";
import { laneState } from "./capacity.ts";

const slot = (kind: Slot["kind"], run: string, ticket: string, state: Slot["state"] = "busy"): Slot => ({ kind, run, ticket, state, ageMin: 3, factory: false });
const count = (over: { builder?: Slot[]; role?: Slot[]; stale?: Slot[]; limits?: Count["limits"] } = {}): Count => ({
  limits: over.limits ?? { builder: 2, reviewer: 1, role: 1 },
  used: { builder: over.builder ?? [], reviewer: [], role: over.role ?? [] },
  stale: over.stale ?? [],
});

describe("laneState", () => {
  it("build lane free: no lock and the builder limit not full", () => {
    expect(laneState(count(), null, null)).toEqual({ build: null, refine: null, stale: [] });
  });
  it("build lane busy: lock held (text names the ticket)", () => {
    const s = laneState(count(), { ticket: "DGS-9" }, null);
    expect(s.build).toContain("DGS-9");
    expect(s.refine).toBeNull();
  });
  it("build lane busy: builder limit full (text is the refusal text)", () => {
    const c = count({ builder: [slot("builder", "a", "DGS-1"), slot("builder", "b", "DGS-2")] });
    expect(laneState(c, null, null).build).toBe(refusal(c, "builder"));
  });
  it("refine lane free: no refine lock and the role limit not full", () => {
    expect(laneState(count(), null, null).refine).toBeNull();
  });
  it("refine lane busy for each reason", () => {
    expect(laneState(count(), null, { ticket: "DGS-5" }).refine).toContain("DGS-5");
    const c = count({ role: [slot("role", "r1", "DGS-6")] });
    expect(laneState(c, null, null).refine).toBe(refusal(c, "role"));
  });
  it("the lanes are independent", () => {
    const s = laneState(count(), { ticket: "DGS-9" }, { ticket: "DGS-5" });
    expect(s.build).not.toBeNull();
    expect(s.refine).not.toBeNull();
    expect(laneState(count({ role: [slot("role", "r1", "DGS-6")] }), null, null).build).toBeNull();
  });
  it("a stale slot is reported in the stale list, not counted busy", () => {
    const s = laneState(count({ stale: [slot("builder", "dead-run", "DGS-3", "stale")] }), null, null);
    expect(s.stale).toEqual(["dead-run"]);
    expect(s.build).toBeNull();
  });
  it("never throws on an unreadable count: it reports lane 'unknown'", () => {
    const s = laneState(null as unknown as Count, null, null);
    expect(s.build).toBe("unknown");
    expect(s.refine).toBe("unknown");
    expect(s.stale).toEqual([]);
    expect(laneState({} as Count, { ticket: "DGS-1" }, null).build).toContain("DGS-1");
  });
});
