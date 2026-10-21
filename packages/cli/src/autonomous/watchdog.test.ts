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
