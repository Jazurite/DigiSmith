import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTracker } from "../fake-tracker.test-util.ts";
import { directorDir, hasDecision, readDecisions, recordDecision, retryPendingComments, type RecordDeps } from "./record.ts";

let dir: string;
let tracker: FakeTracker;
const NOW = new Date("2026-11-03T03:00:00.000Z"); // 10:00 UTC+7
const deps = (): RecordDeps => ({ dir, now: () => NOW, tracker });
const base = { ticket: "DGS-1", run: "r1", id: "claim-refine", side: "within" as const, what: "claimed DGS-1", why: "it is ready" };

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "director-")); tracker = new FakeTracker(); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("recordDecision", () => {
  it("writes the journal line before the comment", async () => {
    let lineAtComment = "";
    tracker.comment = async (ref, text) => {
      tracker.calls.push(`comment ${ref}`);
      tracker.comments.push({ ref, text });
      lineAtComment = readFileSync(join(directorDir(dir), "decisions.jsonl"), "utf8");
    };
    await recordDecision(deps(), base);
    expect(lineAtComment.trim().split("\n")).toHaveLength(1);
    const line = JSON.parse(lineAtComment);
    expect(line).toMatchObject({ ts: NOW.toISOString(), tsUtc7: "2026-11-03 10:00:00", ticket: "DGS-1", id: "claim-refine", side: "within", what: "claimed DGS-1", why: "it is ready", by: "director" });
    expect(tracker.comments).toEqual([{ ref: "DGS-1", text: "Director decision (2026-11-03 10:00:00 UTC+7): claimed DGS-1. Why: it is ready." }]);
  });

  it("a failed journal write throws and sends no comment", async () => {
    writeFileSync(join(dir, "director"), "a file where the folder should be");
    await expect(recordDecision(deps(), base)).rejects.toThrow();
    expect(tracker.comments).toEqual([]);
  });

  it("a failed comment keeps the journal line and queues the comment in comment-pending.jsonl", async () => {
    tracker.comment = async () => { throw new Error("clickup down"); };
    await recordDecision(deps(), base);
    expect(readDecisions(dir)).toHaveLength(1);
    const q = readFileSync(join(dir, "comment-pending.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ ref: "DGS-1" });
    expect(q[0].text).toContain("Director decision");
  });

  it("reprompt-run and pick-seat get no ClickUp comment", async () => {
    await recordDecision(deps(), { ...base, id: "reprompt-run" });
    await recordDecision(deps(), { ...base, id: "pick-seat" });
    expect(tracker.comments).toEqual([]);
    expect(readDecisions(dir)).toHaveLength(2);
  });

  it("noComment skips the comment but keeps the journal", async () => {
    await recordDecision(deps(), { ...base, noComment: true });
    expect(tracker.comments).toEqual([]);
    expect(readDecisions(dir)).toHaveLength(1);
  });
});

describe("hasDecision and readDecisions", () => {
  it("finds an earlier line keyed on ticket + run + id", async () => {
    await recordDecision(deps(), { ...base, id: "restart-run", run: "refine-run" });
    expect(hasDecision(dir, "DGS-1", "refine-run", "restart-run")).not.toBeNull();
    expect(hasDecision(dir, "DGS-1", "builder-run", "restart-run")).toBeNull();
    expect(hasDecision(dir, "DGS-1", null, "restart-run")).toBeNull();
    expect(hasDecision(dir, "DGS-2", "refine-run", "restart-run")).toBeNull();
  });
  it("returns the newest match", async () => {
    await recordDecision(deps(), { ...base, what: "first" });
    await recordDecision(deps(), { ...base, what: "second" });
    expect(hasDecision(dir, "DGS-1", "r1", "claim-refine")?.what).toBe("second");
  });
  it("a missing file gives []; a damaged line is skipped", async () => {
    expect(readDecisions(dir)).toEqual([]);
    await recordDecision(deps(), base);
    writeFileSync(join(directorDir(dir), "decisions.jsonl"), `${readFileSync(join(directorDir(dir), "decisions.jsonl"), "utf8")}{not json\n`);
    expect(readDecisions(dir)).toHaveLength(1);
  });
  it("a decision without a run is keyed on null", async () => {
    await recordDecision(deps(), { ticket: "DGS-1", id: "pick-seat", side: "within", what: "w", why: "y" });
    expect(hasDecision(dir, "DGS-1", null, "pick-seat")).not.toBeNull();
  });
});

describe("retryPendingComments", () => {
  it("sends the queue and empties it", async () => {
    let fail = true;
    const real = tracker.comment.bind(tracker);
    tracker.comment = async (r, t) => { if (fail) throw new Error("down"); return real(r, t); };
    await recordDecision(deps(), base);
    fail = false;
    expect(await retryPendingComments(deps())).toBe(1);
    expect(tracker.comments).toHaveLength(1);
    expect(existsSync(join(dir, "comment-pending.jsonl")) ? readFileSync(join(dir, "comment-pending.jsonl"), "utf8").trim() : "").toBe("");
    expect(await retryPendingComments(deps())).toBe(0);
  });
  it("a still failing comment stays queued", async () => {
    tracker.comment = async () => { throw new Error("down"); };
    await recordDecision(deps(), base);
    expect(await retryPendingComments(deps())).toBe(0);
    expect(readFileSync(join(dir, "comment-pending.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
  });
  it("with no queue it does nothing", async () => {
    expect(await retryPendingComments(deps())).toBe(0);
  });
  it("F3: a comment queued while the retry is awaiting a send is kept", async () => {
    tracker.comment = async () => { throw new Error("down"); };
    await recordDecision(deps(), base);
    let first = true;
    tracker.comment = async (r, t) => {
      if (first) { first = false; appendFileSync(join(dir, "comment-pending.jsonl"), `${JSON.stringify({ ref: "DGS-9", text: "late" })}\n`); }
      tracker.comments.push({ ref: r, text: t });
    };
    expect(await retryPendingComments(deps())).toBe(1);
    expect(readFileSync(join(dir, "comment-pending.jsonl"), "utf8")).toContain("late");
  });
  it("F3: a leftover retrying file from a crash is processed", async () => {
    writeFileSync(join(dir, "comment-pending.retrying.jsonl"), `${JSON.stringify({ ref: "DGS-1", text: "old" })}\n`);
    expect(await retryPendingComments(deps())).toBe(1);
    expect(tracker.comments).toEqual([{ ref: "DGS-1", text: "old" }]);
    expect(existsSync(join(dir, "comment-pending.retrying.jsonl"))).toBe(false);
  });
  it("F4: a failing queue write does not throw out of recordDecision; stderr reports it", async () => {
    tracker.comment = async () => { throw new Error("down"); };
    mkdirSync(join(dir, "comment-pending.jsonl")); // an append to a directory fails
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await expect(recordDecision(deps(), base)).resolves.toBeUndefined();
      expect(err).toHaveBeenCalledWith(expect.stringContaining("queue write failed"));
    } finally { err.mockRestore(); }
    expect(readDecisions(dir)).toHaveLength(1);
  });
});
