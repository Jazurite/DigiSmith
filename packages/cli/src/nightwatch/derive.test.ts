// packages/cli/src/nightwatch/derive.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGETS } from "../autonomous/watchdog.ts";
import type { EventLine } from "../run/events.ts";
import type { RunRecord } from "../run/record.ts";
import { groupsOf, isAutonomousOrder, ledgerTasks, parsePlanTasks, phaseTable, pipelineOf, runRowOf, scalarData, triggerOf } from "./derive.ts";

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  schema: "nightwatch-run/v1", run: "builder-1", ticket: "DGS-590", role: "builder", order: null, seat: "dev0", model: "sonnet-5-5",
  plugin_version: null, base_sha: null, branch: "b", worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null,
  created_at: "2026-10-22T01:00:00.000Z", ...over,
});
const ev = (seq: number, type: string, ts: string, data: Record<string, unknown> = {}): EventLine => ({ schema: "nightwatch-event/v1", seq, ts, run: "builder-1", type, data });
const T0 = Date.parse("2026-10-22T01:00:00.000Z");

describe("triggerOf", () => {
  it("is manual for an order outside the autonomous folder", () => {
    expect(triggerOf(run({ order: "/x/order-nw-07.md" }), null, null)).toBe("manual");
  });
  it("is night-scan for an autonomous order", () => {
    expect(triggerOf(run({ order: "/d/orders/order-ao-2026-10-22-0310-DGS-590.md" }), null, null)).toBe("night-scan");
  });
  it("is away when away.json was on at the claim time", () => {
    const claim = { ts: "2026-10-22T01:00:00.000Z", tsUtc7: "", kind: "claim" as const, ticket: "DGS-590" };
    const away = { away: true, since: "2026-10-21T15:00:00.000Z", until: null, endedAt: null };
    expect(triggerOf(run({ order: "/d/orders/order-ao-x-DGS-590.md" }), claim, away)).toBe("away");
  });
  it("is unknown when the run has no order", () => {
    expect(triggerOf(run({ order: null }), null, null)).toBe("unknown");
  });
  it("isAutonomousOrder looks at the file name only", () => {
    expect(isAutonomousOrder("/a/order-ao-1.md")).toBe(true);
    expect(isAutonomousOrder("/order-ao-dir/order-nw-07.md")).toBe(false);
  });
});

describe("groupsOf and scalarData", () => {
  it("groups the event types", () => {
    expect(groupsOf({ type: "tool", data: { ok: true } })).toEqual(["agent"]);
    expect(groupsOf({ type: "tool", data: { ok: false } })).toEqual(["agent", "errors"]);
    expect(groupsOf({ type: "turn_end", data: {} })).toEqual(["agent"]);
    expect(groupsOf({ type: "blocked", data: {} })).toEqual(["errors"]);
    expect(groupsOf({ type: "lost", data: {} })).toEqual(["system", "errors"]);
    expect(groupsOf({ type: "phase", data: {} })).toEqual(["system"]);
  });
  it("keeps only the listed scalar keys", () => {
    expect(scalarData({ tool: "Edit", ok: true, session_id: "s", prompt: "secret", phase: { a: 1 } })).toEqual({ tool: "Edit", ok: true });
  });
});

describe("runRowOf", () => {
  it("a fresh builder is healthy and building", () => {
    const r = runRowOf(run(), [ev(1, "started", "2026-10-22T01:00:00.000Z")], "manual", DEFAULT_BUDGETS, T0 + 60_000);
    expect(r).toMatchObject({ state: "healthy", phase: "building", elapsedSec: 60, merged: false, pushed: false, endedAt: null });
  });
  it("a builder over its budget is stalled", () => {
    const r = runRowOf(run(), [ev(1, "started", "2026-10-22T01:00:00.000Z"), ev(2, "tool", "2026-10-22T01:50:00.000Z", { tool: "Edit", ok: true })], "manual", DEFAULT_BUDGETS, T0 + 51 * 60_000);
    expect(r.state).toBe("stalled");
  });
  it("an ended run has its end time, a merged flag and a frozen elapsed time", () => {
    const events = [ev(1, "started", "2026-10-22T01:00:00.000Z"), ev(2, "merged", "2026-10-22T01:30:00.000Z"), ev(3, "pushed", "2026-10-22T01:31:00.000Z"), ev(4, "ended", "2026-10-22T01:32:00.000Z")];
    const r = runRowOf(run(), events, "manual", DEFAULT_BUDGETS, T0 + 5 * 3600_000);
    expect(r).toMatchObject({ state: "ended", merged: true, pushed: true, endedAt: "2026-10-22T01:32:00.000Z", elapsedSec: 32 * 60 });
  });
});

describe("pipelineOf", () => {
  it("marks done steps, the current one and the waiting ones", () => {
    const events = [ev(1, "started", "2026-10-22T01:01:00.000Z"), ev(2, "phase", "2026-10-22T01:02:00.000Z", { phase: "building" })];
    const p = pipelineOf(run(), events, "2026-10-22T00:59:00.000Z", "healthy");
    expect(p.map((s) => [s.step, s.state])).toEqual([
      ["claimed", "done"], ["worktree-ready", "done"], ["building", "current"], ["review", "waiting"], ["merged", "waiting"], ["pushed", "waiting"],
    ]);
    expect(p[0].at).toBe("2026-10-22T00:59:00.000Z");
  });
  it("a lost run turns the current step lost; a manual run has no claim time", () => {
    const p = pipelineOf(run(), [ev(1, "started", "2026-10-22T01:01:00.000Z"), ev(2, "lost", "2026-10-22T01:20:00.000Z")], null, "lost");
    expect(p[0]).toMatchObject({ step: "claimed", at: null });
    expect(p.find((s) => s.state === "lost")?.step).toBe("building");
  });
});

describe("pipelineOf more states", () => {
  const started = ev(1, "started", "2026-10-22T01:01:00.000Z");
  it("blocked and stalled keep the furthest step current", () => {
    for (const st of ["blocked", "stalled"] as const) {
      const p = pipelineOf(run(), [started], null, st);
      expect(p.find((s) => s.state === "current")?.step).toBe("building");
    }
  });
  it("review reached makes building done and review current", () => {
    const p = pipelineOf(run(), [started, ev(2, "review_ready", "2026-10-22T01:10:00.000Z")], null, "healthy");
    expect(p.map((s) => s.state)).toEqual(["waiting", "done", "done", "current", "waiting", "waiting"]);
  });
  it("merged without pushed leaves pushed waiting", () => {
    const p = pipelineOf(run(), [started, ev(2, "merged", "2026-10-22T01:30:00.000Z")], null, "healthy");
    expect(p.find((s) => s.step === "merged")?.state).toBe("current");
    expect(p.find((s) => s.step === "pushed")?.state).toBe("waiting");
  });
});

describe("plan parsing", () => {
  const plan = "# P\n### Task 1: Schema\ntext\n### Task 2: Reader\n### Task 3: Route\n";
  it("reads the task headings", () => {
    expect(parsePlanTasks(plan)).toEqual([{ n: 1, title: "Schema" }, { n: 2, title: "Reader" }, { n: 3, title: "Route" }]);
  });
  it("reads ledger lines with a '- ' prefix", () => {
    const t = parsePlanTasks(plan);
    expect(ledgerTasks("- Task 1: complete\n- Task 2: fix round 1/5\n", t).map((x) => x.state)).toEqual(["done", "fix-round", "waiting"]);
  });
  it("reads the ledger: complete, fix round, waiting", () => {
    const ledger = "# SDD ledger — plan: x\nReview mode: hand\nTask 1: complete\nTask 2: fix round 1/5\nTask 2: fix round 2/5\n";
    expect(ledgerTasks(ledger, parsePlanTasks(plan))).toEqual([
      { n: 1, title: "Schema", state: "done", round: null },
      { n: 2, title: "Reader", state: "fix-round", round: 2 },
      { n: 3, title: "Route", state: "waiting", round: null },
    ]);
  });
});

describe("phaseTable", () => {
  it("counts the lock phase, the releases of the window and the open lost items", () => {
    const lock = { ticket: "DGS-590", taskId: "t", claimedAt: "2026-10-22T01:00:00.000Z", claimedAtUtc7: "", order: "", scanId: "", phase: "building", phaseStartedAt: "2026-10-22T01:05:00.000Z" };
    const releases = [
      { ts: "2026-10-21T01:00:00.000Z", tsUtc7: "", kind: "release" as const, ticket: "A-1", result: "merged" },
      { ts: "2026-10-21T02:00:00.000Z", tsUtc7: "", kind: "release" as const, ticket: "A-2", result: "failed" },
      { ts: "2026-10-21T03:00:00.000Z", tsUtc7: "", kind: "release" as const, ticket: "A-3", result: "stopped" },
    ];
    const rows = phaseTable({ lock, releases, lostOpen: [{ since: "2026-10-22T00:00:00.000Z" }], nowMs: T0 });
    const by = Object.fromEntries(rows.map((r) => [r.phase, r]));
    expect(rows.map((r) => r.phase)).toEqual(["claimed", "building", "review", "merge-ready", "merged", "released", "lost"]);
    expect(by.building).toEqual({ phase: "building", count: 1, oldestSince: "2026-10-22T01:05:00.000Z" });
    expect(by.merged.count).toBe(1);
    expect(by.released.count).toBe(3);
    expect(by.lost).toEqual({ phase: "lost", count: 1, oldestSince: "2026-10-22T00:00:00.000Z" });
    expect(by.claimed.count).toBe(0);
  });
});

describe("phaseTable window", () => {
  it("ignores a release older than 7 days", () => {
    const releases = [
      { ts: "2026-10-10T01:00:00.000Z", tsUtc7: "", kind: "release" as const, ticket: "A-1", result: "merged" },
      { ts: "2026-10-21T01:00:00.000Z", tsUtc7: "", kind: "release" as const, ticket: "A-2", result: "merged" },
    ];
    const rows = phaseTable({ lock: null, releases, lostOpen: [], nowMs: T0 });
    expect(rows.find((r) => r.phase === "released")?.count).toBe(1);
    expect(rows.find((r) => r.phase === "merged")?.count).toBe(1);
  });
});
