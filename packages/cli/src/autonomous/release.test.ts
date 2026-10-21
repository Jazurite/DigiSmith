import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { runRelease, type ReleaseDeps } from "./release.ts";
import { acquireLock, readEvents, readLock } from "./state.ts";

const CLAIMED = new Date("2026-10-20T17:00:00.000Z");
const NOW = new Date("2026-10-20T17:30:00.000Z");

let root: string;
let dir: string;
let tracker: FakeTracker;
let fetchCalls: string[];
let status: number;

const mk = (over: Partial<ReleaseDeps> = {}): ReleaseDeps => ({
  tracker, dir, now: () => NOW,
  nexus: {
    baseUrl: "http://fake",
    tokenFile: join(root, "token"),
    fetch: (async (url: string) => { fetchCalls.push(url); return new Response("{}", { status }); }) as unknown as typeof fetch,
  },
  ...over,
});
const lock = (ticket = "DGS-1") => ({ ticket, taskId: "t1", claimedAt: CLAIMED.toISOString(), claimedAtUtc7: "2026-10-21 00:00:00", order: "o.md", scanId: "s1" });
const events = () => readEvents(dir, NOW.getTime() - 48 * 3600_000, NOW.getTime() + 1000);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "auto-release-"));
  dir = join(root, "autonomous");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, "token"), "tok\n");
  tracker = new FakeTracker();
  fetchCalls = [];
  status = 202;
});

describe("runRelease", () => {
  it("merged clears the lock, no comment, one release event, one run-now", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "merged", commit: "abc" });
    expect(r.lockCleared).toBe(true);
    expect(readLock(dir)).toBeNull();
    expect(tracker.comments).toHaveLength(0);
    const ev = events();
    expect(ev.filter((e) => e.kind === "release")).toHaveLength(1);
    expect(ev.find((e) => e.kind === "release")).toMatchObject({ ticket: "DGS-1", result: "merged", commit: "abc", minutes: 30 });
    expect(fetchCalls).toEqual(["http://fake/api/v1/jobs/autonomous-scan/run"]);
    expect(ev.find((e) => e.kind === "run-now")).toMatchObject({ job: "autonomous-scan", ok: true, status: 202 });
  });

  it("failed posts one comment with the reason", async () => {
    acquireLock(dir, lock());
    await runRelease(mk(), { ticket: "DGS-1", result: "failed", reason: "tests red" });
    expect(tracker.comments).toEqual([{ ref: "t1", text: "Autonomous Operation failed (2026-10-21 00:30:00): tests red" }]);
    expect(readLock(dir)).toBeNull();
  });

  it("a lock for another ticket throws and keeps the lock", async () => {
    acquireLock(dir, lock("DGS-2"));
    await expect(runRelease(mk(), { ticket: "DGS-1", result: "merged" })).rejects.toThrow("the lock belongs to DGS-2");
    expect(readLock(dir)?.ticket).toBe("DGS-2");
    expect(fetchCalls).toHaveLength(0);
  });

  it("no lock logs no-lock and still calls run-now", async () => {
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "stopped" });
    expect(r.lockCleared).toBe(false);
    expect(events().find((e) => e.kind === "release")).toMatchObject({ note: "no-lock", ticket: "DGS-1" });
    expect(fetchCalls).toHaveLength(1);
  });

  it("a run-now 409 returns ok false and does not throw", async () => {
    status = 409;
    acquireLock(dir, lock());
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "merged" });
    expect(r.runNow).toMatchObject({ ok: false, status: 409 });
    expect(events().find((e) => e.kind === "run-now")).toMatchObject({ ok: false, status: 409 });
  });

  it("a failing comment still clears the lock", async () => {
    acquireLock(dir, lock());
    tracker.comment = async (ref: string) => { tracker.calls.push(`comment ${ref}`); throw new Error("boom"); };
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "awaiting-jack", reason: "needs Jack" });
    expect(r.lockCleared).toBe(true);
    expect(readLock(dir)).toBeNull();
    expect(tracker.calls).toContain("comment t1");
    expect(events().filter((e) => e.kind === "comment-failed")).toHaveLength(1);
    expect(events().filter((e) => e.kind === "release")).toHaveLength(1);
  });

  it("a comment without a reason has no trailing colon", async () => {
    acquireLock(dir, lock());
    await runRelease(mk(), { ticket: "DGS-1", result: "stopped" });
    expect(tracker.comments[0].text).toBe("Autonomous Operation stopped (2026-10-21 00:30:00)");
  });

  it("an unwritable report does not skip run-now", async () => {
    acquireLock(dir, lock());
    mkdirSync(join(dir, "reports", "dir.md"), { recursive: true });
    utimesSync(join(dir, "reports", "dir.md"), new Date(CLAIMED.getTime() + 600_000), new Date(CLAIMED.getTime() + 600_000));
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "failed", reason: "x" });
    expect(r.lockCleared).toBe(true);
    expect(fetchCalls).toHaveLength(1);
  });

  it("a report newer than the claim gets the late release line and no comment", async () => {
    acquireLock(dir, lock());
    mkdirSync(join(dir, "reports"), { recursive: true });
    const old = join(dir, "reports", "a.md");
    const fresh = join(dir, "reports", "b.md");
    writeFileSync(old, "old\n");
    writeFileSync(fresh, "fresh\n");
    utimesSync(old, new Date(CLAIMED.getTime() - 3600_000), new Date(CLAIMED.getTime() - 3600_000));
    utimesSync(fresh, new Date(CLAIMED.getTime() + 600_000), new Date(CLAIMED.getTime() + 600_000));
    await runRelease(mk(), { ticket: "DGS-1", result: "failed", reason: "late" });
    expect(readFileSync(fresh, "utf-8")).toContain("late release: DGS-1 failed");
    expect(readFileSync(old, "utf-8")).not.toContain("late release");
    expect(tracker.comments).toHaveLength(0);
  });

  it("release by day while not away still clears the lock and calls run-now", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk({ now: () => new Date("2026-10-21T03:00:00.000Z") }), { ticket: "DGS-1", result: "merged" });
    expect(r.lockCleared).toBe(true);
    expect(fetchCalls).toHaveLength(1);
  });
});
