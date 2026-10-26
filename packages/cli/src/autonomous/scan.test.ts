import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAway, writeAway } from "./away.ts";
import type { Exec } from "./conductor.ts";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { REASON, TYPE_BUG } from "./ready.ts";
import { runScan, type ScanDeps } from "./scan.ts";
import { readJournal, resultsOf, journalPath } from "./journal.ts";
import type { TickResult } from "./tick.ts";
import { acquireLock, readEvents, readLock } from "./state.ts";
import { readOpen } from "./attention.ts";
import { appendAttention } from "./attention-write.ts";
import type { ScanGuard } from "./scan-guard.ts";

const NIGHT = new Date("2026-10-20T17:00:00.000Z"); // 00:00 UTC+7
const DAY = new Date("2026-10-21T03:00:00.000Z"); // 10:00 UTC+7
const NOON = new Date("2026-10-21T05:00:00.000Z"); // 12:00 UTC+7
const HERDR = join(homedir(), ".digismith-depot", "bin", "herdr-ws");

let root: string;
let dir: string;
let ordersDir: string;
let conductorsJson: string;
let tracker: FakeTracker;
let execCalls: { file: string; args: string[] }[];
let execImpl: Exec;
let fetchCalls: string[];
let now: Date;

const exec: Exec = async (file, args) => { execCalls.push({ file, args }); return execImpl(file, args); };
const mk = (over: Partial<ScanDeps> = {}): ScanDeps => ({
  tracker, dir, ordersDir, conductorsJson, repo: "/repo",
  now: () => now, scanId: "scan-1", exec, fileExists: () => false, dryRun: false,
  nexus: {
    baseUrl: "http://fake",
    tokenFile: join(root, "token"),
    fetch: (async (url: string) => { fetchCalls.push(url); return new Response("{}", { status: 202 }); }) as unknown as typeof fetch,
  },
  ...over,
});
const events = () => readEvents(dir, now.getTime() - 48 * 3600_000, now.getTime() + 1000);
const kinds = () => events().map((e) => e.kind);
const orderText = () => readFileSync(join(ordersDir, readdirSync(ordersDir)[0]), "utf8");
const orders = () => (existsSync(ordersDir) ? readdirSync(ordersDir) : []);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "auto-scan-"));
  dir = join(root, "autonomous");
  ordersDir = join(root, "orders");
  conductorsJson = join(root, "conductors.json");
  writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { tab: 1, workspace: "w2" } }));
  writeFileSync(join(root, "token"), "tok\n");
  tracker = new FakeTracker();
  execCalls = [];
  execImpl = async () => ({ code: 0, stderr: "" });
  fetchCalls = [];
  now = NIGHT;
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("runScan: any hour", () => {
  it("noon, away off: claims a to do Autonomous ticket and it reads claimed", async () => {
    now = NOON;
    writeAway(dir, { away: false, since: "", until: null, endedAt: NIGHT.toISOString() });
    tracker.add({ id: "t1", key: "DGS-1" });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-1", candidates: 1 });
    expect(tracker.tasks.get("t1")?.status).toBe("claimed");
    expect(tracker.calls).toEqual(["hasStatus claimed", "listByStatus to do", "setStatus t1 claimed", "getStatus t1"]);
    expect(readLock(dir)?.ticket).toBe("DGS-1");
    expect(kinds()).toEqual(["claim", "scan"]);
    expect(kinds()).not.toContain("off");
  });
  it("noon with no away file: claims", async () => {
    now = NOON;
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("claimed");
  });
  it("away on and away off give the same claim", async () => {
    now = NOON;
    const run = async (away: boolean) => {
      rmSync(dir, { recursive: true, force: true });
      rmSync(ordersDir, { recursive: true, force: true });
      tracker = new FakeTracker();
      execCalls = [];
      writeAway(dir, { away, since: NOON.toISOString(), until: null, endedAt: away ? null : NOON.toISOString() });
      tracker.add({ id: "t1", key: "DGS-1", priority: 2 });
      tracker.add({ id: "t2", key: "DGS-2", priority: 1 });
      const r = await runScan(mk());
      return { r, calls: tracker.calls, status: [...tracker.tasks.values()].map((t) => t.status), orders: orders(), exec: execCalls.length };
    };
    const on = await run(true);
    const off = await run(false);
    expect(on.r).toMatchObject({ outcome: "claimed", claimed: "DGS-2" });
    expect(off).toEqual(on);
  });
  it("daytime, away with no until: claims a to do ticket", async () => {
    now = DAY;
    writeAway(dir, { away: true, since: DAY.toISOString(), until: null, endedAt: null });
    tracker.add({ id: "t1" });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "T1" });
    expect(events().find((e) => e.kind === "claim")).toMatchObject({ ticket: "T1", taskId: "t1" });
  });
  it("daytime, away until in the future: works", async () => {
    now = DAY;
    writeAway(dir, { away: true, since: DAY.toISOString(), until: new Date(DAY.getTime() + 3600_000).toISOString(), endedAt: null });
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("claimed");
  });
  it("daytime, away until in the past: runBack runs once and the scan still claims", async () => {
    now = DAY;
    writeAway(dir, { away: true, since: "2026-10-21T00:00:00.000Z", until: new Date(DAY.getTime() - 60_000).toISOString(), endedAt: null });
    tracker.add({ id: "t1" });
    const r = await runScan(mk());
    expect(r.outcome).toBe("claimed");
    expect(readAway(dir)?.away).toBe(false);
    expect(kinds()).toEqual(["away-expired", "run-now", "claim", "scan"]);
    expect(fetchCalls).toEqual(["http://fake/api/v1/jobs/autonomous-report/run"]);
  });
  it("a failing runBack never stops the scan", async () => {
    now = DAY;
    writeAway(dir, { away: true, since: "", until: new Date(DAY.getTime() - 60_000).toISOString(), endedAt: null });
    const r = await runScan(mk({ nexus: { baseUrl: "http://fake", tokenFile: join(root, "token"), fetch: (async () => { throw new Error("x"); }) as unknown as typeof fetch } }));
    expect(r.outcome).toBe("none");
    expect(readAway(dir)?.away).toBe(false);
    expect(events()).toMatchObject([{ kind: "away-expired" }, { kind: "run-now", job: "autonomous-report", ok: false }, { kind: "scan" }]);
  });
  it("a run-now answering 500 at night: the scan goes on and claims", async () => {
    writeAway(dir, { away: true, since: "", until: new Date(NIGHT.getTime() - 60_000).toISOString(), endedAt: null });
    tracker.add({ id: "t1", key: "DGS-1" });
    const r = await runScan(mk({ nexus: { baseUrl: "http://fake", tokenFile: join(root, "token"), fetch: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch } }));
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-1" });
    expect(readAway(dir)?.away).toBe(false);
    expect(events()).toMatchObject([{ kind: "away-expired" }, { kind: "run-now", ok: false, status: 500 }, { kind: "claim" }, { kind: "scan" }]);
  });
  it("night window with away false: works", async () => {
    writeAway(dir, { away: false, since: "", until: null, endedAt: DAY.toISOString() });
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("claimed");
  });
});

describe("runScan: the tick and the journal", () => {
  const held = () => acquireLock(dir, { ticket: "DGS-9", taskId: "t9", claimedAt: "", claimedAtUtc7: "", order: "", scanId: "x" });
  it("a lock and a tick, daytime and not away: tick once, busy, no tracker call, action in the event", async () => {
    now = DAY;
    tracker.add({ id: "t1" });
    held();
    let calls = 0;
    const tick = async (): Promise<TickResult> => { calls++; return { outcome: "ticked", action: { kind: "wait", reason: "x" }, notes: [] }; };
    const r = await runScan(mk({ tick }));
    expect(r.outcome).toBe("busy");
    expect(calls).toBe(1);
    expect(tracker.calls).toEqual([]);
    expect(events()).toMatchObject([{ kind: "busy", ticket: "DGS-9", action: "wait" }]);
  });
  it("a tick that throws: still busy, action tick-failed", async () => {
    now = DAY;
    held();
    const r = await runScan(mk({ tick: async () => { throw new Error("boom"); } }));
    expect(r.outcome).toBe("busy");
    expect(events()).toMatchObject([{ kind: "busy", ticket: "DGS-9", action: "tick-failed", error: "boom" }]);
  });
  it("the tick error is one line, cut to 200 chars", async () => {
    now = DAY;
    held();
    await runScan(mk({ tick: async () => { throw new Error(`a\nb ${"x".repeat(500)}`); } }));
    const err = (events()[0] as { error: string }).error;
    expect(err).not.toContain("\n");
    expect(err.length).toBe(200);
  });
  it("a settle that throws in the failed-claim path still clears the lock and reverts the status", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    execImpl = async () => { rmSync(journalPath(dir), { force: true }); mkdirSync(journalPath(dir)); return { code: 1, stderr: "no" }; };
    const r = await runScan(mk());
    expect(r.outcome).toBe("claim-failed");
    expect(readLock(dir)).toBeNull();
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
  });
  it("the lock is held at claim time: the claim key settles retryable busy, no second claim", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    const orig = tracker.listByStatus.bind(tracker);
    tracker.listByStatus = async (n) => { const r = await orig(n); held(); return r; };
    const r = await runScan(mk());
    expect(r.outcome).toBe("busy");
    const settled = readJournal(dir).filter((l) => l.status === "settled");
    expect(settled).toMatchObject([{ key: "DGS-1:claimed:1:claim", result: "retryable", note: "busy" }]);
    expect(readJournal(dir).filter((l) => l.status === "planned")).toHaveLength(1);
    expect(tracker.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
    expect(execCalls).toEqual([]);
  });
  it("no lock in the daytime: the tick is not called and the scan goes on", async () => {
    now = DAY;
    let calls = 0;
    const r = await runScan(mk({ tick: async () => { calls++; return { outcome: "no-lock", notes: [] }; } }));
    expect(r.outcome).toBe("none");
    expect(calls).toBe(0);
    expect(tracker.calls).toEqual(["hasStatus claimed", "listByStatus to do"]);
  });
  it("a dry run never calls the tick", async () => {
    held();
    let calls = 0;
    await runScan(mk({ dryRun: true, tick: async () => { calls++; return { outcome: "no-lock", notes: [] }; } }));
    expect(calls).toBe(0);
  });
  it("a claim writes the phase lock and a succeeded claim pair", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    await runScan(mk());
    expect(readLock(dir)).toMatchObject({ ticket: "DGS-1", phase: "claimed", attempt: 1, runs: { builder: null }, phaseStartedAt: NIGHT.toISOString() });
    expect(readJournal(dir).map((l) => [l.key, l.status, l.result])).toEqual([
      ["DGS-1:claimed:1:claim", "planned", undefined], ["DGS-1:claimed:1:claim", "settled", "succeeded"],
    ]);
  });
  it("a failed claim settles the claim key permanent, and a later claim of the same ticket does not throw", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    tracker.readBackWrong = true;
    const r = await runScan(mk());
    expect(r.outcome).toBe("claim-failed");
    expect(resultsOf(dir)["DGS-1:claimed:1:claim"]).toBe("permanent");
    tracker.readBackWrong = false;
    const r2 = await runScan(mk());
    expect(r2.outcome).toBe("claimed");
    expect(readLock(dir)?.ticket).toBe("DGS-1");
  });
});

describe("runScan: the builder limit (DGS-665)", () => {
  it("a full limit: busy with reason builder-limit, no claim, no tracker call", async () => {
    tracker.add({ id: "t1", status: "to do", key: "DGS-1" });
    const r = await runScan(mk({ builderFull: () => "limit: builder 2 of 2 in use: a (DGS-5, last event 1 min ago), b (DGS-6, last event 2 min ago). Wait for one to finish." }));
    expect(r).toMatchObject({ outcome: "busy", candidates: 0 });
    expect(tracker.calls).toEqual([]);
    expect(readLock(dir)).toBeNull();
    expect(events().map((e) => e.kind)).toEqual(["busy"]);
    expect(events()[0]).toMatchObject({ ticket: "?", reason: "builder-limit" });
    expect(orders()).toEqual([]);
    expect(readOpen(dir)).toEqual([]);
  });
  it("a free slot claims as before", async () => {
    tracker.add({ id: "t1", status: "to do", key: "DGS-1" });
    const r = await runScan(mk({ builderFull: () => null }));
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-1" });
  });
  it("a held lock still returns busy first, with the lock's ticket and no builder-limit reason", async () => {
    acquireLock(dir, { ticket: "DGS-9", taskId: "t9", claimedAt: NIGHT.toISOString(), claimedAtUtc7: "", order: "", scanId: "s" });
    let called = false;
    const r = await runScan(mk({ builderFull: () => { called = true; return "limit: x"; } }));
    expect(r.outcome).toBe("busy");
    expect(called).toBe(false);
    expect(events()[0]).toMatchObject({ ticket: "DGS-9" });
    expect(events()[0]).not.toHaveProperty("reason");
  });
  it("a throw inside builderFull never stops the scan", async () => {
    tracker.add({ id: "t1", status: "to do", key: "DGS-1" });
    const r = await runScan(mk({ builderFull: () => { throw new Error("boom"); } }));
    expect(r.outcome).toBe("claimed");
  });
  it("a dry run does not look at the limit", async () => {
    tracker.add({ id: "t1", status: "to do", key: "DGS-1" });
    let called = false;
    await runScan(mk({ dryRun: true, builderFull: () => { called = true; return "limit: x"; } }));
    expect(called).toBe(false);
  });
});

describe("runScan: walk and claim", () => {
  it("empty to do: none, one scan event, no tracker writes", async () => {
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "none", candidates: 0, skipped: [] });
    expect(kinds()).toEqual(["scan"]);
    expect(tracker.writeCalls()).toEqual([]);
  });
  it("only to do is scanned: a ticket in another status is never claimed", async () => {
    tracker.add({ id: "t1", status: "ready", priority: 1 });
    tracker.add({ id: "t3", status: "in progress", priority: 1 });
    tracker.add({ id: "t2", status: "to do", priority: 4 });
    const r = await runScan(mk());
    expect(r.claimed).toBe("T2");
    expect(tracker.tasks.get("t1")?.status).toBe("ready");
    expect(tracker.tasks.get("t3")?.status).toBe("in progress");
    expect(tracker.writeCalls().filter((c) => c.includes("t1") || c.includes("t3"))).toEqual([]);
  });
  it("a to do ticket with Mode Manual is skipped (mode): no comment, no event, not a candidate", async () => {
    tracker.add({ id: "t1", mode: "Manual" });
    const r = await runScan(mk());
    await runScan(mk());
    expect(r).toMatchObject({ outcome: "none", candidates: 0, skipped: [{ key: "T1", reason: "mode" }] });
    expect(tracker.comments).toEqual([]);
    expect(kinds()).toEqual(["scan", "scan"]);
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(tracker.writeCalls()).toEqual([]);
  });
  it("a to do ticket with no Mode is claimed (empty Mode is Autonomous)", async () => {
    tracker.add({ id: "t1", mode: null });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "T1", candidates: 1, skipped: [] });
    expect(tracker.comments).toEqual([]);
  });
  it("a to do ticket with no Sign-off and no milestone is claimed with Sign-off Auto", async () => {
    tracker.add({ id: "t1", key: "DGS-1", signOff: null, milestone: null });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-1", skipped: [] });
    expect(orderText()).toContain("Sign-off: Auto");
    expect(orderText()).not.toContain("## Sign-off: Jack");
  });
  it("an explicit Sign-off Jack is claimed and its order stops at acceptance", async () => {
    tracker.add({ id: "t1", key: "DGS-1", signOff: "Jack" });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-1" });
    expect(orderText()).toContain("## Sign-off: Jack");
  });
  it("a Manual ticket ranked first does not stop the Autonomous one; only Autonomous counts as a candidate", async () => {
    tracker.add({ id: "t1", key: "DGS-1", priority: 1, mode: "Manual" });
    tracker.add({ id: "t2", key: "DGS-2", priority: 4 });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-2", candidates: 1, skipped: [{ key: "DGS-1", reason: "mode" }] });
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(kinds()).toEqual(["claim", "scan"]);
  });
  it("two ready tickets: only one is claimed", async () => {
    now = NOON;
    tracker.add({ id: "t1", key: "DGS-1" });
    tracker.add({ id: "t2", key: "DGS-2" });
    const r = await runScan(mk());
    expect(r.outcome).toBe("claimed");
    expect(tracker.calls.filter((c) => c.startsWith("setStatus"))).toHaveLength(1);
    expect([...tracker.tasks.values()].map((t) => t.status).sort()).toEqual(["claimed", "to do"]);
    expect(orders()).toHaveLength(1);
    expect(execCalls).toHaveLength(1);
  });
  it("a to do ticket: claimed, lock, order file, one herdr-ws call", async () => {
    tracker.add({ id: "t1", key: "DGS-1", name: "One" });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-1", candidates: 1 });
    expect(tracker.tasks.get("t1")?.status).toBe("claimed");
    const lock = readLock(dir);
    expect(lock).toMatchObject({ ticket: "DGS-1", taskId: "t1", scanId: "scan-1", claimedAt: NIGHT.toISOString() });
    const file = join(ordersDir, "order-ao-2026-10-21-0000-DGS-1.md");
    expect(lock?.order).toBe(file);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf-8")).toContain("build DGS-1");
    expect(execCalls).toEqual([{ file: HERDR, args: ["agent", "prompt", "digismith-conductor", `Autonomous order: build DGS-1, read ${file}`] }]);
    expect(kinds()).toEqual(["claim", "scan"]);
    expect(events()[1]).toMatchObject({ candidates: 1, skipped: 0, claimed: "DGS-1" });
  });
  it("ranking: the higher priority is claimed, the other stays to do", async () => {
    tracker.add({ id: "t1", key: "DGS-1", priority: 3 });
    tracker.add({ id: "t2", key: "DGS-2", priority: 1 });
    const r = await runScan(mk());
    expect(r.claimed).toBe("DGS-2");
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
  });
  it("first fails Definition of Ready, second ready: one comment on the first, second claimed", async () => {
    tracker.add({ id: "t1", key: "DGS-1", priority: 1, attachments: [] });
    tracker.add({ id: "t2", key: "DGS-2", priority: 2 });
    const r = await runScan(mk());
    expect(r.claimed).toBe("DGS-2");
    expect(r.skipped).toEqual([{ key: "DGS-1", reason: "no spec and plan on the ticket (an attachment named design.* or spec.* and one named plan.*, or a linked board folder with design.* and plan.md on main)" }]);
    expect(tracker.comments).toHaveLength(1);
    expect(tracker.comments[0].ref).toBe("t1");
    expect(tracker.comments[0].text).toBe("Autonomous scan skipped this ticket (2026-10-21 00:00:00 UTC+7): no spec and plan on the ticket (an attachment named design.* or spec.* and one named plan.*, or a linked board folder with design.* and plan.md on main). It stays in to do. Fix and it is picked up on a later scan.");
    expect(kinds()).toEqual(["skip", "claim", "scan"]);
  });
  it("a scan while a lock exists: busy, nothing changes", async () => {
    tracker.add({ id: "t1" });
    acquireLock(dir, { ticket: "DGS-9", taskId: "t9", claimedAt: "", claimedAtUtc7: "", order: "", scanId: "x" });
    const r = await runScan(mk());
    expect(r.outcome).toBe("busy");
    expect(tracker.calls).toEqual([]);
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(events()).toMatchObject([{ kind: "busy", ticket: "DGS-9" }]);
    expect(orders()).toEqual([]);
  });
  it("the same failing ticket twice: one comment; a changed reason set: a second", async () => {
    const t = tracker.add({ id: "t1", key: "DGS-1", attachments: [] });
    await runScan(mk());
    await runScan(mk());
    expect(tracker.comments).toHaveLength(1);
    t.blockers = [{ key: "DGS-9", done: false }];
    await runScan(mk());
    expect(tracker.comments).toHaveLength(2);
    expect(tracker.comments[1].text).toContain("blocked by open ticket(s): DGS-9");
    expect(kinds().filter((k) => k === "skip")).toHaveLength(3);
  });
  it("readBackWrong: lock gone, back to to do, claim-failed", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    tracker.readBackWrong = true;
    const r = await runScan(mk());
    expect(r.outcome).toBe("claim-failed");
    expect(readLock(dir)).toBeNull();
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(tracker.calls).toEqual(["hasStatus claimed", "listByStatus to do", "setStatus t1 claimed", "getStatus t1", "setStatus t1 to do"]);
    expect(kinds()).toEqual(["claim-failed", "scan"]);
    expect(events()[0]).toMatchObject({ ticket: "DGS-1" });
  });
  it("exec rejecting: lock gone, back to to do, claim-failed", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    execImpl = async () => { throw new Error("herdr down"); };
    const r = await runScan(mk());
    expect(r.outcome).toBe("claim-failed");
    expect(readLock(dir)).toBeNull();
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(events()[0]).toMatchObject({ kind: "claim-failed", ticket: "DGS-1", error: "herdr down" });
    expect(orders()).toEqual([]);
    execImpl = async () => ({ code: 0, stderr: "" });
    const r2 = await runScan(mk());
    expect(r2).toMatchObject({ outcome: "claimed", claimed: "DGS-1" });
    expect(orders()).toEqual(["order-ao-2026-10-21-0000-DGS-1.md"]);
  });
  it("a claim failure never removes an order file it did not create", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    mkdirSync(ordersDir, { recursive: true });
    writeFileSync(join(ordersDir, "order-ao-2026-10-21-0000-DGS-1.md"), "someone else's\n");
    const r = await runScan(mk());
    expect(r.outcome).toBe("claim-failed");
    expect(readFileSync(join(ordersDir, "order-ao-2026-10-21-0000-DGS-1.md"), "utf-8")).toBe("someone else's\n");
  });
  it("failSetStatus: claim-failed, the revert failure is swallowed", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    tracker.failSetStatus = true;
    const r = await runScan(mk());
    expect(r.outcome).toBe("claim-failed");
    expect(readLock(dir)).toBeNull();
    expect(execCalls).toEqual([]);
    expect(tracker.calls).toContain("setStatus t1 to do");
    expect(events()).toMatchObject([{ kind: "claim-failed", ticket: "DGS-1", error: "setStatus failed" }, { kind: "scan" }]);
  });
  it("Epic, Initiative, Spike: skipped with reason type, no comment", async () => {
    tracker.add({ id: "e", key: "DGS-E", typeId: 1, milestone: null });
    tracker.add({ id: "i", key: "DGS-I", typeId: 2, milestone: null });
    tracker.add({ id: "s", key: "DGS-S", typeId: 1023, milestone: null });
    tracker.add({ id: "b", key: "DGS-B", typeId: TYPE_BUG });
    const r = await runScan(mk());
    expect(r.skipped).toEqual([
      { key: "DGS-E", reason: "type" }, { key: "DGS-I", reason: "type" }, { key: "DGS-S", reason: "type" },
    ]);
    expect(r).toMatchObject({ claimed: "DGS-B", candidates: 1 });
    expect(tracker.comments).toEqual([]);
  });
  it("hasStatus false: no-starter-status, one DGS-548 comment across two scans", async () => {
    tracker.statuses.delete("claimed");
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("no-starter-status");
    expect((await runScan(mk())).outcome).toBe("no-starter-status");
    expect(tracker.comments.map((c) => c.ref)).toEqual(["DGS-548"]);
    expect(tracker.comments[0].text).toContain('the status "claimed" is missing');
    expect(tracker.calls).not.toContain("listByStatus to do");
    expect(tracker.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
    expect(readLock(dir)).toBeNull();
    expect(kinds().filter((k) => k === "no-starter-status")).toHaveLength(2);
  });
  it("a missing claimed status opens the attention item once, and the next clean scan closes it", async () => {
    tracker.statuses.delete("claimed");
    tracker.add({ id: "t1" });
    await runScan(mk());
    await runScan(mk());
    expect(readOpen(dir).map((i) => ({ ticket: i.ticket, run: i.run, kind: i.kind, cause: i.cause })))
      .toEqual([{ ticket: null, run: "starter-status", kind: "failed", cause: "claimed-status-missing" }]);
    tracker.statuses.add("claimed");
    expect((await runScan(mk())).outcome).toBe("claimed");
    expect(readOpen(dir)).toEqual([]);
  });
  it("a missing claimed status in a dry run writes no attention item", async () => {
    tracker.statuses.delete("claimed");
    const r = await runScan(mk({ dryRun: true }));
    expect(r.outcome).toBe("no-starter-status");
    expect(existsSync(dir)).toBe(false);
  });
  it("two scans at once: one claimed, one busy, one order file", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    tracker.add({ id: "t2", key: "DGS-2" });
    const rs = await Promise.all([runScan(mk({ scanId: "a" })), runScan(mk({ scanId: "b" }))]);
    expect(rs.map((r) => r.outcome).sort()).toEqual(["busy", "claimed"]);
    expect(orders()).toHaveLength(1);
    expect(execCalls).toHaveLength(1);
  });
  it("dry run in the daytime: no writes, no files, verdicts filled", async () => {
    now = DAY;
    tracker.add({ id: "t1", key: "DGS-1", priority: 1, blockers: [{ key: "DGS-9", done: false }] });
    tracker.add({ id: "t2", key: "DGS-2", priority: 2 });
    tracker.add({ id: "e", key: "DGS-E", typeId: 1 });
    tracker.add({ id: "m", key: "DGS-M", mode: "Manual" });
    const r = await runScan(mk({ dryRun: true }));
    expect(r.outcome).toBe("none");
    expect(r.verdicts).toEqual([{ key: "DGS-M", reasons: [REASON.mode] }, { key: "DGS-1", reasons: ["blocked by open ticket(s): DGS-9"] }, { key: "DGS-2", reasons: [] }]);
    expect(r.skipped).toEqual([{ key: "DGS-E", reason: "type" }, { key: "DGS-M", reason: "mode" }]);
    expect(r.candidates).toBe(2);
    expect(tracker.writeCalls()).toEqual([]);
    expect(existsSync(dir)).toBe(false);
    expect(orders()).toEqual([]);
    expect(execCalls).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });
});

describe("runScan: the breaker", () => {
  const openBreaker = async () => {
    const { recordRelease } = await import("./breaker.ts");
    recordRelease(dir, { ticket: "DGS-1", result: "failed" }, now);
    recordRelease(dir, { ticket: "DGS-2", result: "failed" }, now);
  };
  it("an open breaker: outcome breaker, no tracker call, no lock, no order, one breaker event", async () => {
    await openBreaker();
    tracker.add({ id: "t1" });
    const r = await runScan(mk());
    expect(r.outcome).toBe("breaker");
    expect(tracker.calls).toEqual([]);
    expect(readLock(dir)).toBeNull();
    expect(orders()).toEqual([]);
    expect(kinds().filter((k) => k === "breaker")).toHaveLength(1);
  });
  it("a malformed breaker.json gives breaker and one attention item, once", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "breaker.json"), "{nope");
    const { readOpen } = await import("./attention.ts");
    expect((await runScan(mk())).outcome).toBe("breaker");
    expect((await runScan(mk())).outcome).toBe("breaker");
    expect(tracker.calls).toEqual([]);
    const items = readOpen(dir);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "unknown", run: "breaker", ticket: null });
    expect(items[0].cause).toMatch(/^breaker-file-unreadable: .*does not parse/);
  });
  it("an open breaker from a real streak writes no attention item", async () => {
    await openBreaker();
    const { readOpen } = await import("./attention.ts");
    await runScan(mk());
    expect(readOpen(dir)).toEqual([]);
  });
  it("noon, not away: an open breaker still stops it", async () => {
    await openBreaker();
    now = NOON;
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("breaker");
    expect(tracker.calls).toEqual([]);
    expect(readLock(dir)).toBeNull();
  });
  it("noon, not away: a held lock still returns busy", async () => {
    now = NOON;
    tracker.add({ id: "t1" });
    acquireLock(dir, { ticket: "DGS-9", taskId: "t9", claimedAt: "", claimedAtUtc7: "", order: "", scanId: "x" });
    expect((await runScan(mk())).outcome).toBe("busy");
    expect(tracker.calls).toEqual([]);
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
  });
  it("an expired away window does not close the breaker: next scan still breaker, claims nothing", async () => {
    await openBreaker();
    const { readBreaker } = await import("./breaker.ts");
    writeAway(dir, { away: true, since: new Date(NIGHT.getTime() - 7200_000).toISOString(), until: new Date(NIGHT.getTime() - 3600_000).toISOString(), endedAt: null });
    tracker.add({ id: "t1" });
    const r = await runScan(mk());
    expect(r.outcome).toBe("breaker");
    expect(readBreaker(dir).open).toBe(true);
    expect(tracker.calls).toEqual([]);
    expect(readLock(dir)).toBeNull();
    expect(kinds()).toContain("away-expired");
  });
  it("a dry run ignores the breaker and writes nothing", async () => {
    await openBreaker();
    tracker.add({ id: "t1" });
    const r = await runScan(mk({ dryRun: true }));
    expect(r.outcome).not.toBe("breaker");
    expect(readLock(dir)).toBeNull();
    expect(kinds()).not.toContain("breaker");
  });
});

describe("runScan: the conductor workspace", () => {
  const breakFile = () => writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { tab: 1 } }));
  const fixFile = () => writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { tab: 1, workspace: "w2" } }));

  it("a missing workspace: conductor-config, attention item, event, no lock, no tracker call", async () => {
    tracker.add({ id: "t1" });
    breakFile();
    const callsBefore = tracker.calls.length;
    const r = await runScan(mk());
    expect(r.outcome).toBe("conductor-config");
    expect(readOpen(dir).map((i) => ({ ticket: i.ticket, run: i.run, kind: i.kind, cause: i.cause }))).toEqual([{ ticket: null, run: "conductor", kind: "failed", cause: "conductor-workspace-missing" }]);
    expect(kinds()).toContain("conductor-config");
    expect(readLock(dir)).toBeNull();
    expect(tracker.calls.length).toBe(callsBefore);
    expect(tracker.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
  });
  it("bad JSON: same outcome and event, cause conductor-config-unreadable, and a fixed file resolves it", async () => {
    tracker.add({ id: "t1" });
    writeFileSync(conductorsJson, "{ nope");
    const r = await runScan(mk());
    expect(r.outcome).toBe("conductor-config");
    expect(readOpen(dir).map((i) => ({ run: i.run, cause: i.cause }))).toEqual([{ run: "conductor", cause: "conductor-config-unreadable" }]);
    expect(kinds()).toContain("conductor-config");
    fixFile();
    expect((await runScan(mk())).outcome).toBe("claimed");
    expect(readOpen(dir)).toEqual([]);
  });
  it("dry run: no attention item, no event", async () => {
    tracker.add({ id: "t1" });
    breakFile();
    const r = await runScan(mk({ dryRun: true }));
    expect(readOpen(dir)).toEqual([]);
    expect(kinds()).not.toContain("conductor-config");
    expect(r.verdicts?.some((v) => v.key === "-" && v.reasons[0]?.startsWith("conductor-config: no workspace for"))).toBe(true);
  });
  it("after the file is fixed the next scan resolves the item and claims", async () => {
    tracker.add({ id: "t1" });
    breakFile();
    await runScan(mk());
    expect(readOpen(dir)).toHaveLength(1);
    fixFile();
    const r = await runScan(mk());
    expect(r.outcome).toBe("claimed");
    expect(readOpen(dir)).toEqual([]);
  });
});

describe("runScan: the scan guard", () => {
  const guard = (over: Partial<ScanGuard> = {}): ScanGuard => ({ guardrailProblems: () => [], alreadyDone: () => null, ...over });

  it("guardrail problems: guardrail-config, no claim, no setStatus, attention item and event", async () => {
    tracker.add({ id: "t1" });
    const r = await runScan(mk({ guard: guard({ guardrailProblems: () => ["bad thing"] }) }));
    expect(r.outcome).toBe("guardrail-config");
    expect(tracker.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
    expect(readLock(dir)).toBeNull();
    expect(readOpen(dir).map((i) => ({ run: i.run, kind: i.kind, cause: i.cause }))).toEqual([{ run: "guardrails", kind: "failed", cause: "bad-guardrail-config" }]);
    expect(kinds()).toContain("guardrail-config");
  });
  it("the guardrail item has its own key: an open bad-budget-config item does not hide it, and a clean scan closes only the guardrail one", async () => {
    tracker.add({ id: "t1" });
    appendAttention(dir, new Date(), { ticket: null, run: "-", kind: "failed", cause: "bad-budget-config" });
    let bad = true;
    const g = guard({ guardrailProblems: () => (bad ? ["bad thing"] : []) });
    await runScan(mk({ guard: g }));
    expect(readOpen(dir).map((i) => i.cause).sort()).toEqual(["bad-budget-config", "bad-guardrail-config"]);
    bad = false;
    await runScan(mk({ guard: g }));
    expect(readOpen(dir).map((i) => i.cause)).toEqual(["bad-budget-config"]);
  });
  it("a clean second scan closes the item and claims", async () => {
    tracker.add({ id: "t1" });
    let bad = true;
    const g = guard({ guardrailProblems: () => (bad ? ["bad thing"] : []) });
    await runScan(mk({ guard: g }));
    expect(readOpen(dir)).toHaveLength(1);
    bad = false;
    const r = await runScan(mk({ guard: g }));
    expect(r.outcome).toBe("claimed");
    expect(readOpen(dir)).toEqual([]);
  });
  it("alreadyDone reason skips that ticket, writes a skip event and claims the next", async () => {
    tracker.add({ id: "t1", priority: 1 });
    tracker.add({ id: "t2", priority: 3 });
    const r = await runScan(mk({ guard: guard({ alreadyDone: (t) => (t.id === "t1" ? { reason: "blocker-not-on-main: DGS-9" } : null) }) }));
    expect(r.outcome).toBe("claimed");
    expect(r.claimed).toBe("T2");
    expect(r.skipped).toEqual([{ key: "T1", reason: "blocker-not-on-main: DGS-9" }]);
    expect(kinds()).toContain("skip");
  });
  it("the attention field opens an already-merged-but-open item", async () => {
    tracker.add({ id: "t1" });
    const r = await runScan(mk({ guard: guard({ alreadyDone: () => ({ reason: "already-merged: abc", attention: "already-merged-but-open" }) }) }));
    expect(r.outcome).toBe("none");
    expect(readOpen(dir).map((i) => ({ run: i.run, kind: i.kind, cause: i.cause }))).toEqual([{ run: "T1/already-merged", kind: "unknown", cause: "already-merged-but-open" }]);
  });
  it("an unrelated open unknown item for the key does not drop the already-merged item", async () => {
    tracker.add({ id: "t1" });
    appendAttention(dir, now, { ticket: "T1", run: "T1", kind: "unknown", cause: "other" });
    await runScan(mk({ guard: guard({ alreadyDone: () => ({ reason: "already-merged: abc", attention: "already-merged-but-open" }) }) }));
    expect(readOpen(dir).map((i) => i.cause).sort()).toEqual(["already-merged-but-open", "other"]);
  });
  it("dry run lists the reason and the guardrail problem and writes nothing", async () => {
    tracker.add({ id: "t1" });
    const r = await runScan(mk({ dryRun: true, guard: guard({ guardrailProblems: () => ["bad thing"], alreadyDone: () => ({ reason: "already-merged: abc", attention: "already-merged-but-open" }) }) }));
    expect(r.verdicts).toEqual([{ key: "-", reasons: ["guardrail-config: bad thing"] }, { key: "T1", reasons: ["already-merged: abc"] }]);
    expect(existsSync(dir)).toBe(false);
  });
  it("without a guard the scan behaves as before", async () => {
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("claimed");
  });
});
