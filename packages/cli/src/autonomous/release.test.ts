import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { runRelease, type ReleaseDeps } from "./release.ts";
import { plan, readJournal, resultsOf } from "./journal.ts";
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

  it("a late failed release posts the ticket comment and appends the late line to the newest report", async () => {
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
    expect(tracker.comments).toEqual([{ ref: "t1", text: "Autonomous Operation failed (2026-10-21 00:30:00): late" }]);
  });

  it("a late stopped release posts the ticket comment and appends the late line", async () => {
    acquireLock(dir, lock());
    mkdirSync(join(dir, "reports"), { recursive: true });
    const fresh = join(dir, "reports", "b.md");
    writeFileSync(fresh, "fresh\n");
    utimesSync(fresh, new Date(CLAIMED.getTime() + 600_000), new Date(CLAIMED.getTime() + 600_000));
    await runRelease(mk(), { ticket: "DGS-1", result: "stopped", reason: "needs sudo" });
    expect(tracker.comments).toEqual([{ ref: "t1", text: "Autonomous Operation stopped (2026-10-21 00:30:00): needs sudo" }]);
    expect(readFileSync(fresh, "utf-8")).toContain("late release: DGS-1 stopped");
    expect(readLock(dir)).toBeNull();
  });

  it("a late merged release appends the late line and posts no comment", async () => {
    acquireLock(dir, lock());
    mkdirSync(join(dir, "reports"), { recursive: true });
    const fresh = join(dir, "reports", "b.md");
    writeFileSync(fresh, "fresh\n");
    utimesSync(fresh, new Date(CLAIMED.getTime() + 600_000), new Date(CLAIMED.getTime() + 600_000));
    await runRelease(mk(), { ticket: "DGS-1", result: "merged", commit: "abc" });
    expect(tracker.comments).toHaveLength(0);
    expect(readFileSync(fresh, "utf-8")).toContain("late release: DGS-1 merged");
  });

  it("a corrupt lock is cleared with --ticket ? and posts no comment", async () => {
    writeFileSync(join(dir, "lock.json"), "{not json");
    const r = await runRelease(mk(), { ticket: "?", result: "stopped", reason: "corrupt lock" });
    expect(r.lockCleared).toBe(true);
    expect(readLock(dir)).toBeNull();
    expect(tracker.comments).toHaveLength(0);
    expect(events().find((e) => e.kind === "release")).toMatchObject({ ticket: "?", result: "stopped" });
    expect(fetchCalls).toHaveLength(1);
  });

  it("a corrupt lock still refuses a real ticket key", async () => {
    writeFileSync(join(dir, "lock.json"), "{not json");
    await expect(runRelease(mk(), { ticket: "DGS-1", result: "stopped" })).rejects.toThrow("the lock belongs to ?");
    expect(readLock(dir)?.ticket).toBe("?");
  });

  it("--ticket ? does not clear a normal lock", async () => {
    acquireLock(dir, lock("DGS-2"));
    await expect(runRelease(mk(), { ticket: "?", result: "stopped" })).rejects.toThrow("the lock belongs to DGS-2");
    expect(readLock(dir)?.ticket).toBe("DGS-2");
  });

  it("release by day while not away still clears the lock and calls run-now", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk({ now: () => new Date("2026-10-21T03:00:00.000Z") }), { ticket: "DGS-1", result: "merged" });
    expect(r.lockCleared).toBe(true);
    expect(fetchCalls).toHaveLength(1);
  });

  it("merged writes a released pair and closes the ticket's other open keys", async () => {
    acquireLock(dir, { ...lock(), phase: "merge-ready", attempt: 2, runs: { builder: null } });
    plan(dir, CLAIMED, { ticket: "DGS-1", phase: "merge-ready", attempt: 2, action: "order-merge" });
    plan(dir, CLAIMED, { ticket: "DGS-2", phase: "building", attempt: 1, action: "x" });
    await runRelease(mk(), { ticket: "DGS-1", result: "merged" });
    const r = resultsOf(dir);
    expect(r["DGS-1:merge-ready:2:released"]).toBe("succeeded");
    expect(r["DGS-1:merge-ready:2:order-merge"]).toBe("permanent");
    expect(r["DGS-2:building:1:x"]).toBe("open");
    expect(readJournal(dir).find((l) => l.key === "DGS-1:merge-ready:2:order-merge" && l.status === "settled")?.note).toBe("released");
    expect(readJournal(dir).find((l) => l.key.endsWith(":released") && l.status === "settled")?.note).toBe("merged");
  });
  it("a second release with the key used does not throw and writes no second pair", async () => {
    acquireLock(dir, lock());
    await runRelease(mk(), { ticket: "DGS-1", result: "merged" });
    const n = readJournal(dir).length;
    acquireLock(dir, lock());
    await runRelease(mk(), { ticket: "DGS-1", result: "merged" });
    expect(readJournal(dir)).toHaveLength(n);
    expect(readLock(dir)).toBeNull();
  });
  it("a release with no lock changes no journal line", async () => {
    plan(dir, CLAIMED, { ticket: "DGS-1", phase: "building", attempt: 1, action: "x" });
    const before = readJournal(dir);
    await runRelease(mk(), { ticket: "DGS-1", result: "stopped" });
    expect(readJournal(dir)).toEqual(before);
  });
});

describe("runRelease: causes and the breaker", () => {
  const items = async () => (await import("./attention.ts")).readOpen(dir);
  const breaker = async () => (await import("./breaker.ts")).readBreaker(dir);

  it("failed with a durable cause: a failed item, not retry eligible, streak 1", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "failed", cause: "test-red" });
    expect(r).toMatchObject({ cause: "test-red", retryEligible: false, breakerOpened: false, warning: null });
    expect(await items()).toMatchObject([{ run: "DGS-1", ticket: "DGS-1", kind: "failed", cause: "test-red", causeClass: "durable", retryEligible: false }]);
    expect(tracker.comments).toHaveLength(1);
    expect((await breaker()).streak).toBe(1);
    expect(events().find((e) => e.kind === "release")).toMatchObject({ cause: "test-red" });
  });
  it("failed with a transient cause: retry eligible, streak still goes up, no journal", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "failed", cause: "gateway-5xx" });
    expect(r.retryEligible).toBe(true);
    expect(await items()).toMatchObject([{ causeClass: "transient", retryEligible: true }]);
    expect((await breaker()).streak).toBe(1);
    // DGS-486 release journals its own "released" step; a transient cause adds nothing else (no retry line)
    const keys = readJournal(dir).map((l) => l.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.endsWith(":released"))).toBe(true);
  });
  it("an unknown cause word is recorded as unknown with a warning", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "failed", cause: "weird" });
    expect(r.cause).toBe("unknown");
    expect(r.warning).toMatch(/weird/);
    expect(r.lockCleared).toBe(true);
    expect(r.retryEligible).toBe(false);
    expect(await items()).toMatchObject([{ kind: "unknown", cause: "unknown" }]);
  });
  it("failed with no cause is unknown and not retry eligible", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "failed" });
    expect(r.cause).toBe("unknown");
    expect(r.retryEligible).toBe(false);
  });
  it("kindOf: merge-refused and classifier-block refused, unknown unknown, the rest failed", async () => {
    const { kindOf } = await import("./release.ts");
    expect(kindOf("merge-refused")).toBe("refused");
    expect(kindOf("classifier-block")).toBe("refused");
    expect(kindOf("unknown")).toBe("unknown");
    for (const c of ["mandate-deny", "test-red", "review-rejected", "spec-gap", "gateway-5xx", "pane-died"]) expect(kindOf(c)).toBe("failed");
  });
  it("two failed releases open the breaker: one circuit-breaker-open item and a comment", async () => {
    acquireLock(dir, lock("DGS-1"));
    await runRelease(mk(), { ticket: "DGS-1", result: "failed", cause: "test-red" });
    acquireLock(dir, lock("DGS-2"));
    const r = await runRelease(mk(), { ticket: "DGS-2", result: "failed", cause: "test-red" });
    expect(r.breakerOpened).toBe(true);
    const cb = (await items()).filter((i) => i.cause === "circuit-breaker-open");
    expect(cb).toHaveLength(1);
    expect(cb[0]).toMatchObject({ kind: "failed", run: "breaker", ticket: null });
    expect(tracker.comments.some((c) => c.text.includes("2 failed tickets in a row (DGS-1, DGS-2)") && c.text.includes("dg autonomous resume"))).toBe(true);
  });
  it("F9: a failed release with a corrupt lock is not hidden by the bad-budget-config item", async () => {
    const { appendAttention } = await import("./attention-write.ts");
    appendAttention(dir, NOW, { ticket: null, run: "-", kind: "failed", cause: "bad-budget-config" });
    writeFileSync(join(dir, "lock.json"), "{broken");
    await runRelease(mk(), { ticket: "?", result: "failed", cause: "test-red" });
    const all = await items();
    expect(all.map((i) => i.id).sort()).toEqual(["-.failed.0", "corrupt-lock.failed.0"]);
  });
  it("two failed tickets both get an item; the breaker item coexists with the file-problem item", async () => {
    const { appendAttention } = await import("./attention-write.ts");
    acquireLock(dir, lock("DGS-1"));
    await runRelease(mk(), { ticket: "DGS-1", result: "failed", cause: "test-red" });
    acquireLock(dir, lock("DGS-2"));
    await runRelease(mk(), { ticket: "DGS-2", result: "failed", cause: "spec-gap" });
    appendAttention(dir, NOW, { ticket: null, run: "breaker", kind: "unknown", cause: "breaker-file-unreadable: x" });
    const all = await items();
    expect(all.map((i) => i.id).sort()).toEqual(["DGS-1.failed.0", "DGS-2.failed.0", "breaker.failed.0", "breaker.unknown.0"]);
  });
  it("merged resets the streak; stopped and awaiting-jack change nothing and write no item", async () => {
    acquireLock(dir, lock("DGS-1"));
    await runRelease(mk(), { ticket: "DGS-1", result: "failed", cause: "test-red" });
    acquireLock(dir, lock("DGS-2"));
    await runRelease(mk(), { ticket: "DGS-2", result: "stopped" });
    acquireLock(dir, lock("DGS-3"));
    await runRelease(mk(), { ticket: "DGS-3", result: "awaiting-jack" });
    expect((await breaker()).streak).toBe(1);
    expect(await items()).toHaveLength(1);
    acquireLock(dir, lock("DGS-4"));
    await runRelease(mk(), { ticket: "DGS-4", result: "merged" });
    expect((await breaker()).streak).toBe(0);
  });
  it("a proof release clears the lock, comments \"Autonomous Operation proof (<time>): <reason>\" and writes no attention item", async () => {
    acquireLock(dir, lock());
    await runRelease(mk(), { ticket: "DGS-1", result: "proof", reason: "first-use proof" });
    expect(readLock(dir)).toBeNull();
    expect(tracker.comments).toEqual([{ ref: "t1", text: "Autonomous Operation proof (2026-10-21 00:30:00): first-use proof" }]);
    expect(await items()).toHaveLength(0);
  });
  it("a proof release writes a release event with result proof", async () => {
    acquireLock(dir, lock());
    await runRelease(mk(), { ticket: "DGS-1", result: "proof", reason: "x" });
    expect(events().filter((e) => e.kind === "release").map((e) => e.result)).toEqual(["proof"]);
  });
  it("a proof release does not change the breaker streak", async () => {
    acquireLock(dir, lock("DGS-1"));
    await runRelease(mk(), { ticket: "DGS-1", result: "failed", cause: "test-red" });
    acquireLock(dir, lock("DGS-2"));
    await runRelease(mk(), { ticket: "DGS-2", result: "proof" });
    expect((await breaker()).streak).toBe(1);
    expect(await items()).toHaveLength(1);
  });
  it("a merged release without a commit returns a warning", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "merged" });
    expect(r.warning).toBe("merged without --commit, the report will show commit unknown");
  });
  it("a merged release with a commit returns no warning", async () => {
    acquireLock(dir, lock());
    const r = await runRelease(mk(), { ticket: "DGS-1", result: "merged", commit: "abc1234" });
    expect(r.warning).toBeNull();
  });
});
