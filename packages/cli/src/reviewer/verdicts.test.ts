import { describe, it, expect } from "vitest";
import { parseVerdictLines, judgementKey } from "./verdicts.ts";

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
  it("requires a reason for parked and rejected", () => {
    expect(() => parseVerdictLines("Review task 1 r1: F1 -> parked\n")).toThrow(/reason/);
    expect(() => parseVerdictLines("Review task 1 r1: F1 -> rejected ()\n")).toThrow(/ledger line 1/);
  });
});
