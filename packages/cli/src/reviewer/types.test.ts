import { describe, it, expect } from "vitest";
import { REVIEWER_TYPES, SEVERITIES, SONNET, OPUS, TASK_ESCALATE_LINES, modelFor, countChangedLines } from "./types.ts";

describe("constants", () => {
  it("has exactly the two types and three severities", () => {
    expect([...REVIEWER_TYPES]).toEqual(["task", "ticket"]);
    expect([...SEVERITIES]).toEqual(["Critical", "Important", "Minor"]);
  });
  it("holds the model ids and the limit", () => {
    expect(SONNET).toBe("claude-sonnet-5-5");
    expect(OPUS).toBe("claude-opus-5-5");
    expect(TASK_ESCALATE_LINES).toBe(800);
  });
});

describe("modelFor", () => {
  it("gives Sonnet to a task at or under the limit", () => {
    expect(modelFor("task", 0)).toBe(SONNET);
    expect(modelFor("task", 800)).toBe(SONNET);
  });
  it("gives Opus to a task over the limit", () => {
    expect(modelFor("task", 801)).toBe(OPUS);
  });
  it("always gives Opus to a ticket", () => {
    expect(modelFor("ticket", 0)).toBe(OPUS);
    expect(modelFor("ticket", 5000)).toBe(OPUS);
  });
});

describe("countChangedLines", () => {
  const diff = [
    "# Review package: a1b2c3d..e4f5a6b",
    "",
    "- e4f5a6b fix: something",
    "",
    "diff --git a/x.ts b/x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -1,2 +1,3 @@",
    " keep",
    "-old",
    "+new",
    "+added",
  ].join("\n");
  it("counts added and removed lines, not file headers", () => {
    expect(countChangedLines(diff)).toBe(3);
  });
  it("counts nothing before the first diff header", () => {
    expect(countChangedLines("- a commit line\n+ not a diff line\n")).toBe(0);
  });
  it("counts across two files", () => {
    const two = `${diff}\ndiff --git a/y.ts b/y.ts\n--- a/y.ts\n+++ b/y.ts\n@@ -1 +1 @@\n-a\n+b\n`;
    expect(countChangedLines(two)).toBe(5);
  });
});
