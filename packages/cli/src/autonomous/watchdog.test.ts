import { describe, expect, it } from "vitest";
import { classify, decideRetry, DEFAULT_BUDGETS, isWatched, phaseOf } from "./watchdog.ts";

const T0 = Date.parse("2026-10-21T10:00:00Z");
const min = (m: number) => new Date(T0 + m * 60_000).toISOString();
const run = (role = "builder") => ({
  schema: "nightwatch-run/v1", run: "builder-x", ticket: "DGS-1", role, order: null, seat: null, model: null,
  plugin_version: null, base_sha: null, branch: null, worktree: null,
  herdr: { workspace: "w2", tab: null, pane: "w2:p1" }, budget: null, created_at: min(0),
}) as never;
let seq = 0;
const ev = (type: string, m: number, data: Record<string, unknown> = type === "blocked" ? { kind: "permission_prompt" } : {}) =>
  ({ schema: "nightwatch-event/v1", seq: ++seq, ts: min(m), run: "builder-x", type, data }) as never;
const at = (m: number) => T0 + m * 60_000;

describe("classify", () => {
  it("ended wins over everything", () => {
    expect(classify(run(), [ev("started", 0), ev("ended", 5)], "gone", at(500), DEFAULT_BUDGETS).state).toBe("ended");
  });
  it("F1: ended, then started (/clear), then blocked is blocked, not ended", () => {
    const v = classify(run(), [ev("started", 0), ev("ended", 5), ev("started", 6), ev("blocked", 7)], "present", at(8), DEFAULT_BUDGETS);
    expect(v.state).toBe("blocked");
  });
  it("F1: ended after the last started is ended", () => {
    expect(classify(run(), [ev("started", 0), ev("ended", 5), ev("started", 6), ev("ended", 7)], "present", at(8), DEFAULT_BUDGETS).state).toBe("ended");
  });
  it("F2: a permission_prompt is blocked", () => {
    expect(classify(run(), [ev("started", 0), ev("blocked", 1, { kind: "permission_prompt" })], "present", at(2), DEFAULT_BUDGETS).state).toBe("blocked");
  });
  it("F2: idle_prompt after turn_end is healthy", () => {
    expect(classify(run(), [ev("started", 0), ev("turn_end", 1), ev("blocked", 2, { kind: "idle_prompt" })], "present", at(3), DEFAULT_BUDGETS).state).toBe("healthy");
  });
  it("F2: elicitation_dialog and a missing kind are not blocked", () => {
    expect(classify(run(), [ev("started", 0), ev("blocked", 1, { kind: "elicitation_dialog" })], "present", at(2), DEFAULT_BUDGETS).state).toBe("healthy");
    expect(classify(run(), [ev("started", 0), ev("blocked", 1, {})], "present", at(2), DEFAULT_BUDGETS).state).toBe("healthy");
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
  it("a builder waiting for review after review_ready is not stalled", () => {
    const e = [ev("started", 0), ev("review_ready", 40)];
    expect(classify(run(), e, "present", at(50), DEFAULT_BUDGETS).state).toBe("healthy");
    expect(phaseOf(run(), e)).toBeNull();
  });
  it("a tool after an earlier phase event still restarts the building clock after review_ready", () => {
    const e = [ev("started", 0), ev("phase", 1, { phase: "review" }), ev("review_ready", 40), ev("tool", 50)];
    expect(phaseOf(run(), e)).toEqual({ phase: "building", since: min(50) });
  });
  it("a phase event after a review_ready and tool cycle sets the phase and its start", () => {
    const e = [ev("started", 0), ev("review_ready", 40), ev("tool", 50), ev("phase", 60, { phase: "review" })];
    expect(phaseOf(run(), e)).toEqual({ phase: "review", since: min(60) });
  });
  it("a builder with an earlier phase event is stalled only 45 min after the tool that follows review_ready", () => {
    const e = [ev("started", 0), ev("phase", 1, { phase: "building" }), ev("review_ready", 40), ev("tool", 50), ev("tool", 70), ev("tool", 90)];
    expect(classify(run(), e, "present", at(95), DEFAULT_BUDGETS).state).toBe("healthy");
    const v = classify(run(), e, "present", at(96), DEFAULT_BUDGETS);
    expect(v.state).toBe("stalled");
    expect(v.cause).toBe("building-over-45-min");
    expect(v.since).toBe(min(50));
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
  describe("DGS-589: herdr status answers a permission prompt", () => {
    // the prompt is at minute 1; now is minute 6, so it is 5 minutes old
    const prompt = () => [ev("started", 0), ev("blocked", 1)];
    const st = (status: string | null, events = prompt(), nowMin = 6) =>
      classify(run(), events, "present", at(nowMin), DEFAULT_BUDGETS, status);

    it("stays blocked when herdr says blocked, unknown, null or a value we do not know", () => {
      for (const s of ["blocked", "unknown", null, "weird", ""]) expect(st(s).state).toBe("blocked");
    });
    it("is healthy when herdr says idle, done or working", () => {
      for (const s of ["idle", "done", "working"]) expect(st(s)).toEqual({ state: "healthy", cause: "prompt-answered", since: min(1) });
    });
    it("no status argument behaves as null: stays blocked", () => {
      expect(classify(run(), prompt(), "present", at(6), DEFAULT_BUDGETS).state).toBe("blocked");
    });
    it("keeps the 60 s grace: done with a 30 s old prompt is still blocked, at 60 s it is healthy", () => {
      expect(st("done", prompt(), 1.5).state).toBe("blocked");
      expect(st("done", prompt(), 2).state).toBe("healthy");
    });
    it("a second permission_prompt is a new episode: blocked again with the new since", () => {
      const e = [ev("started", 0), ev("blocked", 1), ev("blocked", 8)];
      const v = st("blocked", e, 10);
      expect(v.state).toBe("blocked");
      expect(v.since).toBe(min(8));
      // a stale done right after the second prompt does not clear it (grace)
      expect(st("done", e, 8.5).state).toBe("blocked");
    });
    it("a plain healthy run keeps the empty verdict, also with a status and an older answered prompt", () => {
      expect(classify(run(), [ev("started", 0), ev("tool", 1)], "present", at(2), DEFAULT_BUDGETS, "done")).toEqual({ state: "healthy", cause: "", since: "" });
      expect(classify(run(), [ev("started", 0), ev("blocked", 1), ev("tool", 2)], "present", at(3), DEFAULT_BUDGETS, "done")).toEqual({ state: "healthy", cause: "", since: "" });
    });
    it("a gone pane is lost, even with status done", () => {
      expect(classify(run(), prompt(), "gone", at(6), DEFAULT_BUDGETS, "done").state).toBe("lost");
    });
    it("idle_prompt is no answer: permission_prompt then idle_prompt with a null status stays blocked", () => {
      const e = [ev("started", 0), ev("blocked", 1), ev("blocked", 2, { kind: "idle_prompt" })];
      expect(st(null, e, 6).state).toBe("blocked");
    });
    it("a healthy answer still meets the silence rule: done, but 30 min of silence is lost", () => {
      const v = st("done", prompt(), 1 + 30);
      expect(v.state).toBe("lost");
      expect(v.cause).toBe("silent-30-min");
    });
  });
});

describe("decideRetry", () => {
  it("pins the full retry table (advice only; lost is always retry-eligible on the first attempt)", () => {
    expect(decideRetry("failed", "transient", 0)).toBe("retry");
    expect(decideRetry("failed", "transient", 1)).toBe("attention");
    expect(decideRetry("failed", "durable", 0)).toBe("attention");
    expect(decideRetry("failed", "unknown", 0)).toBe("attention");
    for (const c of ["transient", "durable", "unknown"] as const) {
      expect(decideRetry("blocked", c, 0)).toBe("attention");
      expect(decideRetry("stalled", c, 0)).toBe("attention");
      expect(decideRetry("lost", c, 0)).toBe("retry");
      expect(decideRetry("lost", c, 1)).toBe("attention");
    }
  });
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

describe("DGS-598 role scope", () => {
  for (const role of ["maestro", "conductor", "other"]) {
    it(`never flags a ${role} run`, () => {
      expect(classify(run(role), [ev("started", 0)], "present", at(180), DEFAULT_BUDGETS)).toEqual({ state: "healthy", cause: "", since: "" });
      expect(classify(run(role), [ev("started", 0)], "gone", at(5), DEFAULT_BUDGETS).state).toBe("healthy");
      expect(classify(run(role), [ev("started", 0), ev("blocked", 1)], "present", at(2), DEFAULT_BUDGETS).state).toBe("healthy");
      expect(classify(run(role), [ev("started", 0), ev("ended", 1)], "present", at(2), DEFAULT_BUDGETS).state).toBe("ended");
    });
  }
  it("still flags builder, reviewer and scout", () => {
    expect(classify(run("scout"), [ev("started", 0)], "present", at(180), DEFAULT_BUDGETS).state).toBe("lost");
    expect(isWatched("builder") && isWatched("reviewer") && isWatched("scout")).toBe(true);
    expect(isWatched("maestro") || isWatched("conductor") || isWatched("other")).toBe(false);
  });
});
