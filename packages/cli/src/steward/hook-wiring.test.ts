import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const NEVER_BLOCKS = "A non-zero exit never blocks: print a warning and go on.";

// One row per hook point of spec 3. Task 5 adds the merge-time rows.
export const HOOK_ROWS: { file: string; line: string }[] = [
  { file: "skills/bootstrap/SKILL.md", line: "dg steward event refinement-started --ticket <Key> --hook --by worker" },
  { file: "skills/adopt/SKILL.md", line: "dg steward event refinement-started --ticket <Key> --hook --by worker" },
  { file: "skills/subagent-driven-development/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/subagent-driven-development/SKILL.md", line: "dg steward event review-started --ticket <Key> --hook --by worker" },
  { file: "skills/executing-plans/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/init/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/reviewer/SKILL.md", line: "dg steward event review-started --ticket <Key> --hook --by reviewer" },
  { file: "skills/finishing-a-development-branch/SKILL.md", line: "dg steward event merged --ticket <Key> --hook --by finishing --sha <merge-commit-sha>" },
  { file: "skills/finishing-a-development-branch/SKILL.md", line: "dg steward event documented --ticket <Key> --hook --by finishing" },
  { file: "skills/report-implementation/SKILL.md", line: "dg steward event documented --ticket <Key> --hook --by report" },
];

const GATES = ["shaped", "approved", "accepted", "completed", "discard", "close", "filed", "discovery-started", "release-started", "released"];

describe("hook wiring (spec 3)", () => {
  for (const row of HOOK_ROWS) {
    it(`${row.file} sends: ${row.line}`, () => {
      const text = readFileSync(root + row.file, "utf-8");
      expect(text).toContain(row.line);
      // the sentence follows THIS hook block (its closing fence), not just anywhere in the file
      const after = text.slice(text.indexOf(`${row.line} || true`));
      const close = after.indexOf("```");
      expect(after.slice(close + 3).trimStart().startsWith(NEVER_BLOCKS)).toBe(true);
    });
    // yargs can still exit non-zero before the handler runs, so every hook line ends with `|| true`.
    it(`${row.file} ends the line with || true: ${row.line}`, () => {
      expect(readFileSync(root + row.file, "utf-8")).toContain(`${row.line} || true`);
    });
  }
  it("the reviewer hook is for a ticket review only and a key is needed", () => {
    const text = readFileSync(root + "skills/reviewer/SKILL.md", "utf-8");
    const at = text.indexOf("dg steward event review-started");
    const bullet = text.slice(text.lastIndexOf("\n- ", at), at);
    expect(bullet).toContain("`type: ticket`");
    expect(bullet).toContain("a ticket key");
    expect(bullet).toMatch(/`type: task` review sends nothing/);
  });
  it("finishing sends merged only in Option 1, never in Option 2 (PR), keep or discard", () => {
    const text = readFileSync(root + "skills/finishing-a-development-branch/SKILL.md", "utf-8");
    const opt1 = text.indexOf("### Option 1: Merge Locally");
    const opt2 = text.indexOf("### Option 2: Push and Create PR");
    const at = text.indexOf("dg steward event merged");
    expect(at).toBeGreaterThan(opt1);
    expect(at).toBeLessThan(opt2);
    expect(text.indexOf("dg steward event merged", at + 1)).toBe(-1);
    // right after the push, before the post-finish hooks fire
    expect(at).toBeLessThan(text.indexOf("fire the `post-finish` lifecycle hook"));
    expect(at).toBeGreaterThan(text.indexOf("git push origin <base-branch>"));
  });
  it("no skill hook sends a gate or a version-2 event", () => {
    for (const row of HOOK_ROWS) {
      const ev = /dg steward event (\S+)/.exec(row.line)![1];
      expect(GATES).not.toContain(ev);
    }
  });
});
