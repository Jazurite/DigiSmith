import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = fs.readFileSync(path.join(root, "skills", "study", "SKILL.md"), "utf8");
const description = skill.match(/^description: (.*)$/m)?.[1] ?? "";

describe("study skill", () => {
  it("has the frontmatter name", () => {
    expect(skill).toMatch(/^---\nname: study\n/);
  });
  it("the description triggers on the intent", () => {
    for (const s of ["study X", "research this repo", "GitHub link"]) expect(description).toContain(s);
  });
  it("the description excludes work inside DigiSmith's own code", () => {
    for (const s of ["fix this bug", "review this branch"]) expect(description).toContain(s);
  });
  it("names the researcher card, its spawn path and the order folder", () => {
    for (const s of ["skills/researcher/SKILL.md", "Start of a researcher", "~/.digismith-depot/sessions/<project>/orders/", "--role other"]) expect(skill).toContain(s);
  });
  it("says the Maestro does not research itself", () => {
    expect(skill).toContain("The Maestro does not research itself");
  });
  it("does not order a scout", () => {
    expect(skill).not.toMatch(/orders? (a|the) scout|role `scout`/i);
  });
  it("names the clone, the findings file and the ticket rules", () => {
    for (const s of ["~/Workspace/Library/<name>", "~/.digismith-depot/research/<name>.md", "dg clickup", "Spike", "backlog", "A ticket is not an order"]) expect(skill).toContain(s);
  });
});
