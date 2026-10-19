import { describe, expect, it } from "vitest";
import { parseTaskAgents } from "./ledger.ts";

describe("parseTaskAgents", () => {
  it("collects the agent ids of each task from dispatch lines", () => {
    const text = [
      "# SDD ledger — plan: plan.md",
      "Task 1: dispatch implementer agent=a111",
      "Task 1: dispatch task-reviewer agent=a222",
      "Task 1: complete (commits a..b, review clean)",
      "Task 2: dispatch implementer agent=a333",
    ].join("\n");
    expect(parseTaskAgents(text)).toEqual({ "1": ["a111", "a222"], "2": ["a333"] });
  });
  it("returns an empty map for a ledger with no dispatch lines", () => {
    expect(parseTaskAgents("# SDD ledger — plan: plan.md\nTask 1: complete")).toEqual({});
  });
  it("reads the agent id when a note follows it", () => {
    const text = [
      "Task 1: dispatch implementer agent=a32df36e0289500f4 (mechanical-tier offload unavailable)",
      "Task 2: dispatch implementer agent=a99ffa9025700b79d (base 47badfb)",
      "Task 2: dispatch task-reviewer agent=a1391313bd322afcb (head 3c32731)",
      "Task final: dispatch fix agent=a25508789c9547a44 (one fix wave, base 7f4bce6)",
    ].join("\n");
    expect(parseTaskAgents(text)).toEqual({
      "1": ["a32df36e0289500f4"],
      "2": ["a99ffa9025700b79d", "a1391313bd322afcb"],
      final: ["a25508789c9547a44"],
    });
  });
  it("skips a dispatch line with no agent id and keeps the id clean of the note", () => {
    const text = ["Task final: dispatch final-reviewer (opus)", "Task 3: dispatch implementer agent=a777(base abc1234)"].join("\n");
    expect(parseTaskAgents(text)).toEqual({});
  });
});
