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
});
