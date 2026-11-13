import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
// `|| true` keeps a non-zero exit from blocking, so the sentence tells the agent to read the line the command printed.
const NEVER_BLOCKS = "The command prints its own line on a refusal or an error; `|| true` keeps a non-zero exit from blocking. Read the printed line and go on.";

// One row per hook point of spec 3. Task 5 adds the merge-time rows.
export const HOOK_ROWS: { file: string; line: string }[] = [
  { file: "skills/bootstrap/SKILL.md", line: "dg steward event refinement-started --ticket <Key> --hook --by worker" },
  { file: "skills/adopt/SKILL.md", line: "dg steward event refinement-started --ticket <Key> --hook --by worker" },
  { file: "skills/subagent-driven-development/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/subagent-driven-development/SKILL.md", line: "dg steward event review-started --ticket <Key> --hook --by worker" },
  { file: "skills/executing-plans/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/init/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/finishing-a-development-branch/SKILL.md", line: "dg steward event merged --ticket <Key> --hook --by finishing --sha <merge-commit-sha>" },
  { file: "skills/finishing-a-development-branch/SKILL.md", line: "dg steward event documented --ticket <Key> --hook --by finishing" },
  { file: "skills/report-implementation/SKILL.md", line: "dg steward event documented --ticket <Key> --hook --by report" },
];

const GATES = ["shaped", "approved", "accepted", "completed", "discard", "close", "filed", "discovery-started", "release-started", "released", "returned"];

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
  it("the Reviewer stays read-only: no Reviewer file sends a Steward event", () => {
    for (const f of ["skills/reviewer/SKILL.md", "skills/reviewer/brief.md"]) {
      expect(readFileSync(root + f, "utf-8"), f).not.toMatch(/dg steward event/);
    }
  });
  it("no skill hook sends a gate or a version-2 event", () => {
    for (const row of HOOK_ROWS) {
      const ev = /dg steward event (\S+)/.exec(row.line)![1];
      expect(GATES).not.toContain(ev);
    }
  });
});
