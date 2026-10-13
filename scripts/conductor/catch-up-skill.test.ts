import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const text = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "catch-up", "SKILL.md"), "utf8");

describe("skills/catch-up", () => {
  const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(text);
  it("has frontmatter whose description names the intent", () => {
    expect(fm?.[1]).toBe("catch-up");
    expect(fm?.[2]).toMatch(/wants to be brought up to date/);
  });
  it("runs the conductor command path and keeps the fixed order rule", () => {
    expect(text).toContain("scripts/conductor/catch-up-cli.ts");
    expect(text).toMatch(/fixed/);
  });
  it("matches by meaning: no regex or keyword-list machinery in the skill", () => {
    expect(text).toMatch(/no keyword list/);
    expect(text).not.toMatch(/regex|\bmatch(es)? (the )?(word|phrase)s?\b: /i);
  });
});
