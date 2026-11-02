import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOpen } from "../attention.ts";
import { FakeTracker } from "../fake-tracker.test-util.ts";
import { escalate, markReturned, questionKey, type EscalateArgs } from "./escalate.ts";
import { readDecisions, type RecordDeps } from "./record.ts";

let dir: string;
let tracker: FakeTracker;
let now: Date;
const NOW = new Date("2026-11-03T03:00:00.000Z"); // 10:00 UTC+7
const deps = (): RecordDeps => ({ dir, now: () => now, tracker });
const args = (over: Partial<EscalateArgs> = {}): EscalateArgs => ({ ticket: "DGS-1", taskId: "t1", id: "product-taste-names-scope", question: "Which name?", viaRelease: false, ...over });
const lines = (): Record<string, unknown>[] => readFileSync(join(dir, "escalations.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const writes = (): string[] => tracker.calls.filter((c) => c.startsWith("setStatus"));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "director-"));
  now = NOW;
  tracker = new FakeTracker();
  tracker.statuses.add("concept"); tracker.statuses.add("refinement");
  tracker.add({ id: "t1", key: "DGS-1", status: "refinement" });
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("escalate", () => {
  it("first escalation sets concept, reads it back, comments once, records escalations.jsonl and a decision", async () => {
    const r = await escalate(deps(), args());
    expect(r).toEqual({ outcome: "asked" });
    expect(tracker.tasks.get("t1")?.status).toBe("concept");
    expect(tracker.calls).toContain("getStatus t1");
    expect(tracker.comments).toEqual([{ ref: "DGS-1", text: "Director (2026-11-03 10:00:00 UTC+7): Which name?. Needs: product-taste-names-scope. Answer here, then move the ticket back to refinement." }]);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({ ticket: "DGS-1", id: "product-taste-names-scope", question: "Which name?", state: "open", askedAt: NOW.toISOString(), askedAtUtc7: "2026-11-03 10:00:00" });
    expect(readDecisions(dir)).toMatchObject([{ ticket: "DGS-1", id: "escalate-concept", side: "escalated" }]);
  });

  it("the same question again is refused with 'already asked' and opens an attention item once", async () => {
    await escalate(deps(), args());
    const r = await escalate(deps(), args());
    expect(r).toMatchObject({ outcome: "refused" });
    expect((r as { text: string }).text).toContain("already asked");
    await escalate(deps(), args());
    const items = readOpen(dir).filter((i) => i.cause === "question-already-asked");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ run: "DGS-1/escalation", kind: "unknown", ticket: "DGS-1" });
    expect(tracker.comments).toHaveLength(1);
  });

  it("an open escalation on a ticket still in concept does nothing for a new question", async () => {
    await escalate(deps(), args());
    const before = { c: tracker.comments.length, w: writes().length, l: lines().length };
    const r = await escalate(deps(), args({ question: "A different one?" }));
    expect(r).toEqual({ outcome: "already-open" });
    expect({ c: tracker.comments.length, w: writes().length, l: lines().length }).toEqual(before);
  });

  it("after markReturned the same question is refused with 'already asked and answered at <time>'; a different question is accepted", async () => {
    await escalate(deps(), args());
    now = new Date("2026-11-03T05:00:00.000Z"); // 12:00 UTC+7
    expect(markReturned(dir, "DGS-1", now)).toBe(1);
    tracker.tasks.get("t1")!.status = "refinement";
    const r = await escalate(deps(), args());
    expect(r).toMatchObject({ outcome: "refused" });
    expect((r as { text: string }).text).toContain("already asked and answered at 2026-11-03 12:00:00");
    expect(readOpen(dir).filter((i) => i.cause === "question-already-asked")).toHaveLength(1);
    const r2 = await escalate(deps(), args({ question: "Another thing?" }));
    expect(r2).toEqual({ outcome: "asked" });
    expect(tracker.tasks.get("t1")?.status).toBe("concept");
  });

  it("markReturned marks only the open lines of that ticket and counts them", async () => {
    await escalate(deps(), args());
    expect(markReturned(dir, "DGS-2", now)).toBe(0);
    expect(markReturned(dir, "DGS-1", now)).toBe(1);
    expect(markReturned(dir, "DGS-1", now)).toBe(0);
  });

  it("--via-release: no status write, still recorded and commented", async () => {
    tracker.tasks.get("t1")!.status = "in progress";
    const r = await escalate(deps(), args({ viaRelease: true }));
    expect(r).toEqual({ outcome: "asked" });
    expect(writes()).toEqual([]);
    expect(tracker.tasks.get("t1")?.status).toBe("in progress");
    expect(tracker.comments).toHaveLength(1);
    expect(lines()).toHaveLength(1);
    expect(readDecisions(dir)).toHaveLength(1);
  });

  it("status read-back mismatch throws and writes no escalation line", async () => {
    tracker.readBackWrong = true;
    await expect(escalate(deps(), args())).rejects.toThrow(/concept/);
    expect(() => readFileSync(join(dir, "escalations.jsonl"))).toThrow();
    expect(tracker.comments).toEqual([]);
  });

  it("key is ticket|id|sha1(lowercased, whitespace-collapsed question)", () => {
    const a = questionKey("DGS-1", "x", "Which  name?\n");
    expect(a).toMatch(/^DGS-1\|x\|[0-9a-f]{40}$/);
    expect(questionKey("DGS-1", "x", " which name? ")).toBe(a);
    expect(questionKey("DGS-1", "y", "which name?")).not.toBe(a);
  });

  it("two spellings of one question collide", async () => {
    await escalate(deps(), args({ question: "Which   name?" }));
    const r = await escalate(deps(), args({ question: "which name?" }));
    expect(r).toMatchObject({ outcome: "refused" });
  });
});
