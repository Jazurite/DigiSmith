import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { REVIEWER_TYPES, SONNET, OPUS, TASK_ESCALATE_LINES } from "./types.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const card = fs.readFileSync(path.join(ROOT, "skills/reviewer/SKILL.md"), "utf8");
const brief = fs.readFileSync(path.join(ROOT, "skills/reviewer/brief.md"), "utf8");

describe("skills/reviewer/SKILL.md", () => {
  it("has frontmatter with name reviewer", () => {
    const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(card);
    expect(fm?.[1]).toBe("reviewer");
    expect(fm?.[2]).toMatch(/Reviewer role/);
  });
  it("has a type table row for each reviewer type, from the constant", () => {
    for (const t of REVIEWER_TYPES) expect(card).toMatch(new RegExp(`^\\| \`${t}\` \\|`, "m"));
  });
  it("states the model policy with the constants", () => {
    expect(card).toContain(SONNET);
    expect(card).toContain(OPUS);
    expect(card).toContain(String(TASK_ESCALATE_LINES));
    expect(card).toMatch(/never pick(s)? the model|do not pick the model/i);
  });
  it("names each primitive file that exists on disk", () => {
    for (const rel of [
      "skills/requesting-code-review/code-reviewer.md",
      "skills/subagent-driven-development/task-reviewer-prompt.md",
      "skills/subagent-driven-development/re-review-prompt.md",
    ]) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
      expect(card).toContain(path.basename(rel));
    }
  });
  it("states the rules: judge only, no Builder starts a review, hand mode stays", () => {
    expect(card).toMatch(/never fix(es)?, never merge/i);
    expect(card).toMatch(/Builder never starts or runs a review/);
    expect(card).toMatch(/hand mode/i);
    expect(card).toContain("DIGISMITH_REVIEW_MODE");
  });
  it("tells the conductor how it notices a STOP and when to escalate", () => {
    expect(card).toMatch(/keeps a watch \(Monitor\)/);
    expect(card).toContain("STOP: task-review-ready");
    expect(card).toMatch(/15 minutes/);
    expect(card).toMatch(/reported to the Maestro/);
  });
  it("names the markers, the findings block and the table command", () => {
    for (const s of ["STOP: task-review-ready", "STOP: ticket-review-ready", "json findings", "dg reviewer table", "dg reviewer pack"]) {
      expect(card).toContain(s);
    }
  });
});

describe("skills/reviewer/brief.md", () => {
  it("uses exactly the five placeholders", () => {
    const found = new Set([...brief.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]));
    expect([...found].sort()).toEqual(["AGENT", "KEY", "PACK", "PLUGIN_ROOT", "TYPE"]);
  });
  it("tells the Reviewer to judge only, write one report and register its session", () => {
    expect(brief).toMatch(/never edit/i);
    expect(brief).toContain("report.md");
    expect(brief).toContain("entry.ts session --ticket {{KEY}} --role reviewer");
    expect(card).toContain("--role reviewer");
  });
});
