import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (s: string) => readFileSync(join(ROOT, "skills", s, "SKILL.md"), "utf8");
const SYNC = "dg clickup checklist sync --task <Key> --plan PLAN_FILE --ledger <workspace>/progress.md --yes";
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("DGS-631: writing-plans creates the checklist", () => {
  const s = read("writing-plans");
  it("has a named step that syncs once after the plan commit, DGS keys only, never blocking", () => {
    expect(s).toContain("### Plan checklist (DGS-631)");
    expect(s).toContain("dg clickup checklist sync --task <Key> --plan <plan.md path> --yes");
    expect(s).toContain("Plan checklist: skipped (no ClickUp key)");
    expect(s).toMatch(/never blocks/);
    expect(s.indexOf("### Plan checklist (DGS-631)")).toBeLessThan(s.indexOf("## Scope Check"));
  });
});

describe("DGS-634: SDD ticks the checklist", () => {
  const s = read("subagent-driven-development");
  it("has one section with the command, the ledger lines and the never-blocks rule, before Role Mode", () => {
    const sec = s.indexOf("## Plan Checklist (DGS-634)");
    expect(sec).toBeGreaterThan(-1);
    expect(sec).toBeLessThan(s.indexOf("## Role Mode (a herdr Builder)"));
    for (const line of ["`Task <N>: implemented`", "`Task <N>: reviewed (clean)`", "`Task <N>: reviewed (<K> findings)`", "`Task final: reviewed (clean)`", "`Task final: complete`", "Checklist sync: failed ("]) {
      expect(s).toContain(line);
    }
    expect(s).toContain(SYNC);
    expect(s).toMatch(/plan revision/);
  });
  it("points to the section at each event: implementer done, task verdict, task complete, final verdict, final clean", () => {
    expect(count(s, "(Plan Checklist (DGS-634))")).toBeGreaterThanOrEqual(5);
    const step2 = s.indexOf("### 2. Handle the report");
    const step3 = s.indexOf("### 3. Review the task");
    expect(s.slice(step2, step3)).toContain("Task <N>: implemented");
    const step5 = s.indexOf("### 5. Complete the task");
    expect(s.slice(step5, s.indexOf("## Plan Checklist (DGS-634)"))).toContain("(Plan Checklist (DGS-634))");
    const fin = s.slice(s.indexOf("## Final Review"), s.indexOf("## Finish"));
    expect(fin).toContain("Task final: reviewed");
    expect(fin).toContain("Task final: complete");
  });
});

describe("DGS-634: executing-plans ticks the checklist", () => {
  const s = read("executing-plans");
  it("syncs after each task and once in Step 3", () => {
    expect(s).toContain("Plan checklist (DGS-634)");
    expect(count(s, SYNC)).toBeGreaterThanOrEqual(2);
    expect(s).toContain("Checklist sync: failed (");
    const step3 = s.indexOf("### Step 3: Complete Development");
    expect(s.indexOf(SYNC, step3)).toBeGreaterThan(step3);
  });
});
