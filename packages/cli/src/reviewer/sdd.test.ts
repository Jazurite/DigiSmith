import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const sdd = fs.readFileSync(path.join(ROOT, "skills/subagent-driven-development/SKILL.md"), "utf8");

describe("SDD keeps the old path (hand mode)", () => {
  const anchors = [
    "Generate review package, dispatch task reviewer (./task-reviewer-prompt.md)",
    "Dispatch final code reviewer (../requesting-code-review/code-reviewer.md)",
    "dispatch a task reviewer without a diff file.",
    "Never fix findings yourself in the controller session",
    "dispatch ONE fix subagent",
    "Do not pause to check in with your human partner between tasks.",
    "`final-reviewer`",
  ];
  for (const a of anchors) it(`still contains: ${a}`, () => expect(sdd).toContain(a));
});

describe("SDD has the role-mode path (new)", () => {
  it("passes --ticket <KEY> in every pack command and says where the key comes from", () => {
    const lines = sdd.split("\n").filter((l) => l.includes("dg reviewer pack --type"));
    expect(lines.length).toBe(4);
    for (const l of lines) expect(l).toContain("--ticket <KEY>");
    expect(sdd).toMatch(/`<KEY>` is the `\*\*Key:\*\*` line of the ticket's `ticket\.md`/);
    expect(sdd).toContain("or `none`");
  });

  it("records the mode at setup with the script", () => {
    expect(sdd).toContain("scripts/review-mode");
    expect(sdd).toContain("Review mode: role");
    expect(sdd).toContain("Review mode: hand");
  });
  it("has a Role Mode section before the Final Review section", () => {
    const role = sdd.indexOf("## Role Mode (a herdr Builder)");
    expect(role).toBeGreaterThan(-1);
    expect(role).toBeLessThan(sdd.indexOf("## Final Review"));
  });
  it("names both markers, both ledger lines and the pack command", () => {
    for (const s of [
      "STOP: task-review-ready", "STOP: ticket-review-ready",
      "Task <N>: review requested", "Task final: review requested",
      "dg reviewer pack", "Review ticket final r<R>: F<n> ->",
    ]) expect(sdd).toContain(s);
  });
  it("says a Builder never starts or runs a review in role mode", () => {
    expect(sdd).toMatch(/never (starts|dispatches) or runs a review|never starts a review/);
  });
  it("tells the Builder to pass commit hashes, not ref names (F1)", () => {
    expect(sdd).toContain("git rev-parse --short HEAD");
    expect(sdd).toMatch(/Never use a ref\s+name like `HEAD`/);
  });
  it("gives full re-review pack examples for task and ticket (F2)", () => {
    expect(sdd).toContain("--findings-in");
    expect(sdd).toContain("--fix-base");
    expect(sdd).toContain("--type ticket --ticket <KEY> --round 2");
    expect(sdd).toContain("findings-<type>-<id>-r<R>.md");
    expect(sdd).toContain("final-fix-report.md");
  });
  it("treats a ledger without a Review mode line as hand (F4)", () => {
    expect(sdd).toMatch(/without a `Review mode:` (second )?line is treated as `hand`/);
  });
  it("explains r<R> in a verdict line is the pack round (F5)", () => {
    expect(sdd).toMatch(/round of the\s+review pack that raised the finding/);
  });
  it("tells the Builder to write the Final review lines report-implementation reads (DGS-570)", () => {
    const start = sdd.indexOf("## Role Mode (a herdr Builder)");
    const end = sdd.indexOf("## Final Review");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const role = sdd.slice(start, end);
    for (const s of [
      "**Final review lines.**",
      "Final review (base <MERGE_BASE>..<HEAD>, <model>):",
      "Scoped re-review (fix base <FIX_BASE>..<HEAD>, <model>):",
      "Final review: parked — F<n>",
      "`model:` line",
    ]) expect(role).toContain(s);
    expect(role.indexOf("**Final review lines.**")).toBeGreaterThan(role.indexOf("**Verdict lines.**"));
    expect(role.indexOf("**Final review lines.**")).toBeLessThan(role.indexOf("**Waiting is the rule here.**"));
  });
});
