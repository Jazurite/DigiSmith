import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { runScheduleRelease, SCHEDULE_NOTES, SCHEDULE_TEXT, type ScheduleDeps } from "./schedule-release.ts";
import { readEvents } from "./state.ts";

const NOW = new Date("2026-10-25T15:00:00.000Z");           // 22:00 UTC+7
const PAST = NOW.getTime() - 60_000;
const FUTURE = NOW.getTime() + 3600_000;

let dir: string;
let tracker: FakeTracker;
let now: Date;
const mk = (over: Partial<ScheduleDeps> = {}): ScheduleDeps => ({ tracker, dir, now: () => now, dryRun: false, ...over });
const events = () => readEvents(dir, NOW.getTime() - 86_400_000, NOW.getTime() + 86_400_000);
const sched = (id: string, over: object = {}) => tracker.add({ id, status: "scheduled", scheduledAt: PAST, mode: "Autonomous", ...over });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "sched-rel-")); tracker = new FakeTracker(); now = NOW; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("runScheduleRelease", () => {
  it("a due Autonomous ticket moves to to do, is read back, and one event is written", async () => {
    sched("t1");
    const r = await runScheduleRelease(mk());
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(tracker.calls).toEqual(["listByStatus scheduled", "setStatus t1 to do", "getStatus t1"]);
    expect(r).toMatchObject({ scheduled: 1, moved: 1 });
    expect(events().map((e) => [e.kind, e.ticket, e.to, e.mode])).toEqual([["schedule-move", "T1", "to do", "Autonomous"]]);
    expect(events()[0].scheduledAtUtc7).toBe("2026-10-25 21:59:00");
    expect(tracker.comments).toEqual([]);
  });
  it("a due Manual ticket moves to to do", async () => {
    sched("t1", { mode: "Manual" });
    await runScheduleRelease(mk());
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
  });
  it("a ticket due exactly now moves", async () => {
    sched("t1", { scheduledAt: NOW.getTime() });
    expect((await runScheduleRelease(mk())).moved).toBe(1);
  });
  it("a future ticket is left alone, with no write and no comment", async () => {
    sched("t1", { scheduledAt: FUTURE });
    const r = await runScheduleRelease(mk());
    expect(tracker.writeCalls()).toEqual([]);
    expect(r.lines).toEqual([{ key: "T1", scheduledAtUtc7: "2026-10-25 23:00:00", mode: "Autonomous", verdict: "not-due" }]);
  });
  it("only scheduled tickets are read: to do tickets are never touched", async () => {
    tracker.add({ id: "r1", status: "to do", scheduledAt: PAST });
    tracker.add({ id: "d1", status: "to do", scheduledAt: PAST });
    await runScheduleRelease(mk());
    expect(tracker.writeCalls()).toEqual([]);
  });
  it("missing date, bad date and missing Mode: one comment each, not repeated on the next run", async () => {
    sched("a", { scheduledAt: null });
    sched("b", { scheduledAt: "invalid" });
    sched("c", { mode: null });
    await runScheduleRelease(mk());
    await runScheduleRelease(mk());
    expect(tracker.comments.map((c) => [c.ref, c.text])).toEqual([
      ["c", `Schedule release (2026-10-25 22:00:00 UTC+7): ${SCHEDULE_TEXT.noMode}`],
      ["a", `Schedule release (2026-10-25 22:00:00 UTC+7): ${SCHEDULE_TEXT.noDate}`],
      ["b", `Schedule release (2026-10-25 22:00:00 UTC+7): ${SCHEDULE_TEXT.badDate}`],
    ]);
    expect(tracker.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
  });
  it("a changed reason comments again", async () => {
    const t = sched("a", { scheduledAt: null });
    await runScheduleRelease(mk());
    t.scheduledAt = "invalid";
    await runScheduleRelease(mk());
    expect(tracker.comments.map((c) => c.text.split(": ").slice(1).join(": "))).toEqual([SCHEDULE_TEXT.noDate, SCHEDULE_TEXT.badDate]);
  });
  it("a ticket that leaves scheduled loses its note, so a later problem comments again", async () => {
    const t = sched("a", { scheduledAt: null });
    await runScheduleRelease(mk());
    t.status = "refinement";
    await runScheduleRelease(mk());
    expect(JSON.parse(readFileSync(join(dir, SCHEDULE_NOTES), "utf8"))).toEqual({});
    t.status = "scheduled";
    await runScheduleRelease(mk());
    expect(tracker.comments).toHaveLength(2);
  });
  it("a wrong read-back is a failed move: event, one comment, still listed next run, retried", async () => {
    sched("t1");
    tracker.getStatus = async (id: string) => { tracker.calls.push(`getStatus ${id}`); return "scheduled"; };
    const r = await runScheduleRelease(mk());
    expect(r.lines[0]).toMatchObject({ verdict: "failed", to: "to do", error: 'status read back "scheduled", expected "to do"' });
    expect(events().map((e) => e.kind)).toEqual(["schedule-move-failed"]);
    expect(tracker.comments.map((c) => c.text)).toEqual([`Schedule release (2026-10-25 22:00:00 UTC+7): ${SCHEDULE_TEXT.failed("to do", 'status read back "scheduled", expected "to do"')}`]);
    tracker.tasks.get("t1")!.status = "scheduled";
    await runScheduleRelease(mk());
    expect(tracker.calls.filter((c) => c === "setStatus t1 to do")).toHaveLength(2);
    expect(tracker.comments).toHaveLength(1);
  });
  it("a setStatus error is a failed move and the run goes on to the next ticket", async () => {
    sched("t1", { scheduledAt: PAST - 1000 });
    sched("t2");
    let first = true;
    const orig = tracker.setStatus.bind(tracker);
    tracker.setStatus = async (id, s) => { if (first) { first = false; tracker.calls.push(`setStatus ${id} ${s}`); throw new Error("Status not found"); } return orig(id, s); };
    const r = await runScheduleRelease(mk());
    expect(r.lines.map((l) => [l.key, l.verdict])).toEqual([["T1", "failed"], ["T2", "moved"]]);
  });
  it("a comment that fails is tried again on the next run", async () => {
    sched("a", { mode: null });
    tracker.comment = async () => { throw new Error("down"); };
    await runScheduleRelease(mk());
    expect(existsSync(join(dir, SCHEDULE_NOTES)) ? JSON.parse(readFileSync(join(dir, SCHEDULE_NOTES), "utf8")) : {}).toEqual({});
  });
  it("an event write that throws never aborts the run: tickets still move, notes are still saved", async () => {
    sched("a", { mode: null });
    sched("t1", { scheduledAt: PAST - 1000 });
    sched("t2");
    const boom = () => { throw new Error("EACCES"); };
    const r = await runScheduleRelease(mk({ appendEvent: boom }));
    expect(r.lines.map((l) => [l.key, l.verdict])).toEqual([["T1", "moved"], ["A", "no-mode"], ["T2", "moved"]]);
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(tracker.tasks.get("t2")?.status).toBe("to do");
    expect(Object.keys(JSON.parse(readFileSync(join(dir, SCHEDULE_NOTES), "utf8")))).toEqual(["A"]);
  });
  it("a failed move whose event write throws is still a failed line, and notes are saved", async () => {
    sched("t1");
    sched("a", { mode: null, scheduledAt: PAST - 5000 });
    tracker.failSetStatus = true;
    const r = await runScheduleRelease(mk({ appendEvent: () => { throw new Error("EACCES"); } }));
    expect(r.lines.map((l) => [l.key, l.verdict])).toEqual([["A", "no-mode"], ["T1", "failed"]]);
    expect(Object.keys(JSON.parse(readFileSync(join(dir, SCHEDULE_NOTES), "utf8"))).sort()).toEqual(["A", "T1"]);
  });
  it("a note is cleared when the ticket is valid but not yet due", async () => {
    const t = sched("a", { mode: null });
    await runScheduleRelease(mk());
    t.mode = "Autonomous";
    t.scheduledAt = FUTURE;
    await runScheduleRelease(mk());
    expect(JSON.parse(readFileSync(join(dir, SCHEDULE_NOTES), "utf8"))).toEqual({});
    t.mode = null;
    await runScheduleRelease(mk());
    expect(tracker.comments).toHaveLength(2);
  });
  it("the same failure on two runs writes one schedule-move-failed event", async () => {
    sched("t1");
    tracker.failSetStatus = true;
    await runScheduleRelease(mk());
    await runScheduleRelease(mk());
    expect(events().map((e) => e.kind)).toEqual(["schedule-move-failed"]);
    expect(tracker.comments).toHaveLength(1);
  });
  it("a second run after a move does nothing (idempotent)", async () => {
    sched("t1");
    await runScheduleRelease(mk());
    tracker.calls = [];
    const r = await runScheduleRelease(mk());
    expect(r).toEqual({ scheduled: 0, moved: 0, lines: [] });
    expect(tracker.writeCalls()).toEqual([]);
  });
  it("tickets are handled in Scheduled at order, problems last", async () => {
    sched("late", { scheduledAt: PAST });
    sched("none", { scheduledAt: null });
    sched("early", { scheduledAt: PAST - 3600_000 });
    const r = await runScheduleRelease(mk());
    expect(r.lines.map((l) => l.key)).toEqual(["EARLY", "LATE", "NONE"]);
  });
  it("dry run writes nothing and says would-move", async () => {
    sched("t1");
    sched("a", { mode: null });
    const r = await runScheduleRelease(mk({ dryRun: true }));
    expect(tracker.writeCalls()).toEqual([]);
    expect(events()).toEqual([]);
    expect(existsSync(join(dir, SCHEDULE_NOTES))).toBe(false);
    expect(r.lines.map((l) => [l.key, l.verdict, l.to])).toEqual([["T1", "would-move", "to do"], ["A", "no-mode", undefined]]);
  });
  it("a tracker that cannot list throws (the job then fails and Nexus notifies)", async () => {
    tracker.listByStatus = async () => { throw new Error("401"); };
    await expect(runScheduleRelease(mk())).rejects.toThrow("401");
  });
  it("pins the texts", () => {
    expect(SCHEDULE_TEXT.noDate).toBe("Scheduled at is empty. Set it (UTC+7) and the ticket moves at that time.");
    expect(SCHEDULE_TEXT.badDate).toBe("Scheduled at is not a date. Set it again (UTC+7) and the ticket moves at that time.");
    expect(SCHEDULE_TEXT.noMode).toBe("Mode is empty. Set Autonomous or Manual; the ticket then moves to to do.");
    expect(SCHEDULE_TEXT.failed("to do", "x")).toBe("Could not move this ticket to to do: x. It stays in scheduled and is tried again every 5 minutes.");
  });
});
