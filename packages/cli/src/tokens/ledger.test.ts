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
});
