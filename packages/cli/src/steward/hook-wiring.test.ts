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
  it("no skill hook sends a gate or a version-2 event", () => {
    for (const row of HOOK_ROWS) {
      const ev = /dg steward event (\S+)/.exec(row.line)![1];
      expect(GATES).not.toContain(ev);
    }
  });
});
