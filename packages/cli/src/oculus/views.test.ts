// packages/cli/src/oculus/views.test.ts
import { appendFileSync, mkdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDepot, type Depot } from "./fixture.test-util.ts";
import { attentionView, eventsView, overviewView, planView, runsView, runView } from "./views.ts";

const NOW = new Date("2026-10-22T03:00:00.000Z");
let d: Depot;
beforeEach(() => { d = makeDepot(); });
afterEach(() => d.cleanup());

const seedRun = (run = "builder-1", ticket = "DGS-590", order = "/d/orders/order-ao-2026-10-22-0910-DGS-590.md"): void => {
  d.writeRun({ ticket, run, role: "builder", created_at: "2026-10-22T02:20:00.000Z", order, seat: "dev0", model: "sonnet-5-5" });
  d.writeEvents(ticket, run, [
    { type: "started", ts: "2026-10-22T02:20:00.000Z", data: { source: "startup", session_id: "S1" } },
    { type: "tool", ts: "2026-10-22T02:59:00.000Z", data: { tool: "Edit", ok: true, session_id: "S1" } },
  ]);
};

describe("an empty depot", () => {
  it("every view answers with empty data", () => {
    const o = overviewView(d.env, NOW);
    expect(o.workers).toEqual([]);
    expect(o.attentionCount).toBe(0);
    expect(o.tickets.rows).toHaveLength(7);
    expect(o.scan).toMatchObject({ lastScanAt: null, candidates: null, breakerOpen: false });
    expect(attentionView(d.env, NOW)).toMatchObject({ open: [], resolved: [] });
    expect(runsView(d.env, NOW, {})).toMatchObject({ total: 0, runs: [] });
    expect(runView(d.env, NOW, { run: "nope-1" })).toBeNull();
    expect(eventsView(d.env, { run: "nope-1" })).toBeNull();
    expect(planView(d.env, { ticket: "DGS-590" })).toMatchObject({ found: false, tasks: [] });
  });
});

describe("torn and bad event lines", () => {
  const seedBad = (): void => {
    seedRun();
    appendFileSync(join(d.dir, "runs", "DGS-590", "builder-1", "events.jsonl"), [
      JSON.stringify({ schema: "nightwatch-event/v1", seq: 3, ts: "2026-10-22T02:59:30.000Z", run: "builder-1", type: "tool" }),
      JSON.stringify({ type: "tool", data: {} }),
      "null",
      "[1,2]",
      JSON.stringify({ seq: 1.5, ts: "2026-10-22T02:59:40.000Z", type: "tool", data: {} }),
      '{"seq":9,"ts":"2026-10-22T0',
    ].join("\n") + "\n");
  };
  it("overview and events skip lines of the wrong shape and default a missing data to {}", () => {
    seedBad();
    expect(() => overviewView(d.env, NOW)).not.toThrow();
    const e = eventsView(d.env, { run: "builder-1" });
    expect(e?.lines).toHaveLength(3);
    expect(e?.lines.map((l) => l.type)).toEqual(["started", "tool", "tool"]);
    expect(runView(d.env, NOW, { run: "builder-1" })).not.toBeNull();
  });
});

describe("overview", () => {
  it("lists the open worker, the scan facts and the last events", () => {
    seedRun();
    d.writeAutonomousEvent("2026-10-22", { ts: "2026-10-22T02:10:00.000Z", tsUtc7: "", kind: "scan", candidates: 5, skipped: 0, claimed: "DGS-590" });
    d.writeAutonomousEvent("2026-10-22", { ts: "2026-10-22T02:10:01.000Z", tsUtc7: "", kind: "claim", ticket: "DGS-590", order: "/d/orders/order-ao-2026-10-22-0910-DGS-590.md" });
    const o = overviewView(d.env, NOW);
    expect(o.workers.map((w) => w.run)).toEqual(["builder-1"]);
    expect(o.workers[0]).toMatchObject({ state: "healthy", trigger: "night-scan", phase: "building" });
    expect(o.scan).toMatchObject({ lastScanAt: "2026-10-22T02:10:00.000Z", candidates: 5 });
    expect(o.lastEvents[0]).toMatchObject({ source: "DGS-590" });
    expect(o.lastEvents.length).toBeLessThanOrEqual(20);
  });
  it("counts open attention items and an open breaker", () => {
    d.writeAttention([{ schema: "nightwatch-attention/v1", id: "r.lost.1", ts: "2026-10-22T01:00:00.000Z", ticket: "DGS-588", run: "r", kind: "lost", cause: "silent-30-min", since: "2026-10-22T00:30:00.000Z" }]);
    writeFileSync(join(d.autonomous, "breaker.json"), JSON.stringify({ open: true, streak: 2, failed: ["A-1", "A-2"], openedAt: "2026-10-22T01:00:00.000Z" }));
    const o = overviewView(d.env, NOW);
    expect(o.attentionCount).toBe(1);
    expect(o.tickets.rows.find((r) => r.phase === "lost")?.count).toBe(1);
    expect(o.scan).toMatchObject({ breakerOpen: true, breakerStreak: 2 });
  });
  it("skips a run whose files are broken", () => {
    seedRun();
    mkdirSync(join(d.dir, "runs", "DGS-1", "broken"), { recursive: true });
    writeFileSync(join(d.dir, "runs", "DGS-1", "broken", "run.json"), "{ not json");
    expect(overviewView(d.env, NOW).workers).toHaveLength(1);
  });
});

describe("attention", () => {
  it("returns open items oldest first and the last resolved ones", () => {
    d.writeAttention([
      { schema: "nightwatch-attention/v1", id: "a", ts: "2026-10-22T01:00:00.000Z", ticket: "T-1", run: "r1", kind: "stalled", cause: "building-over-45-min", since: "2026-10-22T00:00:00.000Z", causeClass: "unknown" },
      { schema: "nightwatch-attention/v1", id: "b", ts: "2026-10-22T02:00:00.000Z", ticket: "T-2", run: "r2", kind: "lost", cause: "pane-gone", since: "2026-10-22T01:30:00.000Z", causeClass: "transient", retryEligible: true },
      { schema: "nightwatch-attention/v1", id: "c", ts: "2026-10-22T02:30:00.000Z", ticket: "T-3", run: "r3", kind: "blocked", cause: "waiting-for-answer", since: "2026-10-22T02:00:00.000Z" },
      { schema: "nightwatch-attention/v1", id: "c", ts: "2026-10-22T02:40:00.000Z", resolved: true, by: "watchdog", note: "tool seen" },
    ]);
    const a = attentionView(d.env, NOW);
    expect(a.open.map((i) => i.id)).toEqual(["a", "b"]);
    expect(a.open[1]).toMatchObject({ causeClass: "transient", retryEligible: true });
    expect(a.open[0]).toMatchObject({ retryEligible: null });
    expect(a.resolved).toEqual([{ id: "c", ticket: "T-3", kind: "blocked", by: "watchdog", ts: "2026-10-22T02:40:00.000Z", note: "tool seen" }]);
  });
});

describe("runs", () => {
  it("filters by state, role, ticket and trigger and caps the rows", () => {
    seedRun("builder-1", "DGS-590");
    d.writeRun({ ticket: "DGS-591", run: "reviewer-1", role: "reviewer", created_at: "2026-10-22T02:30:00.000Z", order: "/x/order-nw-1.md" });
    d.writeEvents("DGS-591", "reviewer-1", [{ type: "started", ts: "2026-10-22T02:30:00.000Z" }, { type: "ended", ts: "2026-10-22T02:40:00.000Z", data: { reason: "other" } }]);
    expect(runsView(d.env, NOW, {}).total).toBe(2);
    expect(runsView(d.env, NOW, { role: "reviewer" }).runs.map((r) => r.run)).toEqual(["reviewer-1"]);
    expect(runsView(d.env, NOW, { state: "ended" }).runs.map((r) => r.run)).toEqual(["reviewer-1"]);
    expect(runsView(d.env, NOW, { ticket: "DGS-590" }).runs.map((r) => r.run)).toEqual(["builder-1"]);
    expect(runsView(d.env, NOW, { trigger: "manual" }).runs.map((r) => r.run)).toEqual(["reviewer-1"]);
    const capped = runsView(d.env, NOW, { limit: 1 });
    expect(capped.runs).toHaveLength(1);
    expect(capped.total).toBe(2);
  });
});

describe("run and events", () => {
  it("the run view has the pipeline, the budget, the record and an order that is not available", () => {
    seedRun();
    const r = runView(d.env, NOW, { run: "builder-1", cwd: d.dir });
    expect(r?.row.run).toBe("builder-1");
    expect(r?.pipeline).toHaveLength(6);
    expect(r?.budget).toMatchObject({ phase: "building", limitMin: 45, building: 45, review: 60, merge: 20 });
    expect(r?.record.ticket).toBe("DGS-590");
    expect(r?.order).toEqual({ available: false, text: "" });
  });
  it("reads an order inside the sessions folder and refuses one outside", () => {
    const orders = join(d.dir, "sessions", "DigiSmith", "orders");
    mkdirSync(orders, { recursive: true });
    writeFileSync(join(orders, "o1.md"), "Build it.");
    d.writeRun({ ticket: "DGS-590", run: "builder-2", role: "builder", created_at: "2026-10-22T02:20:00.000Z", order: join(orders, "o1.md") });
    d.writeRun({ ticket: "DGS-590", run: "builder-3", role: "builder", created_at: "2026-10-22T02:21:00.000Z", order: "/etc/hosts" });
    expect(runView(d.env, NOW, { run: "builder-2" })?.order).toEqual({ available: true, text: "Build it." });
    expect(runView(d.env, NOW, { run: "builder-3" })?.order.available).toBe(false);
  });
  it("events: line-count cursor, tail, before and groups", () => {
    seedRun();
    const run = "builder-1";
    const lines = Array.from({ length: 10 }, (_, i) => ({ type: i === 5 ? "blocked" : "tool", ts: `2026-10-22T02:${String(30 + i).padStart(2, "0")}:00.000Z`, data: { tool: "Edit", ok: true } }));
    d.writeEvents("DGS-590", run, lines);
    const all = eventsView(d.env, { run });
    expect(all).toMatchObject({ total: 10, from: 0 });
    expect(all?.lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(eventsView(d.env, { run, since: 8 })?.lines.map((l) => l.n)).toEqual([9, 10]);
    expect(eventsView(d.env, { run, tail: 3 })?.lines.map((l) => l.n)).toEqual([8, 9, 10]);
    expect(eventsView(d.env, { run, tail: 3, before: 8 })?.lines.map((l) => l.n)).toEqual([5, 6, 7]);
    expect(eventsView(d.env, { run, group: "errors" })?.lines.map((l) => l.n)).toEqual([6]);
    expect(eventsView(d.env, { run, group: "agent" })?.lines).toHaveLength(9);
  });
  it("events: tolerates a repeated seq (file order wins) and validates the cursors", () => {
    seedRun();
    const f = join(d.dir, "runs", "DGS-590", "builder-1", "events.jsonl");
    const ln = (seq: number, i: number): string => JSON.stringify({ schema: "nightwatch-event/v1", seq, ts: `2026-10-22T02:3${i}:00.000Z`, run: "builder-1", type: "tool", data: {} }) + "\n";
    writeFileSync(f, ln(1, 0) + ln(2, 1) + ln(2, 2) + ln(3, 3));
    const e = eventsView(d.env, { run: "builder-1" });
    expect(e?.total).toBe(4);
    expect(e?.lines.map((l) => l.n)).toEqual([1, 2, 3, 4]);
    expect(eventsView(d.env, { run: "builder-1", tail: 0 })?.lines).toEqual([]);
    expect(eventsView(d.env, { run: "builder-1", tail: -2 })?.lines).toHaveLength(4);
    expect(eventsView(d.env, { run: "builder-1", since: -5 })?.lines).toHaveLength(4);
    expect(eventsView(d.env, { run: "builder-1", since: 1.5, before: Number.NaN })?.lines).toHaveLength(4);
  });
  it("refuses an unsafe run name", () => {
    seedRun();
    expect(runView(d.env, NOW, { run: "../builder-1" })).toBeNull();
    expect(eventsView(d.env, { run: "../builder-1" })).toBeNull();
    expect(planView(d.env, { ticket: "../DGS-590" })).toMatchObject({ found: false });
  });
  it("budget elapsedMin counts from the newest phase event", () => {
    seedRun();
    d.writeEvents("DGS-590", "builder-1", [
      { type: "started", ts: "2026-10-22T02:20:00.000Z" },
      { type: "phase", ts: "2026-10-22T02:30:00.000Z", data: { phase: "building" } },
      { type: "tool", ts: "2026-10-22T02:59:00.000Z", data: { tool: "Edit", ok: true } },
    ]);
    expect(runView(d.env, NOW, { run: "builder-1" })?.budget).toMatchObject({ phase: "building", elapsedMin: 30 });
  });
  it("events show no prompt or session id", () => {
    seedRun();
    const e = eventsView(d.env, { run: "builder-1" });
    expect(JSON.stringify(e)).not.toMatch(/session_id|S1/);
  });
});

describe("plan", () => {
  it("reads the workspace of the ticket's builder worktree", () => {
    const wt = join(d.dir, "wt");
    const ws = join(wt, ".digismith", "board", "DGS-590—x", ".sdd-workspace");
    mkdirSync(ws, { recursive: true });
    const planFile = join(wt, ".digismith", "board", "DGS-590—x", "plan.md");
    writeFileSync(planFile, "### Task 1: Schema\n### Task 2: Reader\n");
    writeFileSync(join(ws, "progress.md"), `# SDD ledger — plan: ${planFile}\nReview mode: hand\nTask 1: complete\nReview task 1 r1: F1 -> fixed\nReview task 2 r1: F1 -> parked (later ticket)\nReview task 3 r1: F1 -> fixing\n`);
    d.writeRun({ ticket: "DGS-590", run: "builder-1", role: "builder", created_at: "2026-10-22T02:20:00.000Z", worktree: wt });
    const p = planView(d.env, { ticket: "DGS-590" });
    expect(p).toMatchObject({ found: true, tasksTotal: 2, tasksDone: 1, ledgerError: false });
    expect(p.tasks.map((t) => t.state)).toEqual(["done", "waiting"]);
    expect(p.verdicts).toEqual([
      { scope: "task", id: "1", round: 1, finding: "F1", verdict: "fixed", reason: "" },
      { scope: "task", id: "2", round: 1, finding: "F1", verdict: "parked", reason: "later ticket" },
      { scope: "task", id: "3", round: 1, finding: "F1", verdict: "fixing", reason: "" },
    ]);
  });
  it("a ledger line that does not parse sets ledgerError and keeps the tasks", () => {
    const wt = join(d.dir, "wt2");
    const ws = join(wt, ".digismith", "board", "DGS-591—x", ".sdd-workspace");
    mkdirSync(ws, { recursive: true });
    const planFile = join(wt, ".digismith", "board", "DGS-591—x", "plan.md");
    writeFileSync(planFile, "### Task 1: A\n");
    writeFileSync(join(ws, "progress.md"), `# SDD ledger — plan: ${planFile}\nTask 1: complete\nReview task 1 r1: garbage\n`);
    d.writeRun({ ticket: "DGS-591", run: "builder-9", role: "builder", created_at: "2026-10-22T02:20:00.000Z", worktree: wt });
    const p = planView(d.env, { ticket: "DGS-591" });
    expect(p).toMatchObject({ found: true, ledgerError: true, verdicts: [] });
    expect(p.tasks[0].state).toBe("done");
  });
  it("refuses a plan file reached through a symlink that points outside the worktree", () => {
    const wt = join(d.dir, "wt4");
    const board = join(wt, ".digismith", "board", "DGS-593—x");
    const ws = join(board, ".sdd-workspace");
    mkdirSync(ws, { recursive: true });
    const outside = join(d.dir, "outside-plan.md");
    writeFileSync(outside, "### Task 1: Secret\n");
    symlinkSync(outside, join(board, "plan.md"));
    writeFileSync(join(ws, "progress.md"), `# SDD ledger — plan: ${join(board, "plan.md")}\n`);
    d.writeRun({ ticket: "DGS-593", run: "builder-7", role: "builder", created_at: "2026-10-22T02:20:00.000Z", worktree: wt });
    expect(planView(d.env, { ticket: "DGS-593" })).toMatchObject({ found: true, planFile: null, tasks: [] });
  });
  it("refuses a plan file outside the worktree", () => {
    const wt = join(d.dir, "wt3");
    const ws = join(wt, ".digismith", "board", "DGS-592—x", ".sdd-workspace");
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "progress.md"), "# SDD ledger — plan: /etc/hosts\n");
    d.writeRun({ ticket: "DGS-592", run: "builder-8", role: "builder", created_at: "2026-10-22T02:20:00.000Z", worktree: wt });
    expect(planView(d.env, { ticket: "DGS-592" })).toMatchObject({ found: true, planFile: null, tasks: [] });
  });
});

describe("DGS-598", () => {
  const autoRun = (folder: string, run: string, ticket: string | null, role: "maestro" | "builder", project: string): void => {
    d.writeRun({ folder, ticket, run, role, created_at: "2026-10-22T00:00:00.000Z", project, source: "auto" });
    d.writeEvents(folder, run, [{ type: "started", ts: "2026-10-22T00:00:00.000Z", data: { source: "startup" } }]);
  };
  it("runs rows carry project and source; --project filters; a null ticket stays null", () => {
    autoRun("DigiSmith", "s-m1", null, "maestro", "DigiSmith");
    autoRun("EMKT-1", "s-b1", "EMKT-1", "builder", "emma-theme");
    const all = runsView(d.env, NOW, {}).runs;
    expect(all.map((r) => [r.run, r.project, r.source]).sort()).toEqual([["s-b1", "emma-theme", "auto"], ["s-m1", "DigiSmith", "auto"]]);
    expect(runsView(d.env, NOW, { project: "emma-theme" }).runs.map((r) => r.run)).toEqual(["s-b1"]);
    const m = all.find((r) => r.run === "s-m1")!;
    expect(m.ticket).toBeNull();
    expect(m.state).toBe("healthy"); // silent 3 h, but a maestro run is never lost
  });
  it("project and role filters combine", () => {
    autoRun("DigiSmith", "s-m1", null, "maestro", "DigiSmith");
    autoRun("DS-1", "s-b1", "DS-1", "builder", "DigiSmith");
    autoRun("emma", "s-m2", null, "maestro", "emma-theme");
    autoRun("EMKT-1", "s-b2", "EMKT-1", "builder", "emma-theme");
    expect(runsView(d.env, NOW, { project: "DigiSmith", role: "maestro" }).runs.map((r) => r.run)).toEqual(["s-m1"]);
    expect(runsView(d.env, NOW, { project: "emma-theme", role: "builder" }).runs.map((r) => r.run)).toEqual(["s-b2"]);
  });
  it("overview and runs skip runs idle for more than 7 days", () => {
    autoRun("DigiSmith", "s-old", null, "maestro", "DigiSmith");
    const t = (NOW.getTime() - 9 * 86_400_000) / 1000;
    for (const f of ["run.json", "events.jsonl"]) utimesSync(join(d.dir, "runs", "DigiSmith", "s-old", f), t, t);
    expect(runsView(d.env, NOW, {}).runs).toEqual([]);
    expect(overviewView(d.env, NOW).workers).toEqual([]);
  });
});
