import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const text = fs.readFileSync(path.join(ROOT, "skills/report-implementation/SKILL.md"), "utf8");

describe("report-implementation", () => {
  it("keeps its old steps", () => {
    for (const s of ["### Step 4: Write and Commit", "### Step 5: Hand Back", "git check-ignore -q <target folder>/report.html"]) {
      expect(text).toContain(s);
    }
  });
  it("has the findings table step between Step 4 and Step 5", () => {
    const a = text.indexOf("### Step 4a: Findings table");
    expect(a).toBeGreaterThan(text.indexOf("### Step 4: Write and Commit"));
    expect(a).toBeLessThan(text.indexOf("### Step 5: Hand Back"));
  });
  it("runs the command only when reviews exist and says what to do on failure", () => {
    expect(text).toContain("dg reviewer table --workspace");
    expect(text).toContain("findings.md");
    expect(text).toMatch(/no `reviews\/` folder|nothing to do/);
    expect(text).toMatch(/stop and report/);
  });
  it("commits the findings table after the report commit and skips an empty reviews folder", () => {
    const a = text.indexOf("### Step 4a: Findings table");
    const sec = text.slice(a, text.indexOf("### Step 5: Hand Back"));
    expect(sec).toContain("docs: add findings table");
    expect(sec).toContain("no reviews found");
  });
});
