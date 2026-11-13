import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const skill = (n: string) => readFileSync(resolve(root, "skills", n, "SKILL.md"), "utf8");
const hooks: [string, RegExp][] = [
  ["brainstorming", /attach-record --task <Key> --file .*(spec\.md|design\.html)/],
  ["writing-plans", /attach-record --task <Key> --file .*plan\.md/],
  ["subagent-driven-development", /attach-record --task <Key> --kind reviews/],
  ["subagent-driven-development", /attach-record --task <Key> --kind ledger-summary/],
  ["report-implementation", /attach-record --task <Key> --file .*report\.html/],
  ["finishing-a-development-branch", /attach-record --task <Key> --file <snapshot file>/],
  ["executing-plans", /attach-record --task <Key> --kind ledger-summary/],
];

describe("attach-record hook wiring", () => {
  for (const [name, re] of hooks) it(`${name} sends ${re.source.slice(0, 40)}`, () => { expect(skill(name)).toMatch(re); });
  it("every attach-record command ends with || true", () => {
    for (const n of new Set(hooks.map((h) => h[0]))) {
      const lines = skill(n).split("\n").filter((l) => l.trimStart().startsWith("dg clickup attach-record"));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(l.trimEnd()).toMatch(/\|\| true$/);
    }
  });
  it("every skill that attaches says a failure never blocks", () => {
    for (const n of new Set(hooks.map((h) => h[0]))) expect(skill(n)).toMatch(/Attach record: failed/);
  });
  it("the reviews and summary go before the workspace is deleted", () => {
    const t = skill("subagent-driven-development");
    const del = t.indexOf("rm -rf <workspace>");
    const reviews = t.indexOf("--kind reviews");
    const summary = t.indexOf("--kind ledger-summary");
    expect(del).toBeGreaterThan(-1);
    expect(reviews).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(-1);
    expect(reviews).toBeLessThan(del);
    expect(summary).toBeLessThan(del);
  });
  it("brainstorming states the key rule before the attach block and the attachment name", () => {
    const t = skill("brainstorming");
    const at = t.indexOf("attach-record --task");
    expect(t.slice(0, at)).toMatch(/\^\(\[A-Za-z\]\+-\[0-9\]\+\)\(__\|-\|\$\)/);
    expect(t).toContain("the attachment takes its file's name; a `design.html` spec attaches as `design.html`");
  });
  it("finishing names the snapshot file per case", () => {
    const t = skill("finishing-a-development-branch");
    expect(t).toContain("`<ticket>.tokens.json`");
    expect(t).not.toMatch(/<snapshot path>\/tokens\.json/);
  });
  it("report-implementation attaches report.html after Step 4a", () => {
    const t = skill("report-implementation");
    const attach = t.indexOf("attach-record --task <Key> --file <target folder>/report.html");
    const step4a = t.indexOf("### Step 4a");
    expect(attach).toBeGreaterThan(-1);
    expect(step4a).toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(step4a);
  });
  it("no skill points at DGS-488 for the status flow", () => {
    for (const n of new Set(hooks.map((h) => h[0]))) expect(skill(n)).not.toMatch(/DGS-488/);
  });
});
