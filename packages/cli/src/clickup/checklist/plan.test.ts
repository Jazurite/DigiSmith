import { describe, it, expect } from "vitest";
import { parsePlanTasks, parseDoneKeys, parseLedgerDone } from "./plan.ts";

const sorted = (s: Set<string>) => [...s].sort();

describe("parsePlanTasks", () => {
  it("reads ### Task N: headings in plan order", () => {
    expect(parsePlanTasks("# P\n\n### Task 1: Client calls\n\nbody\n\n### Task 2:   Parse the plan  \n")).toEqual([
      { n: 1, name: "Task 1: Client calls" },
      { n: 2, name: "Task 2: Parse the plan" },
    ]);
  });

  it("skips headings inside fenced code blocks, also four-backtick and tilde fences", () => {
    const plan = [
      "### Task 1: Real",
      "````markdown",
      "### Task 9: Inside four backticks",
      "```ts",
      "### Task 8: Nested three backticks",
      "```",
      "````",
      "~~~",
      "### Task 7: Inside tildes",
      "~~~",
      "### Task 2: Also real",
    ].join("\n");
    expect(parsePlanTasks(plan).map((t) => t.n)).toEqual([1, 2]);
  });

  it("ignores other heading levels and Task headings without a number", () => {
    expect(parsePlanTasks("## Task 1: Two\n### Task final: x\n#### Task 3: four\n### Task 4: ok\n")).toEqual([{ n: 4, name: "Task 4: ok" }]);
  });

  it("throws on no task headings and on a repeated number", () => {
    expect(() => parsePlanTasks("# nothing\n")).toThrow('no "### Task N: <title>" headings');
    expect(() => parsePlanTasks("### Task 1: a\n### Task 1: b\n")).toThrow("Task 1 twice");
  });
});

describe("parseDoneKeys", () => {
  it("reads every key form", () => {
    const d = parseDoneKeys("1, 1.implement,1.review,1.fix:none, 2.fix, final.review,final.fix:none");
    expect(sorted(d.keys)).toEqual(["1", "1.fix", "1.implement", "1.review", "2.fix", "final.fix", "final.review"]);
    expect(sorted(d.noneNeeded)).toEqual(["1.fix", "final.fix"]);
  });
  it("an empty string is nothing done", () => {
    expect(parseDoneKeys("").keys.size).toBe(0);
  });
  it("refuses a bad key", () => {
    for (const bad of ["x", "0", "1.build", "1.review:none", "final", "final.implement"]) {
      expect(() => parseDoneKeys(bad)).toThrow(`--done: "${bad}" is not an item key`);
    }
  });
});

describe("parseLedgerDone", () => {
  it("maps SDD ledger lines to keys", () => {
    const ledger = [
      "# SDD ledger — plan: x/plan.md",
      "Review mode: hand",
      "Task 1: dispatch implementer agent=a1",
      "Task 1: implemented",
      "Task 1: reviewed (clean)",
      "Task 1: complete (commits a..b, review clean)",
      "Task 2: implemented",
      "Task 2: reviewed (2 findings)",
      "Task 2: fix round 1/5 (2 addressed, 0 open; commits b..c)",
      "Task 2: complete (commits b..c, review clean)",
      "Task 3: implemented",
      "Task 3: reviewed (1 findings)",
      "Task final: reviewed (clean)",
      "Task final: complete",
    ].join("\n");
    const d = parseLedgerDone(ledger);
    expect(sorted(d.keys)).toEqual([
      "1.fix", "1.implement", "1.review", "2.fix", "2.implement", "2.review", "3.implement", "3.review", "final.fix", "final.review",
    ]);
    expect(sorted(d.noneNeeded)).toEqual(["1.fix", "final.fix"]);
  });

  it("role mode: review requested means implemented; a fixed verdict line means a fix happened", () => {
    const ledger = [
      "Task 1: review requested",
      "Review task 1 r1: F1 -> fixed (abc1234)",
      "Task 1: complete (commits a..b, review clean)",
      "- Task 2: complete (commits c..d, self-check: ok)",
      "Task final: review requested",
    ].join("\n");
    const d = parseLedgerDone(ledger);
    expect(sorted(d.keys)).toEqual(["1.fix", "1.implement", "1.review", "2.fix", "2.implement", "2.review"]);
    expect(sorted(d.noneNeeded)).toEqual(["2.fix"]);
  });

  it("a whole-branch fix wave keeps final.fix from reading none needed", () => {
    const a = parseLedgerDone("Task final: reviewed (3 findings)\nTask final: dispatch fix agent=f1\nTask final: complete\n");
    expect(a.noneNeeded.has("final.fix")).toBe(false);
    const b = parseLedgerDone("Task final: reviewed (1 findings)\nReview ticket final r1: F1 -> fixed (x)\nTask final: complete\n");
    expect(b.noneNeeded.has("final.fix")).toBe(false);
    expect(b.keys.has("final.fix")).toBe(true);
  });

  it("an empty ledger is nothing done", () => {
    expect(parseLedgerDone("").keys.size).toBe(0);
  });
});
