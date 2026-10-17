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
    const t = new FakeTracker(snapshot("in progress"));
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
    const t = new FakeTracker(snapshot("acceptance", { signoff: "Jack" }));
    for (const event of ["started", "review-started", "merged", "verified"] as const) await run(t, { event });
    expect(t.ticket.status).toBe("acceptance");
    expect(t.calls).toEqual([]);
  });
});

describe("a status that is not on the list", () => {
  it("is refused with the list's statuses and nothing is written", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Jack", statuses: ["review", "done"] }));
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
    expect(readState(dir, "DGS-1")!.pending).toEqual([{ to: "in progress", start: "2026-10-18" }]);
    await run(t, { event: "review-started" });
    expect(t.ticket.status).toBe("review");
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
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

    const nl = await runR(new FakeTracker(snapshot("review", { signoff: "Jack", statuses: ["review", "done"] })), { event: "merged" });
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
    const t = new FakeTracker(snapshot("acceptance", { signoff: "Jack", statuses: ["acceptance", "release"] }));
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
