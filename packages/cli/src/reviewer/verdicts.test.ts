import { describe, it, expect } from "vitest";
import { parseVerdictLines, parseVerdictEntries, judgementKey } from "./verdicts.ts";

describe("parseVerdictLines", () => {
  const ledger = [
    "# SDD ledger — plan: plan.md",
    "Task 1: complete (commits a..b, review clean)",
    "Review ticket final r1: F1 -> fixed (commit a7f3c2d)",
    "Review task 7 r2: F2 -> parked (reviewer wrong: the test asserts the cap)",
    "- Review task 3 r1: F1 -> rejected (out of scope per plan line 40)",
    "Review task 4 r1: F1 -> fixed",
  ].join("\n");

  it("reads every verdict line and ignores other ledger lines", () => {
    const m = parseVerdictLines(ledger);
    expect(m.size).toBe(4);
    expect(m.get(judgementKey("ticket", "final", 1, "F1"))).toEqual({ verdict: "fixed", reason: "commit a7f3c2d" });
    expect(m.get(judgementKey("task", "7", 2, "F2"))).toEqual({ verdict: "parked", reason: "reviewer wrong: the test asserts the cap" });
    expect(m.get(judgementKey("task", "3", 1, "F1"))?.verdict).toBe("rejected");
    expect(m.get(judgementKey("task", "4", 1, "F1"))).toEqual({ verdict: "fixed", reason: "" });
  });
  it("lets a later line replace an earlier one for the same finding", () => {
    const m = parseVerdictLines("Review task 1 r1: F1 -> parked (later)\nReview task 1 r1: F1 -> fixed (commit abc1234)\n");
    expect(m.get(judgementKey("task", "1", 1, "F1"))?.verdict).toBe("fixed");
  });
  it("fails on a Review line that is not a verdict line, with its line number", () => {
    expect(() => parseVerdictLines("ok\nReview task 1 r1: F1 -> maybe (x)\n")).toThrow(/ledger line 2/);
  });
  it("skips role-mode lines like 'Review mode: role'", () => {
    const m = parseVerdictLines("Review mode: role\nReview mode: hand\nReview task 1 r1: F1 -> fixed (commit abc1234)\n");
    expect(m.size).toBe(1);
  });
  it("requires a reason for parked and rejected", () => {
    expect(() => parseVerdictLines("Review task 1 r1: F1 -> parked\n")).toThrow(/reason/);
    expect(() => parseVerdictLines("Review task 1 r1: F1 -> rejected ()\n")).toThrow(/ledger line 1/);
  });
  it("skips fixing lines, so a later fixing does not replace a fixed judgement", () => {
    const m = parseVerdictLines("Review task 2 r1: F1 -> fixed (6310adc)\nReview task 2 r1: F1 -> fixing (again)\nReview task 2 r1: F2 -> fixing\n");
    expect(m.size).toBe(1);
    expect(m.get(judgementKey("task", "2", 1, "F1"))?.verdict).toBe("fixed");
  });
});

describe("parseVerdictEntries", () => {
  it("keeps every verdict line in ledger order with its line number", () => {
    const e = parseVerdictEntries(
      "# SDD ledger\nReview task 1 r1: F1 -> parked (wait)\nTask 1: complete\nReview task 1 r2: F1 -> fixed (commit abc1234)\n",
    );
    expect(e.map((x) => [x.line, x.kind, x.id, x.round, x.finding, x.verdict, x.reason])).toEqual([
      [2, "task", "1", 1, "F1", "parked", "wait"],
      [4, "task", "1", 2, "F1", "fixed", "commit abc1234"],
    ]);
    expect(e[1].text).toBe("Review task 1 r2: F1 -> fixed (commit abc1234)");
  });
  it("fails like parseVerdictLines on a bad Review line", () => {
    expect(() => parseVerdictEntries("Review task 1 r1: F1 -> maybe (x)\n")).toThrow(/ledger line 1/);
  });
});

describe("parseVerdictEntries fixing", () => {
  it("accepts fixing with and without a reason", () => {
    const e = parseVerdictEntries("Review task 2 r1: F1 -> fixing (check every commit)\nReview task 2 r1: F3 -> fixing\n");
    expect(e.map((x) => [x.finding, x.verdict, x.reason])).toEqual([
      ["F1", "fixing", "check every commit"],
      ["F3", "fixing", ""],
    ]);
  });
});
