import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const text = readFileSync(resolve(root, "skills", "finishing-a-development-branch", "SKILL.md"), "utf8");
const option1 = text.slice(text.indexOf("### Option 1"), text.indexOf("### Option 2"));
const option2 = text.slice(text.indexOf("### Option 2"), text.indexOf("### Option 3"));

describe("finishing merge-comment wiring", () => {
  it("Option 1 posts the merge comment, ending || true", () => {
    const line = option1.split("\n").find((l) => l.trimStart().startsWith("dg clickup merge-comment"));
    expect(line).toBeDefined();
    expect(line!.trimEnd()).toMatch(/\|\| true$/);
    expect(line).toContain("--task <Key>");
    expect(line).toContain("--base <pre-merge-sha>");
    expect(line).toContain("--head <merge-commit-sha>");
    expect(line).toContain("--board-folder <board folder>");
    expect(line).toContain("--yes");
  });
  it("sits after the report attach and before documented", () => {
    const at = option1.indexOf("dg clickup merge-comment");
    expect(at).toBeGreaterThan(option1.indexOf("attach-record --task <Key> --file <board folder>/report.html"));
    expect(at).toBeLessThan(option1.indexOf("dg steward event documented"));
  });
  it("only Option 1 posts it", () => {
    expect(option2).not.toContain("merge-comment");
    expect(text.split("dg clickup merge-comment").length - 1).toBe(1);
  });
  it("reads both pins in the merged event block, before cleanup", () => {
    const merged = option1.indexOf("dg steward event merged");
    const blockStart = option1.lastIndexOf("Send the Steward the merge (DGS-551).", merged);
    const blockEnd = option1.indexOf("Once the push succeeds, fire the `post-finish` lifecycle hook", merged);
    const cleanup = option1.indexOf("run the post-merge cleanup (Step 6)");
    const headRead = option1.indexOf("git rev-parse refs/digismith/post-finish/<feature-branch>/head", blockStart);
    const baseRead = option1.indexOf("git rev-parse refs/digismith/post-finish/<feature-branch>/base", blockStart);
    expect(merged).toBeGreaterThan(-1);
    expect(blockStart).toBeGreaterThan(-1);
    expect(blockEnd).toBeGreaterThan(merged);
    expect(cleanup).toBeGreaterThan(blockEnd);
    for (const at of [headRead, baseRead]) {
      expect(at).toBeGreaterThan(blockStart);
      expect(at).toBeLessThan(blockEnd);
      expect(at).toBeLessThan(cleanup);
    }
  });
  it("names the ledger line on a printed warn: and never blocks", () => {
    expect(option1).toContain("append `Merge comment: failed (<that line>)` to the ledger when one exists");
    expect(option1).toMatch(/never blocks finishing/);
  });
  it("keeps the four free-text fields and the no-go list in the text", () => {
    for (const w of ["--tests", "--decisions", "--next", "--split-off"]) expect(option1).toContain(w);
    expect(option1).toMatch(/No status change, no file, no token number/);
  });
});
