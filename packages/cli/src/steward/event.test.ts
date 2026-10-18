import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runEvent, rebuild, assertUsage, UsageError, todayUtc7, type EventDeps } from "./event.ts";
import { readState } from "./state.ts";
import { FakeTracker, snapshot } from "./fake-tracker.test-util.ts";
import type { EventInput } from "./types.ts";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stev-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const NOW = new Date("2026-10-17T20:30:00Z"); // 03:30 on 2026-10-18 in UTC+7
const deps = (t: FakeTracker | null, over: Partial<EventDeps> = {}): EventDeps => ({
  tracker: t, dir, now: () => NOW, config: { releaseStage: false },
  lock: { waitMs: 100, staleMs: 60_000, pollMs: 10 }, sessionIds: () => ["s1"], ...over,
});
const runR = (t: FakeTracker, input: EventInput, over: Partial<EventDeps> = {}, dry = false) => runEvent(deps(t, over), "DGS-1", input, dry);
const run = async (t: FakeTracker, input: EventInput, over: Partial<EventDeps> = {}, dry = false) => { const r = await runR(t, input, over, dry); return [...r.out, ...r.warn]; };
const Q = { quote: "approved, go" };

describe("todayUtc7", () => {
  it("is the UTC+7 day", () => expect(todayUtc7(NOW)).toBe("2026-10-18"));
});

describe("assertUsage", () => {
  it("rejects a gate event without a quote and accepted without an answer", () => {
    expect(() => assertUsage({ event: "approved" })).toThrow(UsageError);
    expect(() => assertUsage({ event: "accepted", quote: "q" })).toThrow(UsageError);
    expect(() => assertUsage({ event: "accepted", quote: "q", answer: "yes" })).not.toThrow();
    expect(() => assertUsage({ event: "started" })).not.toThrow();
  });
});

describe("no tracker", () => {
  it("prints nothing and writes nothing", async () => {
    expect(await runEvent(deps(null), "DGS-1", { event: "started" })).toEqual({ out: [], warn: [] });
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe("a start", () => {
  it("moves to do to in progress with a start date and writes state", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const lines = await run(t, { event: "started", by: "worker" });
    expect(t.ticket).toMatchObject({ status: "in progress", startDate: "2026-10-18" });
    expect(lines.join("\n")).toContain("to do -> in progress");
    const s = readState(dir, "DGS-1")!;
    expect(s).toMatchObject({ status_written: "in progress", start_written: "2026-10-18", sessions: ["s1"] });
    expect(s.log.at(-1)).toMatchObject({ event: "started", by: "worker", outcome: "applied" });
  });
  it("keeps an existing start date", async () => {
    const t = new FakeTracker(snapshot("to do", { startDate: "2026-10-01" }));
    await run(t, { event: "started" });
    expect(t.calls).toEqual(["status:in progress"]);
  });
  it("replaces a start date later than today (a dependent ClickUp moved)", async () => {
    const t = new FakeTracker(snapshot("to do", { startDate: "2026-10-19" }));
    await run(t, { event: "started" });
    expect(t.calls).toEqual(["status:in progress", "dates:2026-10-18|"]);
    expect(t.ticket.startDate).toBe("2026-10-18");
    expect(readState(dir, "DGS-1")!.start_written).toBe("2026-10-18");
  });
});

describe("the dates repair at every event", () => {
  it("status already there, start still late: repaired", async () => {
    const t = new FakeTracker(snapshot("in progress", { startDate: "2026-10-19" }));
    const lines = await run(t, { event: "started" });
    expect(t.calls).toEqual(["dates:2026-10-18|"]);
    expect(t.ticket.startDate).toBe("2026-10-18");
    expect(lines.join("\n")).toContain("start date 2026-10-19 -> 2026-10-18");
    const s = readState(dir, "DGS-1")!;
    expect(s.start_written).toBe("2026-10-18");
    expect(s.log.at(-1)?.outcome).toBe("noop");
  });
  it("a record-only event in review repairs a late start", async () => {
    const t = new FakeTracker(snapshot("review", { startDate: "2026-10-19" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.calls).toEqual(["dates:2026-10-18|"]);
  });
  it("a refused event still repairs", async () => {
    const t = new FakeTracker(snapshot("review", { startDate: "2026-10-19" }));
    const lines = await run(t, { event: "started" });
    expect(lines.join("\n")).toMatch(/refused started/);
    expect(t.ticket.startDate).toBe("2026-10-18");
  });
  it("done with a start after the due date: start = due", async () => {
    const t = new FakeTracker(snapshot("done", { startDate: "2026-10-19", dueDate: "2026-10-17" }));
    await run(t, { event: "documented" });
    expect(t.calls).toEqual(["dates:2026-10-17|", "status:documented"]);
    expect(t.ticket.startDate).toBe("2026-10-17");
  });
  it("merged: a late start is put back before the due write", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto", startDate: "2026-10-19" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.calls).toEqual(["dates:2026-10-18|", "status:done", "dates:|2026-10-18"]);
    expect(t.ticket).toMatchObject({ status: "done", startDate: "2026-10-18", dueDate: "2026-10-18" });
  });
  it("a queued done move heals: the start ClickUp shifted is repaired at the next event", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto", startDate: "2026-10-01" }));
    t.failWrites = 1;
    await run(t, { event: "merged", sha: "abc" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
    t.ticket.startDate = "2026-10-19";
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket).toMatchObject({ status: "done", startDate: "2026-10-18", dueDate: "2026-10-18" });
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
  });
  it("fills a missing start with the day the ticket entered in progress", async () => {
    const t = new FakeTracker(snapshot("to do"));
    await run(t, { event: "started" }, { now: () => new Date("2026-10-16T05:00:00Z") }); // the 16th in UTC+7
    t.ticket.startDate = null; // ClickUp lost the start
    await run(t, { event: "review-started" }); // today is the 18th
    expect(t.ticket).toMatchObject({ status: "review", startDate: "2026-10-16" });
  });
  it("fills a missing start with today when the state does not know the day", async () => {
    const t = new FakeTracker(snapshot("in progress"));
    await run(t, { event: "started" });
    expect(t.calls).toEqual(["dates:2026-10-18|"]);
    expect(t.ticket.startDate).toBe("2026-10-18");
  });
  it("leaves alone: a ticket in to do, a discarded one, an earlier start", async () => {
    const early = new FakeTracker(snapshot("in progress", { startDate: "2026-10-01" }));
    await run(early, { event: "started" });
    expect(early.calls).toEqual([]);
    const todo = new FakeTracker(snapshot("to do", { startDate: "2026-10-19" }));
    await run(todo, { event: "review-started" });
    expect(todo.calls).toEqual([]);
    const gone = new FakeTracker(snapshot("discarded", { startDate: "2026-10-19" }));
    await run(gone, { event: "discard", ...Q });
    expect(gone.calls).toEqual([]);
  });
  it("a failed repair is a warning and the event still applies", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto", startDate: "2026-10-19" }));
    const original = t.setDates.bind(t);
    t.setDates = async (k, d) => { if (!d.due) throw new Error("boom"); await original(k, d); };
    const lines = await run(t, { event: "merged", sha: "abc" });
    expect(lines.join("\n")).toMatch(/could not repair the start date \(boom\)/);
    expect(t.ticket.status).toBe("done");
  });
});

describe("a refusal and a repeat", () => {
  it("a refused event writes nothing to the tracker but is logged", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    const lines = await run(t, { event: "started" });
    expect(t.calls).toEqual([]);
    expect(lines[0]).toMatch(/refused started/);
    expect(readState(dir, "DGS-1")!.log.at(-1)?.outcome).toBe("refused");
  });
  it("a repeated event is a no-op", async () => {
    const t = new FakeTracker(snapshot("in progress", { startDate: "2026-10-01" }));
    await run(t, { event: "started" });
    expect(t.calls).toEqual([]);
    expect(readState(dir, "DGS-1")!.log.at(-1)?.outcome).toBe("noop");
  });
});

describe("the three done paths", () => {
  it("Auto: review-started then merged ends done with a due date, no verified needed", async () => {
    const t = new FakeTracker(snapshot("in progress", { signoff: "Auto" }));
    await run(t, { event: "review-started" });
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket).toMatchObject({ status: "done", dueDate: "2026-10-18" });
    const s = readState(dir, "DGS-1")!;
    expect(s.merged?.sha).toBe("abc");
    expect(s.closed_at).toBe(NOW.toISOString());
  });
  it("Jack: merged enters acceptance, verified is refused, accepted yes ends done and keeps the quote", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket.status).toBe("acceptance");
    await run(t, { event: "verified" });
    expect(t.ticket.status).toBe("acceptance");
    await run(t, { event: "accepted", answer: "yes", quote: "looks good", by: "maestro" });
    expect(t.ticket.status).toBe("done");
    expect(readState(dir, "DGS-1")!.gates).toEqual([{ event: "accepted", answer: "yes", quote: "looks good", by: "maestro", at: NOW.toISOString() }]);
  });
  it("Jack: accepted no returns to refinement and comments his words", async () => {
    const t = new FakeTracker(snapshot("acceptance", { signoff: "Jack" }));
    await run(t, { event: "accepted", answer: "no", quote: "wrong colour" });
    expect(t.ticket.status).toBe("refinement");
    expect(t.comments).toEqual(["Jack did not accept: wrong colour"]);
  });
  it("unmarked: merged records only, verified ends done", async () => {
    const t = new FakeTracker(snapshot("review"));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket.status).toBe("review");
    expect(readState(dir, "DGS-1")!.merged?.sha).toBe("abc");
    await run(t, { event: "verified" });
    expect(t.ticket).toMatchObject({ status: "done", dueDate: "2026-10-18" });
  });
  it("release stage on: Auto merged goes to release, released goes to done", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto" }));
    await run(t, { event: "merged" }, { config: { releaseStage: true } });
    expect(t.ticket.status).toBe("release");
    await run(t, { event: "released" }, { config: { releaseStage: true } });
    expect(t.ticket.status).toBe("done");
  });
});

describe("the gates", () => {
  it("approved with a quote moves refinement to to do and records the decision", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    await run(t, { event: "approved", ...Q, by: "maestro" });
    expect(t.ticket.status).toBe("to do");
    expect(readState(dir, "DGS-1")!.gates[0]).toMatchObject({ event: "approved", quote: "approved, go", by: "maestro" });
  });
  it("an event in acceptance other than accepted is refused", async () => {
    const t = new FakeTracker(snapshot("acceptance", { startDate: "2026-10-01", signoff: "Jack" }));
    for (const event of ["started", "review-started", "merged", "verified"] as const) await run(t, { event });
    expect(t.ticket.status).toBe("acceptance");
    expect(t.calls).toEqual([]);
  });
});

describe("a status that is not on the list", () => {
  it("is refused with the list's statuses and nothing is written", async () => {
    const t = new FakeTracker(snapshot("review", { startDate: "2026-10-01", signoff: "Jack", statuses: ["review", "done"] }));
    const lines = await run(t, { event: "merged" });
    expect(t.calls).toEqual([]);
    expect(lines.join("\n")).toContain('"acceptance" is not on the list');
  });
});

describe("a failed write", () => {
  it("is kept as pending and retried first at the next event", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.failWrites = 1;
    const lines = await run(t, { event: "started" });
    expect(lines.join("\n")).toMatch(/will retry/);
    expect(t.ticket.status).toBe("to do");
    expect(readState(dir, "DGS-1")!.pending).toEqual([{ to: "in progress", from: "to do", start: "2026-10-18" }]);
    await run(t, { event: "review-started" });
    expect(t.ticket.status).toBe("review");
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
  });
  it("a queued start takes start = today when ClickUp shifted the start meanwhile", async () => {
    const t = new FakeTracker(snapshot("to do", { startDate: "2026-10-01" }));
    t.failWrites = 1;
    await run(t, { event: "started" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
    t.ticket.startDate = "2026-10-19";
    await run(t, { event: "review-started" });
    expect(t.ticket).toMatchObject({ status: "review", startDate: "2026-10-18" });
  });
  it("a read-back that differs from the write counts as a failed write", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const original = t.setStatus.bind(t);
    t.setStatus = async (k, s) => { await original(k, s); t.ticket.status = "to do"; };
    await run(t, { event: "started" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
  });
});

describe("the lock", () => {
  it("applies nothing and says so when another call holds the lock", async () => {
    fs.writeFileSync(path.join(dir, "DGS-1.json.lock"), "");
    const t = new FakeTracker(snapshot("to do"));
    const lines = await run(t, { event: "started" });
    expect(lines[0]).toMatch(/lock/);
    expect(t.calls).toEqual([]);
  });
});

describe("dry run", () => {
  it("prints the move and writes nothing", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const lines = await run(t, { event: "started" }, {}, true);
    expect(lines[0]).toMatch(/dry run.*to do -> in progress/);
    expect(t.calls).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe("rebuild", () => {
  it("builds the state from the tracker and the registry, and reports a difference", async () => {
    const t = new FakeTracker(snapshot("in progress", { startDate: "2026-10-01", signoff: "Auto" }));
    const lines = (await rebuild(deps(t), "DGS-1")).out;
    expect(readState(dir, "DGS-1")).toMatchObject({ status_written: "in progress", start_written: "2026-10-01", signoff: "Auto", sessions: ["s1"] });
    expect(lines[0]).toMatch(/rebuilt/);
  });
  it("an event for a ticket with no file rebuilds first", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack" }));
    await run(t, { event: "merged" });
    expect(readState(dir, "DGS-1")!.sessions).toEqual(["s1"]);
  });
  it("ClickUp wins over a state file that disagrees", async () => {
    const t = new FakeTracker(snapshot("to do"));
    await run(t, { event: "started" });
    t.ticket.status = "review"; // someone moved it by hand
    await run(t, { event: "review-started" });
    expect(readState(dir, "DGS-1")!.status_seen).toBe("review");
  });
});

describe("which stream a line lands on", () => {
  it("an applied move is out; refused, failed write, not-on-the-list and lock are warn", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const ok = await runR(t, { event: "started" });
    expect(ok.out.join("\n")).toContain("to do -> in progress");
    expect(ok.warn).toEqual([]);

    const refused = await runR(new FakeTracker(snapshot("refinement")), { event: "started" });
    expect(refused.out).toEqual([]);
    expect(refused.warn[0]).toMatch(/refused started/);

    const f = new FakeTracker(snapshot("to do"));
    f.failWrites = 1;
    const failed = await runR(f, { event: "started" });
    expect(failed.out).toEqual([]);
    expect(failed.warn[0]).toMatch(/will retry/);

    fs.rmSync(path.join(dir, "DGS-1.json")); // a fresh ticket: drop the queued move above
    const nl = await runR(new FakeTracker(snapshot("review", { startDate: "2026-10-01", signoff: "Jack", statuses: ["review", "done"] })), { event: "merged" });
    expect(nl.out).toEqual([]);
    expect(nl.warn[0]).toContain("is not on the list");

    fs.writeFileSync(path.join(dir, "DGS-1.json.lock"), "");
    const locked = await runR(new FakeTracker(snapshot("to do")), { event: "started" });
    expect(locked.out).toEqual([]);
    expect(locked.warn[0]).toMatch(/lock/);
  });
});

describe("a refused write leaves no record", () => {
  it("merged on a list without acceptance leaves merged null", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack", statuses: ["review", "done"] }));
    await run(t, { event: "merged", sha: "abc" });
    expect(readState(dir, "DGS-1")!.merged).toBeNull();
  });
  it("accepted yes refused for a missing status leaves no gate and release-started is refused", async () => {
    const t = new FakeTracker(snapshot("acceptance", { startDate: "2026-10-01", signoff: "Jack", statuses: ["acceptance", "release"] }));
    await run(t, { event: "accepted", answer: "yes", quote: "ok" }, { config: { releaseStage: false } });
    expect(readState(dir, "DGS-1")!.gates).toEqual([]);
    const lines = await run(t, { event: "release-started" }, { config: { releaseStage: true } });
    expect(lines[0]).toMatch(/refused release-started/);
    expect(t.calls).toEqual([]);
  });
  it("a queued (failed) move keeps its gate", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    t.failWrites = 1;
    await run(t, { event: "approved", quote: "go" });
    expect(readState(dir, "DGS-1")!.gates).toHaveLength(1);
  });
});

describe("pending dedupe", () => {
  it("the same event failing twice leaves one pending entry", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.failWrites = 4;
    await run(t, { event: "started" });
    await run(t, { event: "started" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
  });
});

describe("pending retries", () => {
  it("a stale pending after a hand discard is dropped with a warning and does not reopen the ticket", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.failWrites = 1;
    await run(t, { event: "started" });
    t.ticket.status = "discarded"; // Jack discarded it by hand
    t.calls.length = 0;
    const r = await runR(t, { event: "review-started" });
    expect(t.ticket.status).toBe("discarded");
    expect(t.calls).toEqual([]);
    expect(r.warn.join("\n")).toMatch(/dropped the queued move to in progress because the ticket is now in discarded/);
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
  });
  it("a pending that is already satisfied is dropped without a comment", async () => {
    const t = new FakeTracker(snapshot("acceptance", { startDate: "2026-10-01", signoff: "Jack" }));
    t.failWrites = 1; // setStatus throws, nothing written
    await run(t, { event: "accepted", answer: "no", quote: "wrong" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
    t.ticket.status = "refinement"; // moved by hand to the target
    await run(t, { event: "approved", quote: "go" });
    expect(t.comments).toEqual([]);
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
  });
  it("a successful retry refreshes the snapshot so the event is judged on the fresh status", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.failWrites = 1;
    await run(t, { event: "started" });
    expect(t.ticket.status).toBe("to do");
    const lines = await run(t, { event: "review-started" });
    expect(lines.join("\n")).toContain("retried the earlier move to in progress");
    expect(t.ticket.status).toBe("review");
    expect(readState(dir, "DGS-1")!.log.at(-1)).toMatchObject({ outcome: "applied", note: "in progress -> review" });
  });
  it("the comment is posted once across a failed read back and a retry", async () => {
    const t = new FakeTracker(snapshot("acceptance", { signoff: "Jack" }));
    const original = t.setStatus.bind(t);
    t.setStatus = async (k, s) => { await original(k, s); t.ticket.status = "acceptance"; };
    await run(t, { event: "accepted", answer: "no", quote: "wrong colour" });
    expect(t.comments).toHaveLength(1);
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
    t.setStatus = original;
    await run(t, { event: "concept-started" }); // refused itself, but the queued move retries first
    expect(t.ticket.status).toBe("refinement");
    expect(t.comments).toHaveLength(1);
  });
});

describe("merge record after accepted no", () => {
  it("is cleared when the ticket returns to refinement", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(readState(dir, "DGS-1")!.merged?.sha).toBe("abc");
    await run(t, { event: "accepted", answer: "no", quote: "redo" });
    expect(t.ticket.status).toBe("refinement");
    expect(readState(dir, "DGS-1")!.merged).toBeNull();
  });
  it("rebuild keeps a merge record only from review on", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack" }));
    await run(t, { event: "merged", sha: "abc" });
    t.ticket.status = "review";
    await rebuild(deps(t), "DGS-1");
    expect(readState(dir, "DGS-1")!.merged?.sha).toBe("abc");
    t.ticket.status = "refinement";
    await rebuild(deps(t), "DGS-1");
    expect(readState(dir, "DGS-1")!.merged).toBeNull();
  });
});

describe("dry run and a corrupt file", () => {
  it("leaves a corrupt state file in place", async () => {
    fs.writeFileSync(path.join(dir, "DGS-1.json"), "{ not json");
    const t = new FakeTracker(snapshot("to do"));
    await run(t, { event: "started" }, {}, true);
    expect(fs.readdirSync(dir)).toEqual(["DGS-1.json"]);
  });
});
