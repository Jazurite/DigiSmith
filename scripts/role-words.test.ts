import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// DGS-191 / DGS-403: the role words are Maestro (a session outside herdr that represents Jack)
// and conductor (the project's head butler, inside herdr). The old role words "Master" and
// lowercase "maestro" must not come back in skill text. Identifiers stay: anything inside
// backticks (`digismith-maestro`, `maestro-review`) and the literal lineage title "K: Maestro".

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIRS = ["skills", ".opencode/skills"];

function mdFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? mdFiles(p) : p.endsWith(".md") ? [p] : [];
  });
}

function oldRoleWords(text: string): string[] {
  const stripped = text
    .replace(/`[^`\n]*`/g, "")
    .replace(/K:\s*\n?\s*Maestro/g, "")
    .replace(/main\/master/g, "");
  return stripped.match(/\bMasters?\b|\bmaestros?\b/g) ?? [];
}

describe("oldRoleWords", () => {
  it("flags Master and lowercase maestro", () => {
    expect(oldRoleWords("Orders from the Master. The maestro closes it.")).toEqual(["Master", "maestro"]);
  });
  it("ignores identifiers, the K: Maestro title, main/master and the new Maestro", () => {
    expect(oldRoleWords("`digismith-maestro` \"K: Maestro\" main/master branch. The Maestro and the master copy.")).toEqual([]);
  });
});

describe("skill text uses the new role names", () => {
  const files = SKILL_DIRS.flatMap((d) => mdFiles(path.join(root, d)));
  it("finds skill files", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const f of files) {
    it(path.relative(root, f), () => {
      expect(oldRoleWords(fs.readFileSync(f, "utf8"))).toEqual([]);
    });
  }
});
