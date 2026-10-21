import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAway, writeAway } from "./away.ts";
import type { Exec } from "./conductor.ts";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { TYPE_BUG } from "./ready.ts";
import { runScan, type ScanDeps } from "./scan.ts";
import { acquireLock, readEvents, readLock } from "./state.ts";

const NIGHT = new Date("2026-10-20T17:00:00.000Z"); // 00:00 UTC+7
const DAY = new Date("2026-10-21T03:00:00.000Z"); // 10:00 UTC+7
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
const orders = () => (existsSync(ordersDir) ? readdirSync(ordersDir) : []);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "auto-scan-"));
  dir = join(root, "autonomous");
  ordersDir = join(root, "orders");
  conductorsJson = join(root, "conductors.json");
  writeFileSync(conductorsJson, JSON.stringify({ "DigiSmith/digismith-conductor": { tab: 1 } }));
  writeFileSync(join(root, "token"), "tok\n");
  tracker = new FakeTracker();
  execCalls = [];
  execImpl = async () => ({ code: 0, stderr: "" });
  fetchCalls = [];
  now = NIGHT;
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("runScan: the work rule", () => {
  it("daytime and not away: off, no tracker call, no lock, one off event", async () => {
    now = DAY;
    tracker.add({ id: "t1" });
    const r = await runScan(mk());
    expect(r.outcome).toBe("off");
    expect(tracker.calls).toEqual([]);
    expect(readLock(dir)).toBeNull();
    expect(kinds()).toEqual(["off"]);
  });
  it("daytime, away with no until: claims a ready ticket", async () => {
    now = DAY;
    writeAway(dir, { away: true, since: DAY.toISOString(), until: null, endedAt: null });
    tracker.add({ id: "t1" });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "T1" });
  });
  it("daytime, away until in the future: works", async () => {
    now = DAY;
    writeAway(dir, { away: true, since: DAY.toISOString(), until: new Date(DAY.getTime() + 3600_000).toISOString(), endedAt: null });
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("claimed");
  });
  it("daytime, away until in the past: runBack runs once and the scan is off", async () => {
    now = DAY;
    writeAway(dir, { away: true, since: "2026-10-21T00:00:00.000Z", until: new Date(DAY.getTime() - 60_000).toISOString(), endedAt: null });
    tracker.add({ id: "t1" });
    const r = await runScan(mk());
    expect(r.outcome).toBe("off");
    expect(readAway(dir)?.away).toBe(false);
    expect(kinds()).toEqual(["away-expired", "run-now", "off"]);
    expect(fetchCalls).toEqual(["http://fake/api/v1/jobs/autonomous-report/run"]);
    expect(tracker.calls).toEqual([]);
  });
  it("a failing runBack never stops the scan", async () => {
    now = DAY;
    writeAway(dir, { away: true, since: "", until: new Date(DAY.getTime() - 60_000).toISOString(), endedAt: null });
    const r = await runScan(mk({ nexus: { baseUrl: "http://fake", tokenFile: join(root, "token"), fetch: (async () => { throw new Error("x"); }) as unknown as typeof fetch } }));
    expect(r.outcome).toBe("off");
  });
  it("night window with away false: works", async () => {
    writeAway(dir, { away: false, since: "", until: null, endedAt: DAY.toISOString() });
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("claimed");
  });
});

describe("runScan: walk and claim", () => {
  it("empty to do: none, one scan event, no tracker writes", async () => {
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "none", candidates: 0, skipped: [] });
    expect(kinds()).toEqual(["scan"]);
    expect(tracker.writeCalls()).toEqual([]);
  });
  it("a ready ticket: in progress, lock, order file, one herdr-ws call", async () => {
    tracker.add({ id: "t1", key: "DGS-1", name: "One" });
    const r = await runScan(mk());
    expect(r).toMatchObject({ outcome: "claimed", claimed: "DGS-1", candidates: 1 });
    expect(tracker.tasks.get("t1")?.status).toBe("in progress");
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
    tracker.add({ id: "t1", key: "DGS-1", priority: 1, milestone: null });
    tracker.add({ id: "t2", key: "DGS-2", priority: 2 });
    const r = await runScan(mk());
    expect(r.claimed).toBe("DGS-2");
    expect(r.skipped).toEqual([{ key: "DGS-1", reason: "no milestone" }]);
    expect(tracker.comments).toHaveLength(1);
    expect(tracker.comments[0].ref).toBe("t1");
    expect(tracker.comments[0].text).toBe("Autonomous scan skipped this ticket (2026-10-21 00:00:00 UTC+7): no milestone. It stays in to do. Fix and it is picked up on a later scan.");
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
    const t = tracker.add({ id: "t1", key: "DGS-1", milestone: null });
    await runScan(mk());
    await runScan(mk());
    expect(tracker.comments).toHaveLength(1);
    t.signOff = null;
    await runScan(mk());
    expect(tracker.comments).toHaveLength(2);
    expect(tracker.comments[1].text).toContain("no Sign-off mark (Auto or Jack); no milestone");
    expect(kinds().filter((k) => k === "skip")).toHaveLength(3);
  });
  it("readBackWrong: lock gone, back to to do, claim-failed", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    tracker.readBackWrong = true;
    const r = await runScan(mk());
    expect(r.outcome).toBe("claim-failed");
    expect(readLock(dir)).toBeNull();
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(tracker.calls).toContain("setStatus t1 to do");
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
  });
  it("failSetStatus: claim-failed, the revert failure is swallowed", async () => {
    tracker.add({ id: "t1", key: "DGS-1" });
    tracker.failSetStatus = true;
    const r = await runScan(mk());
    expect(r.outcome).toBe("claim-failed");
    expect(readLock(dir)).toBeNull();
    expect(execCalls).toEqual([]);
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
    tracker.statuses.delete("to do");
    tracker.add({ id: "t1" });
    expect((await runScan(mk())).outcome).toBe("no-starter-status");
    expect((await runScan(mk())).outcome).toBe("no-starter-status");
    expect(tracker.comments.map((c) => c.ref)).toEqual(["DGS-548"]);
    expect(tracker.calls).not.toContain("listToDo");
    expect(kinds().filter((k) => k === "no-starter-status")).toHaveLength(2);
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
    tracker.add({ id: "t1", key: "DGS-1", priority: 1, milestone: null });
    tracker.add({ id: "t2", key: "DGS-2", priority: 2 });
    tracker.add({ id: "e", key: "DGS-E", typeId: 1 });
    const r = await runScan(mk({ dryRun: true }));
    expect(r.outcome).toBe("none");
    expect(r.verdicts).toEqual([{ key: "DGS-1", reasons: ["no milestone"] }, { key: "DGS-2", reasons: [] }]);
    expect(tracker.writeCalls()).toEqual([]);
    expect(existsSync(dir)).toBe(false);
    expect(orders()).toEqual([]);
    expect(execCalls).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });
});
