import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => fs.readFileSync(path.join(root, "skills", "researcher", f), "utf8");

describe("researcher card and brief", () => {
  it("the card has the frontmatter name and the one-write rule", () => {
    const card = read("SKILL.md");
    expect(card).toMatch(/^---\nname: researcher\n/);
    expect(card).toContain("~/Workspace/Library/<name>");
    expect(card).toContain("Its ONE write");
  });
  for (const f of ["SKILL.md", "brief.md"]) {
    it(`${f} says no repo write, no ClickUp write, no commit, no push`, () => {
      const t = read(f).toLowerCase();
      for (const s of ["no write in the digismith repo", "no clickup write", "no commit", "no push"]) expect(t).toContain(s);
    });
  }
  it("the card names the conductor spawn path and the run role", () => {
    const card = read("SKILL.md");
    expect(card).toContain("Start of a researcher");
    expect(card).toContain("dg run start");
    expect(card).toContain("--role other");
    expect(card).toContain("-researcher");
  });
  it("the card names where the other cards live", () => {
    expect(read("SKILL.md")).toContain("skills/reviewer/SKILL.md");
  });
  it("the brief has every placeholder", () => {
    const b = read("brief.md");
    for (const p of ["{{AGENT}}", "{{KEY}}", "{{SUBJECT}}", "{{NAME}}", "{{FINDINGS}}", "{{PLUGIN_ROOT}}"]) expect(b).toContain(p);
  });
  it("the card puts the four prohibitions under the may-not heading", () => {
    const card = read("SKILL.md");
    const section = card.slice(card.indexOf("## What it may not do"), card.indexOf("## Process")).toLowerCase();
    for (const s of ["no write in the digismith repo", "no clickup write", "no commit", "no push"]) expect(section).toContain(s);
  });
  it("the brief's session registration --role value is a tokens role", () => {
    const m = read("brief.md").match(/entry\.ts session --ticket \{\{KEY\}\} --role (\S+?)`/);
    expect(m).not.toBeNull();
    const src = fs.readFileSync(path.join(root, "packages", "cli", "src", "tokens", "entry.ts"), "utf8");
    const roles = src.match(/const ROLES: readonly Role\[\] = \[([^\]]*)\]/);
    expect(roles).not.toBeNull();
    const list = roles![1].split(",").map((s) => s.trim().replace(/"/g, ""));
    expect(list).toContain(m![1]);
  });
});
