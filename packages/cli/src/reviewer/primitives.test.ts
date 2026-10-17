import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFindings } from "./findings.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const FILES = [
  "skills/requesting-code-review/code-reviewer.md",
  "skills/subagent-driven-development/task-reviewer-prompt.md",
  "skills/subagent-driven-development/re-review-prompt.md",
];
const HEADER = "Used by the Reviewer role (DGS-529). In role mode a conductor or a Maestro starts this review, never a Builder. Outside role mode it runs as before.";
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("the three primitive prompts", () => {
  for (const rel of FILES) {
    describe(rel, () => {
      const text = read(rel);
      it("has the owner header on the line after the title", () => {
        const lines = text.split("\n");
        expect(lines[0]).toMatch(/^# /);
        expect(lines[1]).toBe("");
        expect(lines[2]).toBe(HEADER);
      });
      it("has a Findings Block section", () => {
        expect(text).toContain("## Findings Block");
        expect(text).toContain("```json findings");
      });
      it("keeps its example block parseable by the table's own parser", () => {
        const m = /([ ]*)```json findings\n([\s\S]*?)\n[ ]*```/.exec(text);
        expect(m).not.toBeNull();
        const example = "```json findings\n" + m![2].split("\n").map((l) => l.slice(m![1].length)).join("\n") + "\n```\n";
        expect(extractFindings(example, rel)).toHaveLength(1);
      });
    });
  }
  it("keeps the original placeholders of each prompt", () => {
    expect(read(FILES[0])).toContain("[CHECK_ATTRIBUTION_PATH]");
    expect(read(FILES[1])).toContain("[BRIEF_FILE]");
    expect(read(FILES[1])).toContain("[DIFF_FILE]");
    expect(read(FILES[2])).toContain("[FINDINGS]");
    expect(read(FILES[2])).toContain("[FIX_BASE_SHA]");
  });
  it("PROVENANCE records the divergence", () => {
    expect(read("vendored/PROVENANCE.md")).toContain("Further diverged by DGS-529");
  });
});
